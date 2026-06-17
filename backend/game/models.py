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
    STATUS_PROMPT   = "prompt"
    STATUS_CHOICES  = [
        (STATUS_WAITING,  "Waiting"),
        (STATUS_BIDDING,  "Bidding"),
        (STATUS_PLAYING,  "Playing"),
        (STATUS_FINISHED, "Finished"),
        (STATUS_PROMPT,   "Prompt"),
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
    start_round    = models.PositiveSmallIntegerField(default=1)
    current_round  = models.PositiveSmallIntegerField(default=0)
    max_rounds     = models.PositiveSmallIntegerField(default=0)
    trump_suit     = models.CharField(max_length=10, blank=True)
    trump_card     = models.JSONField(default=dict, blank=True, null=True)
    current_player_index = models.PositiveSmallIntegerField(default=0)
    lead_player_index    = models.PositiveSmallIntegerField(default=0)
    # Stored when importing a saved snapshot; consumed (cleared) when host starts
    resume_snapshot = models.JSONField(null=True, blank=True, default=None)
    declared        = models.BooleanField(default=False)  # game ended by mathematical certainty
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
    trump_card      = models.JSONField(default=dict, blank=True, null=True)
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
    trick       = models.ForeignKey(Trick, on_delete=models.CASCADE, related_name="cards")
    player      = models.ForeignKey(Player, on_delete=models.CASCADE)
    suit        = models.CharField(max_length=10)
    rank        = models.CharField(max_length=2)
    deck_id     = models.PositiveSmallIntegerField(default=1)
    play_order  = models.PositiveSmallIntegerField()   # 0 = first played
    hand_before          = models.JSONField(default=list)  # player's full hand before playing
    all_scores_snapshot  = models.JSONField(default=dict)  # {seat: total_score} at moment of play
    all_tricks_snapshot  = models.JSONField(default=dict)  # {seat: tricks_won_this_round} at moment of play
    all_bids_snapshot    = models.JSONField(default=dict)  # {seat: bid} for this round
    team_signal = models.CharField(max_length=20, blank=True, default="")

    class Meta:
        ordering = ["play_order"]


class BidLog(models.Model):
    """Records every bid decision with full context for ML training."""
    game               = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="bid_logs")
    round_number       = models.PositiveSmallIntegerField()
    seat               = models.PositiveSmallIntegerField()
    username           = models.CharField(max_length=50)
    trump_suit         = models.CharField(max_length=10)
    trump_card         = models.JSONField(default=dict, blank=True, null=True)
    hand_snapshot           = models.JSONField(default=list)  # full hand at time of bid
    others_bids_before      = models.JSONField(default=list)  # [{seat, username, bid}, ...]
    bid_made                = models.SmallIntegerField()
    all_scores_before_round = models.JSONField(default=dict)  # {seat: total_score} at round start

    class Meta:
        ordering = ["round_number", "seat"]


class TeamSignalLog(models.Model):
    """Records every team signal sent — at ANY point during the game, not just on your turn."""
    game                          = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="signal_logs")
    round_number                  = models.PositiveSmallIntegerField(default=0)
    trick_number                  = models.PositiveSmallIntegerField(default=0)
    sender_seat                   = models.PositiveSmallIntegerField()
    sender_username               = models.CharField(max_length=50)
    signal                        = models.CharField(max_length=20)
    cards_played_in_trick_at_time = models.PositiveSmallIntegerField(default=0)  # 0=before anyone played

    class Meta:
        ordering = ["round_number", "trick_number", "id"]


class Spectator(models.Model):
    game          = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="spectators")
    username      = models.CharField(max_length=50)
    target_player = models.ForeignKey(
        Player, on_delete=models.SET_NULL, null=True, blank=True, related_name="spectators"
    )
    peek_accepted = models.BooleanField(default=False)
    is_connected  = models.BooleanField(default=False)

    class Meta:
        unique_together = [("game", "username")]

    def __str__(self):
        return f"Spectator {self.username} in {self.game.code}"
