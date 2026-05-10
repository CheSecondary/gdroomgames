import random
from .models import SUITS, RANKS, RANK_VALUE


def build_deck(num_decks: int = 1) -> list[dict]:
    deck = []
    for deck_id in range(1, num_decks + 1):
        for suit in SUITS:
            for rank in RANKS:
                deck.append({"suit": suit, "rank": rank, "deck_id": deck_id})
    random.shuffle(deck)
    return deck


def deal_cards(num_players: int, cards_per_player: int, num_decks: int = 1) -> list[list[dict]]:
    """Deal cards_per_player cards to each player. Extra cards are discarded (shuffled away)."""
    deck = build_deck(num_decks)
    hands = [[] for _ in range(num_players)]
    for i in range(cards_per_player * num_players):
        hands[i % num_players].append(deck[i])
    return hands


def pick_trump() -> str:
    return random.choice(SUITS)


def max_rounds(num_players: int, num_decks: int = 1) -> int:
    """Highest round number where every player can receive that many cards from one shuffled deck."""
    return (52 * num_decks) // num_players


def determine_winner(trick_cards: list[dict], lead_suit: str, trump_suit: str) -> int:
    """
    trick_cards: list of {suit, rank, deck_id, play_order, player_index}
    Returns the index into trick_cards of the winning card.

    Priority:
      1. Highest trump card  (tie → first played wins)
      2. If no trump, highest lead-suit card (tie → first played wins)
      3. Any other card cannot win — only trump / lead-suit matter
    """
    trump_cards = [c for c in trick_cards if c["suit"] == trump_suit]
    lead_cards  = [c for c in trick_cards if c["suit"] == lead_suit]

    candidates = trump_cards if trump_cards else lead_cards
    if not candidates:
        candidates = trick_cards   # edge: lead == trump and no card of that suit

    best = None
    for card in candidates:
        if best is None:
            best = card
        else:
            best_val = RANK_VALUE[best["rank"]]
            card_val = RANK_VALUE[card["rank"]]
            if card_val > best_val:
                best = card
            elif card_val == best_val and card["play_order"] < best["play_order"]:
                best = card   # duplicate tie — first played wins

    return trick_cards.index(best)


def _score_one(bid: int, tricks_won: int) -> int:
    """Scoring for a single bid/tricks pair (used for both solo and team scoring)."""
    if bid == 0 and tricks_won == 0:
        return 10                          # bid-zero bonus
    if tricks_won >= bid:
        return 10 * bid + (tricks_won - bid)   # 10 per bid + 1 per overtrick
    return -10 * (bid - tricks_won)            # -10 per miss


def calculate_round_scores(players_data: list[dict]) -> list[int]:
    """
    Solo mode: each player scored individually.
    players_data: [{bid, tricks_won}, ...]  (ordered by seat)
    Returns deltas in same order.
    """
    return [_score_one(p["bid"], p["tricks_won"]) for p in players_data]


def calculate_team_round_scores(teams: list[list[int]], players_data: list[dict]) -> list[int]:
    """
    Teams mode: combined tricks per team compared to team's bid (captain's bid).
    teams: [[captain_seat, teammate_seat, ...], ...]
    players_data: [{seat, bid, tricks_won}, ...] ordered by seat
    Returns deltas in same order as players_data.
    """
    seat_to_idx = {p["seat"]: i for i, p in enumerate(players_data)}
    deltas = [0] * len(players_data)

    for team in teams:
        captain_seat = team[0]
        team_bid     = players_data[seat_to_idx[captain_seat]]["bid"]
        team_tricks  = sum(players_data[seat_to_idx[s]]["tricks_won"] for s in team)
        delta        = _score_one(team_bid, team_tricks)
        for seat in team:
            deltas[seat_to_idx[seat]] = delta

    return deltas


def assign_teams(seats: list[int]) -> list[list[int]]:
    """
    Randomly pair seats into teams of 2.
    Returns [[seat_a, seat_b], [seat_c, seat_d], ...]
    Seats are sorted within each team for determinism.
    """
    shuffled = seats[:]
    random.shuffle(shuffled)
    teams = []
    for i in range(0, len(shuffled), 2):
        pair = sorted(shuffled[i:i + 2])
        teams.append(pair)
    return teams
