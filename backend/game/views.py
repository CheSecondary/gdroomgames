import json
import os
import random
import string
import time
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from .models import Game, Player, BidLog, TrickCard
from . import engine
from .serializers import GameSerializer


def parse_snapshot(content: str) -> dict:
    """
    Parse an OpenSpades export file.
    Supports:
      - v1 snapshot format: single JSON object with "v":1
      - legacy JSONL format: looks for "game_summary" event line (backward compat)

    Returns a normalised snapshot dict ready to store in game.resume_snapshot.
    Raises ValueError with a user-facing message on any parse failure.
    """
    content = content.strip()
    if not content:
        raise ValueError("File is empty.")

    # ── Try v1 snapshot (single JSON object) ──────────────────────────────────
    # It might be the whole file or just the first non-empty line
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            if isinstance(obj, dict) and obj.get("v") == 1:
                players = obj.get("players", [])
                if not players:
                    raise ValueError("No player data found in snapshot.")
                return obj   # already the full snapshot — pass through as-is
        except json.JSONDecodeError:
            pass
        break   # only try the first non-empty line for v1

    # ── Fall back to legacy JSONL (game_summary event) ────────────────────────
    summary = None
    for line in content.splitlines():
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
            "Could not parse the export file. "
            "Make sure you uploaded an OpenSpades .json or .jsonl file."
        )

    players = summary.get("players", [])
    if not players:
        raise ValueError("No player data found in the export.")

    players_sorted = sorted(players, key=lambda p: p["seat"])
    resume_from    = summary.get("total_rounds", 1)
    max_rounds     = summary.get("max_rounds", resume_from)
    num_players    = len(players_sorted)

    # Estimate lead player for this round: rotates each round starting from 0
    lead_player_index = (resume_from - summary.get("start_round", 1)) % num_players

    # Convert legacy format → v1 snapshot shape (status = "waiting" → host starts fresh round)
    return {
        "v":                          1,
        "code":                       summary.get("game_code", ""),
        "saved_at":                   None,
        "status":                     "waiting",   # legacy exports = clean resume, deal fresh
        "num_decks":                  summary.get("num_decks", 1),
        "teams_enabled":              summary.get("teams_enabled", False),
        "teams":                      summary.get("teams", []),
        "start_round":                resume_from,
        "current_round":              resume_from,
        "max_rounds":                 max_rounds,
        "lead_player_index":          lead_player_index,
        "current_player_index":       lead_player_index,
        "trump_suit":                 "",
        "trump_card":                 None,
        "players": [
            {
                "seat":        p["seat"],
                "username":    p["username"],
                "total_score": p.get("final_score", 0),
                "hand":        [],
                "bid":         -1,
                "tricks_won":  0,
            }
            for p in players_sorted
        ],
        "current_trick":               [],
        "trick_lead_suit":             "",
        "tricks_completed_this_round": 0,
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
        caller  = request.data.get("username", "").strip()[:50]
        content = request.data.get("content", "")

        if not caller:
            return Response({"error": "Username required."}, status=400)
        if not content:
            return Response({"error": "Export file content required."}, status=400)

        try:
            snap = parse_snapshot(content)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        players = snap["players"]   # [{seat, username, total_score, hand, bid, tricks_won}]

        # Try to reuse old room code; fall back to a fresh one
        old_code = snap.get("code", "").upper()
        if old_code and not Game.objects.filter(code=old_code).exists():
            code = old_code
        else:
            code = gen_code()

        # Original host = seat 0 (CreateGameView always puts the host at seat 0)
        original_host = next((p["username"] for p in players if p["seat"] == 0), players[0]["username"])

        game = Game.objects.create(
            code             = code,
            host_username    = original_host,
            status           = Game.STATUS_WAITING,
            num_decks        = snap["num_decks"],
            teams_enabled    = snap["teams_enabled"],
            expected_players = len(players),
            # Round metadata from snapshot — used if status is "waiting" (clean resume)
            start_round      = snap["current_round"],
            current_round    = snap["current_round"],
            max_rounds       = snap["max_rounds"],
            # Store the full snapshot — consumed by handle_start_game to restore exact state
            resume_snapshot  = snap,
        )

        # Pre-create all player slots with correct seats and carry-over scores.
        # Hands/bids/tricks_won will be restored from snapshot when host starts.
        for p in players:
            Player.objects.create(
                game        = game,
                username    = p["username"],
                seat        = p["seat"],
                total_score = p["total_score"],
            )

        snap_status = snap.get("status", "waiting")
        return Response({
            "code":          code,
            "original_code": old_code,
            "same_code":     code == old_code,
            "snap_status":   snap_status,
            "current_round": snap["current_round"],
            "max_rounds":    snap["max_rounds"],
            "num_decks":     snap["num_decks"],
            "teams_enabled": snap["teams_enabled"],
            "players":       players,
        }, status=status.HTTP_201_CREATED)


class RoundHistoryView(APIView):
    """Return per-round bid+tricks_won for every player in a game, built from DB records."""
    permission_classes = [AllowAny]

    def get(self, request, code):
        try:
            game = Game.objects.get(code=code.upper())
        except Game.DoesNotExist:
            return Response({"error": "Game not found."}, status=404)

        # Bids per round per seat from BidLog
        bids = {}  # {round_number: {seat: bid}}
        for bl in BidLog.objects.filter(game=game).order_by("round_number", "seat"):
            bids.setdefault(bl.round_number, {})[bl.seat] = bl.bid_made

        # tricks_won per round per seat — take the last TrickCard of each round
        # which has the final all_tricks_snapshot for that round
        tricks = {}  # {round_number: {seat: tricks_won}}
        for tc in TrickCard.objects.filter(trick__round__game=game).select_related("trick__round").order_by("trick__round__number", "trick__number", "id"):
            rnum = tc.trick.round.number
            if tc.all_tricks_snapshot:
                tricks[rnum] = {int(k): v for k, v in tc.all_tricks_snapshot.items()}

        # Build player map: seat → (username, team_index)
        players_qs = list(game.players.all())
        seat_to_user = {p.seat: p.username for p in players_qs}
        teams = game.teams or []
        seat_to_team = {}
        for ti, team_seats in enumerate(teams):
            for s in team_seats:
                seat_to_team[s] = ti

        rounds = []
        for rnum in sorted(set(list(bids.keys()) + list(tricks.keys()))):
            round_bids   = bids.get(rnum, {})
            round_tricks = tricks.get(rnum, {})

            # Build players_data for engine scoring
            players_data = [
                {"seat": seat, "bid": round_bids.get(seat, 0), "tricks_won": round_tricks.get(seat, 0)}
                for seat in sorted(seat_to_user.keys())
            ]

            if game.teams_enabled and teams:
                deltas = engine.calculate_team_round_scores(teams, players_data)
            else:
                deltas = engine.calculate_round_scores(players_data)

            scores = []
            for i, pd in enumerate(players_data):
                seat = pd["seat"]
                scores.append({
                    "username":   seat_to_user[seat],
                    "bid":        round_bids.get(seat, -1),
                    "tricks_won": round_tricks.get(seat, 0),
                    "delta":      deltas[i],
                    "team_index": seat_to_team.get(seat, -1),
                })
            rounds.append({"round": rnum, "scores": scores})

        return Response(rounds)


class ListWaitingGamesView(APIView):
    """Return all games currently in the waiting (lobby) stage."""
    permission_classes = [AllowAny]

    def get(self, request):
        games = Game.objects.filter(status="waiting").order_by("-created_at")
        result = []
        for g in games:
            players = list(g.players.order_by("seat").values_list("username", flat=True))
            result.append({
                "code":             g.code,
                "host":             g.host_username,
                "expected_players": g.expected_players,
                "joined":           len(players),
                "players":          players,
                "teams_enabled":    g.teams_enabled,
            })
        return Response(result)


class AgoraTokenView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        app_id   = os.environ.get("AGORA_APP_ID", "")
        app_cert = os.environ.get("AGORA_APP_CERTIFICATE", "")
        channel  = request.query_params.get("channel", "")
        uid      = int(request.query_params.get("uid", 0))

        if not app_id or not channel:
            return Response({"error": "missing params"}, status=400)

        # If no certificate configured, return null token (App ID only mode)
        if not app_cert:
            return Response({"token": None, "app_id": app_id})

        from agora_token_builder import RtcTokenBuilder
        expire = int(time.time()) + 3600  # 1 hour
        token  = RtcTokenBuilder.buildTokenWithUid(app_id, app_cert, channel, uid, 1, expire)  # 1 = publisher
        return Response({"token": token, "app_id": app_id})
