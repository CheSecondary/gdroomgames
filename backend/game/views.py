import json
import random
import string
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from .models import Game, Player
from .serializers import GameSerializer


def parse_export_jsonl(content: str) -> dict:
    """
    Parse an OpenSpades JSONL export and return resume info.
    Raises ValueError with a user-facing message on any parse failure.
    Only needs the game_summary line — everything is in there.
    """
    summary = None
    for line in content.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("event") == "game_summary":
            summary = event
            break

    if not summary:
        raise ValueError(
            "Could not find game_summary in the export. "
            "Make sure you uploaded the correct .jsonl file."
        )

    players = summary.get("players", [])
    if not players:
        raise ValueError("No player data found in the export.")

    players_sorted = sorted(players, key=lambda p: p["seat"])
    resume_from    = summary.get("total_rounds", 1)
    max_rounds     = summary.get("max_rounds", resume_from)

    return {
        "old_code":      summary.get("game_code", ""),
        "num_decks":     summary.get("num_decks", 1),
        "teams_enabled": summary.get("teams_enabled", False),
        "max_rounds":    max_rounds,
        "resume_from":   resume_from,
        "players": [
            {
                "seat":     p["seat"],
                "username": p["username"],
                "score":    p.get("final_score", 0),
            }
            for p in players_sorted
        ],
    }


def gen_code():
    while True:
        code = "".join(random.choices(string.ascii_uppercase, k=6))
        if not Game.objects.filter(code=code).exists():
            return code


class CreateGameView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username         = request.data.get("username", "").strip()[:50]
        num_decks        = max(1, min(2, int(request.data.get("num_decks", 1))))
        expected_players = max(2, min(8, int(request.data.get("expected_players", 4))))
        teams_enabled    = bool(request.data.get("teams_enabled", False))
        # num_rounds = 0 means "use the formula max at start time"
        num_rounds_raw   = int(request.data.get("num_rounds", 0))
        # Clamp to valid range; 0 stays 0 (= use max)
        abs_max          = (52 * num_decks) // expected_players
        num_rounds       = max(1, min(abs_max, num_rounds_raw)) if num_rounds_raw > 0 else 0
        
        start_round_raw  = int(request.data.get("start_round", 1))
        start_round      = max(1, min(num_rounds if num_rounds > 0 else abs_max, start_round_raw))

        if not username:
            return Response({"error": "Username required."}, status=400)

        # Teams only valid for even player counts ≥ 4
        if expected_players < 4 or expected_players % 2 != 0:
            teams_enabled = False

        game = Game.objects.create(
            code=gen_code(),
            host_username=username,
            num_decks=num_decks,
            expected_players=expected_players,
            teams_enabled=teams_enabled,
            start_round=start_round,
            max_rounds=num_rounds,   # 0 = host didn't pick, use formula at start
        )
        Player.objects.create(game=game, username=username, seat=0)
        return Response(GameSerializer(game).data, status=status.HTTP_201_CREATED)


class JoinGameView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username", "").strip()[:50]
        code     = request.data.get("code", "").upper()
        if not username:
            return Response({"error": "Username required."}, status=400)

        try:
            game = Game.objects.get(code=code)
        except Game.DoesNotExist:
            return Response({"error": "Game not found."}, status=404)

        # Already in this game — allow rejoin at any game status (handles reload)
        if game.players.filter(username=username).exists():
            return Response(GameSerializer(game).data)

        if game.status != Game.STATUS_WAITING:
            players = list(game.players.order_by("seat").values("seat", "username"))
            return Response({
                "game_started": True,
                "game_code": game.code,
                "players": players,
            })

        if game.players.count() >= game.expected_players:
            return Response({"error": f"Room is full (max {game.expected_players} players)."}, status=400)

        # Handle name collision
        base, n = username, 2
        while game.players.filter(username=username).exists():
            username = f"{base}{n}"
            n += 1

        Player.objects.create(game=game, username=username, seat=game.players.count())
        return Response(GameSerializer(game).data)


class GameDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, code):
        try:
            game = Game.objects.get(code=code.upper())
        except Game.DoesNotExist:
            return Response({"error": "Not found."}, status=404)
        return Response(GameSerializer(game).data)


class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"}, status=status.HTTP_200_OK)


class ResumeFromExportView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        host_username = request.data.get("username", "").strip()[:50]
        content       = request.data.get("content", "")

        if not host_username:
            return Response({"error": "Username required."}, status=400)
        if not content:
            return Response({"error": "Export file content required."}, status=400)

        try:
            info = parse_export_jsonl(content)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        players = info["players"]  # [{seat, username, score}]

        # Try to reuse old room code; fall back to a fresh one if it's still in DB
        old_code = info["old_code"].upper()
        if old_code and not Game.objects.filter(code=old_code).exists():
            code = old_code
        else:
            code = gen_code()

        # Original host = player at seat 0 (CreateGameView always assigns seat 0 to host).
        # We deliberately ignore the API caller's username here — whoever runs this tool
        # is just reconstructing the room, they don't become the host.
        original_host = players[0]["username"]  # players already sorted by seat

        game = Game.objects.create(
            code             = code,
            host_username    = original_host,
            status           = Game.STATUS_WAITING,
            num_decks        = info["num_decks"],
            teams_enabled    = info["teams_enabled"],
            expected_players = len(players),
            start_round      = info["resume_from"],
            current_round    = info["resume_from"],
            max_rounds       = info["max_rounds"],
        )

        # Pre-create all player slots with the right seats and carry-over scores.
        # JoinGameView already returns early if a username already has a row in the game,
        # so each original player just needs to join with their exact username.
        for p in players:
            Player.objects.create(
                game        = game,
                username    = p["username"],
                seat        = p["seat"],
                total_score = p["score"],
            )

        return Response({
            "code":             code,
            "original_code":    old_code,
            "same_code":        code == old_code,
            "resume_from_round": info["resume_from"],
            "max_rounds":       info["max_rounds"],
            "num_decks":        info["num_decks"],
            "teams_enabled":    info["teams_enabled"],
            "players":          players,
        }, status=status.HTTP_201_CREATED)
