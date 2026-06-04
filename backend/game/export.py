"""
Game state snapshot export.

Captures the complete game state at any exit point so the game can be
resumed seamlessly — mid-trick, mid-bidding, between rounds, anywhere.

Format: single JSON object (v=1).
"""
import json
import requests
from django.conf import settings
from django.utils import timezone
from .models import Game


def build_game_snapshot(game_code: str) -> dict | None:
    """
    Build a complete state snapshot of the game RIGHT NOW.
    Call this BEFORE changing status to FINISHED so the snapshot
    captures the true in-progress state.
    """
    try:
        game = Game.objects.prefetch_related(
            "players",
            "rounds__tricks__cards__player",
        ).get(code=game_code)
    except Game.DoesNotExist:
        return None

    players_all = sorted(game.players.all(), key=lambda p: p.seat)

    # ── Current round / trick state ───────────────────────────────────────────
    current_trick_data      = []
    trick_lead_suit         = ""
    tricks_completed        = 0

    try:
        cur_round = game.rounds.filter(is_complete=False).order_by("-number").first()
        if cur_round:
            tricks_completed = cur_round.tricks.filter(is_complete=True).count()
            cur_trick = cur_round.tricks.filter(is_complete=False).order_by("-number").first()
            if cur_trick:
                trick_lead_suit = cur_trick.lead_suit or ""
                for tc in cur_trick.cards.select_related("player").order_by("play_order"):
                    current_trick_data.append({
                        "seat":       tc.player.seat,
                        "username":   tc.player.username,
                        "card":       {"suit": tc.suit, "rank": tc.rank, "deck_id": tc.deck_id},
                        "play_order": tc.play_order,
                    })
    except Exception:
        pass

    return {
        "v":                          1,
        "code":                       game.code,
        "saved_at":                   timezone.now().isoformat(),
        # Game state
        "status":                     game.status,
        "num_decks":                  game.num_decks,
        "teams_enabled":              game.teams_enabled,
        "teams":                      game.teams,
        "start_round":                game.start_round,
        "current_round":              game.current_round,
        "max_rounds":                 game.max_rounds,
        "lead_player_index":          game.lead_player_index,
        "current_player_index":       game.current_player_index,
        "trump_suit":                 game.trump_suit,
        "trump_card":                 game.trump_card,
        # Player state (hands, bids, tricks, scores)
        "players": [
            {
                "seat":        p.seat,
                "username":    p.username,
                "total_score": p.total_score,
                "hand":        p.hand,
                "bid":         p.bid,
                "tricks_won":  p.tricks_won,
            }
            for p in players_all
        ],
        # Current trick (empty if between tricks or between rounds)
        "current_trick":               current_trick_data,
        "trick_lead_suit":             trick_lead_suit,
        "tricks_completed_this_round": tricks_completed,
    }


def send_snapshot_to_telegram(snap: dict):
    """Send a pre-built snapshot dict to Telegram."""
    token   = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        return

    game_code = snap.get("code", "UNKNOWN")
    content   = json.dumps(snap, ensure_ascii=False)
    filename  = f"openspades_{game_code}.json"
    players   = ", ".join(p["username"] for p in snap["players"])
    caption   = (
        f"🃏 *OpenSpades Snapshot*\n"
        f"Code: `{game_code}` · R{snap['current_round']}/{snap['max_rounds']}\n"
        f"Status at save: `{snap['status']}`\n"
        f"Players: {players}"
    )

    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendDocument",
            data={"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"},
            files={"document": (filename, content.encode("utf-8"), "application/json")},
            timeout=15,
        )
    except Exception:
        pass  # Never let export failure affect the game
