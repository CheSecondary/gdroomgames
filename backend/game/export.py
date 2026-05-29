"""
Game log export — builds a JSONL training dataset from a completed game
and sends it to Telegram. Every bid decision and card play is captured
with full context (hand, game state, outcome) for future AI training.
"""
import json
import requests
from django.conf import settings
from .models import Game


def build_game_log(game_code: str) -> list:
    try:
        game = Game.objects.prefetch_related(
            "players",
            "rounds__tricks__cards__player",
            "bid_logs",
        ).get(code=game_code)
    except Game.DoesNotExist:
        return []

    events = []

    # ── Game summary ──────────────────────────────────────────────────────────
    players_sorted = sorted(game.players.all(), key=lambda p: p.seat)

    def team_idx(seat):
        for i, t in enumerate(game.teams):
            if seat in t:
                return i
        return -1

    events.append({
        "event":        "game_summary",
        "game_code":    game.code,
        "teams_enabled": game.teams_enabled,
        "teams":        game.teams,
        "num_decks":    game.num_decks,
        "total_rounds": game.current_round,
        "players": [
            {
                "seat":        p.seat,
                "username":    p.username,
                "final_score": p.total_score,
                "team_index":  team_idx(p.seat) if game.teams_enabled else -1,
            }
            for p in players_sorted
        ],
    })

    # ── Bid decisions ─────────────────────────────────────────────────────────
    for bl in game.bid_logs.order_by("round_number", "seat"):
        events.append({
            "event":              "bid_decision",
            "game_code":          game.code,
            "round":              bl.round_number,
            "trump_suit":         bl.trump_suit,
            "trump_card":         bl.trump_card,
            "seat":               bl.seat,
            "username":           bl.username,
            "hand":               bl.hand_snapshot,
            "hand_size":          len(bl.hand_snapshot),
            "others_bids_before": bl.others_bids_before,
            "bid_made":           bl.bid_made,
            "teams_enabled":      game.teams_enabled,
        })

    # ── Card play decisions ───────────────────────────────────────────────────
    for rnd in game.rounds.order_by("number"):
        for trick in rnd.tricks.order_by("number"):
            trick_so_far = []
            for tc in trick.cards.select_related("player").order_by("play_order"):
                p = tc.player
                events.append({
                    "event":          "card_play",
                    "game_code":      game.code,
                    "round":          rnd.number,
                    "trick_num":      trick.number,
                    "trump_suit":     rnd.trump_suit,
                    "trump_card":     rnd.trump_card,
                    "seat":           p.seat,
                    "username":       p.username,
                    "hand_before":    tc.hand_before,
                    "hand_size_before": len(tc.hand_before) if tc.hand_before else 0,
                    "trick_so_far":   list(trick_so_far),
                    "lead_suit":      trick.lead_suit,
                    "play_order":     tc.play_order,  # 0 = led the trick
                    "card_played":    {"suit": tc.suit, "rank": tc.rank, "deck_id": tc.deck_id},
                    "won_trick":      trick.winner_id == p.id if trick.winner_id else False,
                    "team_index":     team_idx(p.seat) if game.teams_enabled else -1,
                    "teams_enabled":  game.teams_enabled,
                })
                trick_so_far.append({
                    "seat":     p.seat,
                    "username": p.username,
                    "card":     {"suit": tc.suit, "rank": tc.rank, "deck_id": tc.deck_id},
                })

    return events


def send_game_log_to_telegram(game_code: str):
    token    = settings.TELEGRAM_BOT_TOKEN
    chat_id  = settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        return

    events = build_game_log(game_code)
    if not events:
        return

    content  = "\n".join(json.dumps(e) for e in events)
    filename = f"openspades_{game_code}.jsonl"

    summary  = next((e for e in events if e["event"] == "game_summary"), {})
    n_plays  = sum(1 for e in events if e["event"] == "card_play")
    n_bids   = sum(1 for e in events if e["event"] == "bid_decision")
    players  = ", ".join(p["username"] for p in summary.get("players", []))
    caption  = (
        f"🃏 *OpenSpades Game Log*\n"
        f"Code: `{game_code}`\n"
        f"Players: {players}\n"
        f"Events: {n_plays} card plays · {n_bids} bids"
    )

    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendDocument",
            data={"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"},
            files={"document": (filename, content.encode("utf-8"), "application/jsonl")},
            timeout=15,
        )
    except Exception:
        pass  # Never let export failure affect the game
