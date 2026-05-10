from rest_framework import serializers
from .models import Game, Player


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Player
        fields = ["seat", "username", "bid", "tricks_won", "total_score", "is_connected"]


class GameSerializer(serializers.ModelSerializer):
    players = PlayerSerializer(many=True, read_only=True)

    class Meta:
        model  = Game
        fields = [
            "id", "code", "host_username", "status",
            "num_decks", "expected_players", "teams_enabled", "teams",
            "current_round", "max_rounds", "trump_suit", "players",
        ]
