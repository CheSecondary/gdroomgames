"""
Game log export — builds a JSONL training dataset from a completed game
and sends it as a file to Telegram.

Every event is self-contained: the ML model needs only that one line
to understand the full situation and what decision was made.

Event types:
  game_summary   — one per game, overall result
  bid_decision   — one per player per round, full hand + context at bid time
                   (includes bid_outcome: did the player actually make it?)
  card_play      — one per card played, full hand + all game state at play time
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

    events      = []
    players_all = sorted(game.players.all(), key=lambda p: p.seat)
    seat_to_user = {p.seat: p.username for p in players_all}

    def team_idx(seat):
        for i, t in enumerate(game.teams):
            if seat in t:
                return i
        return -1

    def team_of(seat):
        idx = team_idx(seat)
        if idx < 0:
            return None
        return {"team_index": idx, "seats": game.teams[idx],
                "usernames": [seat_to_user.get(s, "?") for s in game.teams[idx]]}

    # ── Pre-pass: compute tricks_won per player per round ─────────────────────
    # Used to annotate bid_decision events with the actual round outcome.
    # Structure: round_outcomes[round_number][seat] = tricks_won_int
    round_outcomes: dict[int, dict[int, int]] = {}
    for rnd in game.rounds.prefetch_related("tricks__winner").all():
        tally: dict[int, int] = {p.seat: 0 for p in players_all}
        for trick in rnd.tricks.all():
            if trick.winner_id:
                w_seat = next(
                    (p.seat for p in players_all if p.id == trick.winner_id),
                    None,
                )
                if w_seat is not None:
                    tally[w_seat] = tally.get(w_seat, 0) + 1
        round_outcomes[rnd.number] = tally

    # ── 1. Game summary ───────────────────────────────────────────────────────
    events.append({
        "event":         "game_summary",
        "game_code":     game.code,
        "teams_enabled": game.teams_enabled,
        "teams":         game.teams,
        "num_decks":     game.num_decks,
        "start_round":   game.start_round,
        "total_rounds":  game.current_round,
        "max_rounds":    game.max_rounds,
        "players": [
            {
                "seat":        p.seat,
                "username":    p.username,
                "final_score": p.total_score,
                "team_index":  team_idx(p.seat) if game.teams_enabled else -1,
                "rank":        None,  # filled below
            }
            for p in players_all
        ],
    })
    # Fill rank by score
    ranked = sorted(events[0]["players"], key=lambda p: p["final_score"], reverse=True)
    for i, p in enumerate(ranked):
        p["rank"] = i + 1

    # ── 2. Bid decisions ──────────────────────────────────────────────────────
    for bl in game.bid_logs.order_by("round_number", "seat"):
        scores = bl.all_scores_before_round  # {str(seat): score}
        # Leaderboard position at start of this round
        sorted_seats = sorted(scores, key=lambda s: scores[s], reverse=True)
        my_rank = next((i + 1 for i, s in enumerate(sorted_seats) if int(s) == bl.seat), None)

        my_team = team_of(bl.seat) if game.teams_enabled else None
        team_score = None
        if my_team:
            team_score = sum(scores.get(str(s), 0) for s in my_team["seats"])

        # Round outcome — did this player actually make their bid?
        r_tally     = round_outcomes.get(bl.round_number, {})
        tricks_won  = r_tally.get(bl.seat, None)   # None if round not finished
        if tricks_won is not None and bl.bid_made >= 0:
            if tricks_won == bl.bid_made:
                bid_outcome = "made"        # hit exactly
            elif tricks_won > bl.bid_made:
                bid_outcome = "overtrick"   # won more than bid
            else:
                bid_outcome = "set"         # fell short (lost bid points)
        else:
            bid_outcome = None

        # Team bid outcome
        team_bid_outcome = None
        if my_team and bid_outcome is not None:
            team_tw  = sum(r_tally.get(s, 0)   for s in my_team["seats"])
            team_bid = sum(
                game.bid_logs.filter(round_number=bl.round_number, seat=s)
                             .values_list("bid_made", flat=True)
                             .first() or 0
                for s in my_team["seats"]
            )
            if team_tw == team_bid:
                team_bid_outcome = "made"
            elif team_tw > team_bid:
                team_bid_outcome = "overtrick"
            else:
                team_bid_outcome = "set"

        events.append({
            "event":           "bid_decision",
            "game_code":       game.code,
            # Round context
            "round":           bl.round_number,
            "total_rounds":    game.max_rounds,
            "round_progress":  round(bl.round_number / game.max_rounds, 2),
            "cards_this_round": bl.round_number,   # round N = N cards each
            "is_last_round":   bl.round_number == game.max_rounds,
            "trump_suit":      bl.trump_suit,
            "trump_card":      bl.trump_card,
            # Player identity
            "seat":            bl.seat,
            "username":        bl.username,
            "team":            my_team,
            "teams_enabled":   game.teams_enabled,
            # Hand
            "hand":            bl.hand_snapshot,
            "hand_size":       len(bl.hand_snapshot),
            "spades_in_hand":  sum(1 for c in bl.hand_snapshot if c["suit"] == "spades"),
            "trump_in_hand":   sum(1 for c in bl.hand_snapshot if c["suit"] == bl.trump_suit),
            "aces_in_hand":    sum(1 for c in bl.hand_snapshot if c["rank"] == "A"),
            "kings_in_hand":   sum(1 for c in bl.hand_snapshot if c["rank"] == "K"),
            "high_cards_in_hand": sum(
                1 for c in bl.hand_snapshot if c["rank"] in ("A", "K", "Q", "J")
            ),
            # Standings at round start
            "my_score_before_round":   scores.get(str(bl.seat), 0),
            "my_rank_before_round":    my_rank,
            "total_players":           len(players_all),
            "team_score_before_round": team_score,
            "all_scores_before_round": {
                seat_to_user.get(int(s), s): v for s, v in scores.items()
            },
            # What others bid before me
            "others_bids_before":  bl.others_bids_before,
            "num_already_bid":     len(bl.others_bids_before),
            "sum_bids_before":     sum(b["bid"] for b in bl.others_bids_before),
            # Decision
            "bid_made":        bl.bid_made,
            # Outcome (labelled after round ends — key training signal)
            "tricks_won_this_round":  tricks_won,
            "bid_outcome":            bid_outcome,       # "made" | "overtrick" | "set" | null
            "team_bid_outcome":       team_bid_outcome,  # same, for the whole team
        })

    # ── 3. Card play decisions ────────────────────────────────────────────────
    for rnd in game.rounds.order_by("number"):
        tricks_list = list(rnd.tricks.order_by("number"))
        total_tricks_this_round = rnd.cards_per_player

        for trick in tricks_list:
            trick_cards = list(trick.cards.select_related("player").order_by("play_order"))
            if not trick_cards:
                continue

            lead_seat = trick_cards[0].player.seat

            trick_so_far = []
            for tc in trick_cards:
                p       = tc.player
                scores  = tc.all_scores_snapshot   # {str(seat): score}
                tricks  = tc.all_tricks_snapshot   # {str(seat): tricks_won}
                bids    = tc.all_bids_snapshot     # {str(seat): bid}

                my_bid        = int(bids.get(str(p.seat), -1))
                my_tricks_now = int(tricks.get(str(p.seat), 0))
                my_score_now  = int(scores.get(str(p.seat), 0))

                bid_gap = my_bid - my_tricks_now if my_bid >= 0 else None

                my_team = team_of(p.seat) if game.teams_enabled else None
                team_tricks  = None
                team_bid     = None
                team_bid_gap = None
                if my_team:
                    team_tricks = sum(int(tricks.get(str(s), 0)) for s in my_team["seats"])
                    team_bid    = sum(
                        int(bids.get(str(s), 0))
                        for s in my_team["seats"]
                        if int(bids.get(str(s), -1)) >= 0
                    )
                    team_bid_gap = team_bid - team_tricks if team_bid is not None else None

                # Leaderboard position at this exact moment
                sorted_seats = sorted(scores, key=lambda s: scores[s], reverse=True)
                my_rank = next(
                    (i + 1 for i, s in enumerate(sorted_seats) if int(s) == p.seat),
                    None,
                )

                # Winning card so far in this trick
                winning_card_so_far = None
                if trick_so_far:
                    lead_suit = trick.lead_suit
                    trump     = rnd.trump_suit
                    rank_val  = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,
                                 "9":9,"10":10,"J":11,"Q":12,"K":13,"A":14}
                    def card_power(entry):
                        c = entry["card"]
                        if c["suit"] == trump:
                            return (2, rank_val.get(c["rank"], 0))
                        if c["suit"] == lead_suit:
                            return (1, rank_val.get(c["rank"], 0))
                        return (0, 0)
                    winning_card_so_far = max(trick_so_far, key=card_power)

                # Round outcome for this player (available since game is finished)
                r_tally    = round_outcomes.get(rnd.number, {})
                rnd_tricks = r_tally.get(p.seat, None)
                if rnd_tricks is not None and my_bid >= 0:
                    if rnd_tricks == my_bid:
                        round_bid_outcome = "made"
                    elif rnd_tricks > my_bid:
                        round_bid_outcome = "overtrick"
                    else:
                        round_bid_outcome = "set"
                else:
                    round_bid_outcome = None

                events.append({
                    "event":          "card_play",
                    "game_code":      game.code,
                    # Round context
                    "round":          rnd.number,
                    "total_rounds":   game.max_rounds,
                    "round_progress": round(rnd.number / game.max_rounds, 2),
                    "is_last_round":  rnd.number == game.max_rounds,
                    "trump_suit":     rnd.trump_suit,
                    "trump_card":     rnd.trump_card,
                    "cards_per_player": rnd.cards_per_player,
                    # Trick context
                    "trick_num":      trick.number,
                    "total_tricks_this_round": total_tricks_this_round,
                    "trick_progress": round(trick.number / total_tricks_this_round, 2),
                    "is_last_trick":  trick.number == total_tricks_this_round,
                    "lead_suit":      trick.lead_suit,
                    "lead_seat":      lead_seat,
                    "lead_username":  seat_to_user.get(lead_seat),
                    "i_am_leading":   tc.play_order == 0,
                    "play_order":     tc.play_order,   # 0=first, N-1=last
                    "players_after_me": rnd.cards_per_player - tc.play_order - 1,
                    "trick_so_far":   list(trick_so_far),
                    "winning_so_far": winning_card_so_far,
                    # Player identity
                    "seat":           p.seat,
                    "username":       p.username,
                    "team":           my_team,
                    "teams_enabled":  game.teams_enabled,
                    "total_players":  len(players_all),
                    # Player state at this exact moment
                    "hand_before":    tc.hand_before,
                    "hand_size":      len(tc.hand_before) if tc.hand_before else 0,
                    "trump_in_hand":  sum(1 for c in (tc.hand_before or []) if c["suit"] == rnd.trump_suit),
                    "spades_in_hand": sum(1 for c in (tc.hand_before or []) if c["suit"] == "spades"),
                    "high_cards_in_hand": sum(
                        1 for c in (tc.hand_before or [])
                        if c["rank"] in ("A", "K", "Q", "J")
                    ),
                    "my_bid":         my_bid,
                    "my_tricks_won":  my_tricks_now,
                    "bid_gap":        bid_gap,    # positive=need more, 0=made bid, negative=overtrick
                    "my_score":       my_score_now,
                    "my_rank":        my_rank,
                    # Team state
                    "team_bid":       team_bid,
                    "team_tricks":    team_tricks,
                    "team_bid_gap":   team_bid_gap,
                    # All players snapshot (full picture at this exact moment)
                    "all_players": [
                        {
                            "seat":       int(s),
                            "username":   seat_to_user.get(int(s), "?"),
                            "score":      int(scores.get(s, 0)),
                            "bid":        int(bids.get(s, -1)),
                            "tricks_won": int(tricks.get(s, 0)),
                            "bid_gap":    (
                                int(bids.get(s, -1)) - int(tricks.get(s, 0))
                                if int(bids.get(s, -1)) >= 0 else None
                            ),
                            "team_index": team_idx(int(s)) if game.teams_enabled else -1,
                        }
                        for s in sorted(scores.keys(), key=int)
                    ],
                    # Decision
                    "card_played":  {"suit": tc.suit, "rank": tc.rank, "deck_id": tc.deck_id},
                    "won_trick":    trick.winner_id == p.id if trick.winner_id else False,
                    # Round outcome (labelled — key training signal)
                    "tricks_won_this_round": rnd_tricks,
                    "round_bid_outcome":     round_bid_outcome,  # "made"|"overtrick"|"set"|null
                })

                trick_so_far.append({
                    "seat":     p.seat,
                    "username": p.username,
                    "card":     {"suit": tc.suit, "rank": tc.rank, "deck_id": tc.deck_id},
                })

    return events


def send_game_log_to_telegram(game_code: str):
    token   = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        return

    events = build_game_log(game_code)
    if not events:
        return

    content  = "\n".join(json.dumps(e, ensure_ascii=False) for e in events)
    filename = f"openspades_{game_code}.jsonl"

    summary  = next((e for e in events if e["event"] == "game_summary"), {})
    n_plays  = sum(1 for e in events if e["event"] == "card_play")
    n_bids   = sum(1 for e in events if e["event"] == "bid_decision")
    players  = ", ".join(p["username"] for p in summary.get("players", []))
    rounds   = summary.get("total_rounds", "?")
    caption  = (
        f"🃏 *OpenSpades Game Log*\n"
        f"Code: `{game_code}` · {rounds} rounds\n"
        f"Players: {players}\n"
        f"Events: {n_plays} card plays · {n_bids} bids · {len(events)} total"
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
