import uuid
from django.db import models


SUITS = ["spades", "hearts", "diamonds", "clubs"]
RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
RANK_VALUE = {r: i for i, r in enumerate(RANKS)}  # 2=0 … A=12


class Game(models.Model):
    STATUS_WAITING  = "waiting"
    STATUS_BIDDING  = "bidding"
    STATUS_PLAYING  = "playing"
    STATUS_FINISHED = "finished"
    STATUS_CHOICES  = [
        (STATUS_WAITING,  "Waiting"),
        (STATUS_BIDDING,  "Bidding"),
        (STATUS_PLAYING,  "Playing"),
        (STATUS_FINISHED, "Finished"),
    ]

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code           = models.CharField(max_length=6, unique=True)
    host_username  = models.CharField(max_length=50)
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_WAITING)
    # Config chosen at creation
    num_decks      = models.PositiveSmallIntegerField(default=1)
    expected_players = models.PositiveSmallIntegerField(default=7)   # how many players host wants
    teams_enabled  = models.BooleanField(default=False)
    # Assigned at game start
    teams          = models.JSONField(default=list)   # [[captain_seat, teammate_seat], ...]
    # Round tracking
    current_round  = models.PositiveSmallIntegerField(default=0)
    max_rounds     = models.PositiveSmallIntegerField(default=0)
    trump_suit     = models.CharField(max_length=10, blank=True)
    current_player_index = models.PositiveSmallIntegerField(default=0)
    lead_player_index    = models.PositiveSmallIntegerField(default=0)
    created_at     = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Game {self.code} ({self.status})"


class Player(models.Model):
    game         = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="players")
    username     = models.CharField(max_length=50)
    seat         = models.PositiveSmallIntegerField()
    hand         = models.JSONField(default=list)   # [{suit, rank, deck_id}, ...]
    bid          = models.SmallIntegerField(default=-1)   # -1 = not yet bid
    tricks_won   = models.PositiveSmallIntegerField(default=0)
    total_score  = models.IntegerField(default=0)
    is_connected = models.BooleanField(default=False)

    class Meta:
        unique_together = [("game", "seat"), ("game", "username")]
        ordering = ["seat"]

    def __str__(self):
        return f"{self.username} seat {self.seat}"


class Round(models.Model):
    game            = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="rounds")
    number          = models.PositiveSmallIntegerField()
    trump_suit      = models.CharField(max_length=10)
    cards_per_player = models.PositiveSmallIntegerField()
    is_complete     = models.BooleanField(default=False)

    class Meta:
        ordering = ["number"]


class Trick(models.Model):
    round      = models.ForeignKey(Round, on_delete=models.CASCADE, related_name="tricks")
    number     = models.PositiveSmallIntegerField()
    lead_suit  = models.CharField(max_length=10, blank=True)
    winner     = models.ForeignKey(
        Player, on_delete=models.SET_NULL, null=True, blank=True, related_name="tricks_won_set"
    )
    is_complete = models.BooleanField(default=False)

    class Meta:
        ordering = ["number"]


class TrickCard(models.Model):
    trick      = models.ForeignKey(Trick, on_delete=models.CASCADE, related_name="cards")
    player     = models.ForeignKey(Player, on_delete=models.CASCADE)
    suit       = models.CharField(max_length=10)
    rank       = models.CharField(max_length=2)
    deck_id    = models.PositiveSmallIntegerField(default=1)
    play_order = models.PositiveSmallIntegerField()   # 0 = first played

    class Meta:
        ordering = ["play_order"]
