import random
import string
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from .models import Game, Player
from .serializers import GameSerializer


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
        expected_players = max(2, min(7, int(request.data.get("expected_players", 4))))
        teams_enabled    = bool(request.data.get("teams_enabled", False))
        # num_rounds = 0 means "use the formula max at start time"
        num_rounds_raw   = int(request.data.get("num_rounds", 0))
        # Clamp to valid range; 0 stays 0 (= use max)
        abs_max          = (52 * num_decks) // expected_players
        num_rounds       = max(1, min(abs_max, num_rounds_raw)) if num_rounds_raw > 0 else 0

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
            return Response({"error": "Game has already started."}, status=400)

        if game.players.count() >= 7:
            return Response({"error": "Room is full (max 7 players)."}, status=400)

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
