import json
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Game, Player, Round, Trick, TrickCard, Spectator, BidLog
from . import engine


# ── Helpers ───────────────────────────────────────────────────────────────────

def captain_seats(game) -> set[int]:
    """Seats that are team captains (place the bid for their team)."""
    return {t[0] for t in game.teams} if game.teams_enabled else set()


def team_index_for_seat(game, seat: int) -> int:
    for i, team in enumerate(game.teams):
        if seat in team:
            return i
    return -1


def find_next_idx(current: int, n: int, predicate) -> int:
    """Walk clockwise from current+1 until predicate is True. Return -1 if none."""
    for i in range(1, n + 1):
        idx = (current + i) % n
        if predicate(idx):
            return idx
    return -1


# ── Consumer ──────────────────────────────────────────────────────────────────

class GameConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.game_code  = self.scope["url_route"]["kwargs"]["game_code"]
        self.room_group = f"game_{self.game_code}"
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        self.username   = (qs.get("username", ["Anonymous"])[0])[:50].strip() or "Anonymous"
        spectate_seat   = qs.get("spectate", [None])[0]

        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

        # Determine if this connection is a spectator (game started + not a player)
        self.is_spec = await self.detect_spectator(spectate_seat)
        await self.set_connected(True)
        await self.broadcast_state()

    async def disconnect(self, code):
        await self.set_connected(False)
        await self.channel_layer.group_discard(self.room_group, self.channel_name)
        await self.broadcast_state()

    async def receive(self, text_data):
        data = json.loads(text_data)
        handlers = {
            "start_game":       self.handle_start_game,
            "place_bid":        self.handle_place_bid,
            "play_card":        self.handle_play_card,
            "end_game":         self.handle_end_game,
            "cancel_game":      self.handle_cancel_game,
            "send_chat":        self.handle_send_chat,
            "extend_game":      self.handle_extend_game,
            "finish_game":      self.handle_finish_game,
            "request_peek":     self.handle_request_peek,
            "accept_peek":      self.handle_accept_peek,
            "decline_peek":     self.handle_decline_peek,
            "request_takeover": self.handle_request_takeover,
            "accept_takeover":  self.handle_accept_takeover,
            "decline_takeover": self.handle_decline_takeover,
        }
        handler = handlers.get(data.get("action"))
        if handler:
            await handler(data)

    # ── Actions ───────────────────────────────────────────────────────────────

    async def handle_start_game(self, data):
        game = await self.get_game()
        if game.host_username != self.username or game.status != Game.STATUS_WAITING:
            return
        players = await self.get_players(game)
        if len(players) < 2:
            await self.send_error("Need at least 2 players to start.")
            return

        actual_max = engine.max_rounds(len(players), game.num_decks)
        # game.max_rounds is set to the host's choice at creation (0 = use formula)
        chosen = game.max_rounds
        max_r  = min(chosen, actual_max) if chosen > 0 else actual_max

        # Assign teams only if enabled AND player count is valid (even, ≥ 4)
        teams_valid = game.teams_enabled and len(players) >= 4 and len(players) % 2 == 0
        teams = engine.assign_teams([p.seat for p in players]) if teams_valid else []

        await self.db_start_game(game, max_r, teams, teams_enabled=teams_valid)
        await self.start_new_round(game)

    async def handle_place_bid(self, data):
        game = await self.get_game()
        if game.status != Game.STATUS_BIDDING:
            return
        player = await self.get_current_player_for_user(game)
        if player is None:
            return

        bid = int(data.get("bid", 0))
        if bid < 0 or bid > game.current_round:
            await self.send_error(f"Bid must be 0–{game.current_round}.")
            return

        await self.db_set_bid(game, player, bid)

        # In teams mode, copy the captain's bid to all teammates so everyone sees it
        if game.teams_enabled:
            await self.db_copy_bid_to_teammates(game, player)

        await self.advance_bid_turn(game)

    async def handle_play_card(self, data):
        game = await self.get_game()
        if game.status != Game.STATUS_PLAYING:
            return
        player = await self.get_current_player_for_user(game)
        if player is None:
            return

        card = data.get("card")
        if not card:
            return

        valid, reason = await self.validate_card_play(game, player, card)
        if not valid:
            await self.send_error(reason)
            return

        await self.db_play_card(game, player, card)
        await self.advance_play_turn(game)

    async def handle_end_game(self, data):
        game = await self.get_game()
        if game.host_username != self.username:
            await self.send_error("Only the host can end the game.")
            return
        if game.status == Game.STATUS_FINISHED:
            return
        await self.db_update_game(game, status=Game.STATUS_FINISHED)
        await self.broadcast_state()
        await self.trigger_export(game.code)

    async def handle_cancel_game(self, data):
        game = await self.get_game()
        if game.host_username != self.username or game.status != Game.STATUS_WAITING:
            return
        
        # Broadcast cancellation so clients are kicked to lobby
        await self.channel_layer.group_send(
            self.room_group, {"type": "game_cancelled"}
        )
        await self.db_delete_game(game)

    async def handle_send_chat(self, data):
        message = data.get("message", "").strip()[:200]
        if not message:
            return
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "chat_message_msg",
                "username": self.username,
                "message": message,
                "is_spectator": self.is_spec,
            }
        )

    async def handle_request_peek(self, data):
        if not self.is_spec:
            return
        target_seat = data.get("target_seat")
        if target_seat is None:
            return
        spec = await self.db_get_or_create_spectator()
        target = await self.db_get_player_by_seat(target_seat)
        if target is None:
            return
        await self.db_update_spectator(spec, target_player=target, peek_accepted=False)
        # Notify only the target player's client
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "peek_requested_msg",
                "spectator": self.username,
                "target_seat": target_seat,
                "target_username": target.username,
            }
        )

    async def handle_accept_peek(self, data):
        spectator_username = data.get("spectator")
        if not spectator_username:
            return
        spec = await self.db_get_spectator_by_username(spectator_username)
        if spec is None:
            return
        await self.db_update_spectator(spec, peek_accepted=True)
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "peek_response_msg",
                "spectator": spectator_username,
                "accepted": True,
                "target_seat": spec.target_player.seat if spec.target_player else None,
            }
        )

    async def handle_decline_peek(self, data):
        spectator_username = data.get("spectator")
        if not spectator_username:
            return
        spec = await self.db_get_spectator_by_username(spectator_username)
        if spec is None:
            return
        await self.db_update_spectator(spec, peek_accepted=False, target_player=None)
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "peek_response_msg",
                "spectator": spectator_username,
                "accepted": False,
                "target_seat": None,
            }
        )

    async def handle_request_takeover(self, data):
        if not self.is_spec:
            return
        target_seat = data.get("target_seat")
        if target_seat is None:
            return
        target = await self.db_get_player_by_seat(target_seat)
        if target is None:
            return
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "takeover_requested_msg",
                "requester": self.username,
                "target_seat": target_seat,
                "target_username": target.username,
            }
        )

    async def handle_accept_takeover(self, data):
        requester = data.get("requester")
        if not requester:
            return
        player = await self.db_get_player_by_username(self.username)
        if player is None:
            return
        old_username = player.username
        seat = player.seat
        await self.db_rename_player(player, requester)
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "ownership_transferred_msg",
                "from_username": old_username,
                "to_username": requester,
                "seat": seat,
            }
        )
        await self.broadcast_state()

    async def handle_decline_takeover(self, data):
        requester = data.get("requester")
        if not requester:
            return
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "takeover_response_msg",
                "requester": requester,
                "accepted": False,
            }
        )

    async def handle_extend_game(self, data):
        game = await self.get_game()
        if game.host_username != self.username:
            await self.send_error("Only the host can extend the game.")
            return
        if game.status != Game.STATUS_PROMPT:
            return

        players = await self.get_players(game)
        actual_max = engine.max_rounds(len(players), game.num_decks)
        if game.max_rounds >= actual_max:
            await self.send_error("Reached maximum possible rounds.")
            return

        # Increment max_rounds and start next round
        new_lead = (game.lead_player_index + 1) % len(players)
        await self.db_update_game(
            game,
            max_rounds=game.max_rounds + 1,
            current_round=game.current_round + 1,
            lead_player_index=new_lead,
        )
        await self.start_new_round(game)

    async def handle_finish_game(self, data):
        game = await self.get_game()
        if game.host_username != self.username:
            await self.send_error("Only the host can end the game.")
            return
        if game.status != Game.STATUS_PROMPT:
            return

        await self.db_update_game(game, status=Game.STATUS_FINISHED)
        await self.broadcast_state()
        await self.trigger_export(game.code)

    # ── Flow ──────────────────────────────────────────────────────────────────

    async def start_new_round(self, game):
        game    = await self.get_game()
        players = await self.get_players(game)
        hands, trump_card = engine.deal_cards(len(players), game.current_round, game.num_decks)
        trump_suit = trump_card["suit"]

        await self.db_create_round(game, trump_card, game.current_round)
        await self.db_deal_hands(players, hands)
        await self.db_reset_bids_and_tricks(players)

        # First bidder: in teams mode lead_player_index's team captain starts bidding;
        # in solo mode it's just the lead player.
        if game.teams_enabled and game.teams:
            lead_team_idx = team_index_for_seat(game, game.lead_player_index)
            first_bid_idx = game.teams[lead_team_idx][0]
        else:
            first_bid_idx = game.lead_player_index

        await self.db_update_game(
            game,
            status=Game.STATUS_BIDDING,
            trump_suit=trump_suit,
            trump_card=trump_card,
            current_player_index=first_bid_idx,
        )
        await self.broadcast_state()

    async def advance_bid_turn(self, game):
        game    = await self.get_game()
        players = await self.get_players(game)

        if game.teams_enabled and game.teams:
            caps = captain_seats(game)
            # Find next captain who still needs to bid
            next_idx = find_next_idx(
                game.current_player_index,
                len(players),
                lambda i: players[i].seat in caps and players[i].bid < 0,
            )
            if next_idx == -1:
                # All captains have bid → play starts with the player clockwise after the lead player of this round.
                play_first_seat = (game.lead_player_index + 1) % len(players)
                await self.db_update_game(
                    game, status=Game.STATUS_PLAYING,
                    current_player_index=play_first_seat,
                )
                await self.db_create_trick(game)
            else:
                await self.db_update_game(game, current_player_index=next_idx)
        else:
            all_bid = all(p.bid >= 0 for p in players)
            if all_bid:
                play_first = (game.lead_player_index + 1) % len(players)
                await self.db_update_game(
                    game, status=Game.STATUS_PLAYING,
                    current_player_index=play_first,
                )
                await self.db_create_trick(game)
            else:
                nxt = (game.current_player_index + 1) % len(players)
                await self.db_update_game(game, current_player_index=nxt)

        await self.broadcast_state()

    async def advance_play_turn(self, game):
        game    = await self.get_game()
        players = await self.get_players(game)
        trick   = await self.get_current_trick(game)
        cards   = await self.get_trick_cards(trick)

        if len(cards) < len(players):
            nxt = (game.current_player_index + 1) % len(players)
            await self.db_update_game(game, current_player_index=nxt)
            await self.broadcast_state()
            return

        # ── Trick complete ──
        trick_data = [
            {
                "suit": c.suit, "rank": c.rank, "deck_id": c.deck_id,
                "play_order": c.play_order,
                "player_index": await self.get_player_seat(c.player_id),
            }
            for c in cards
        ]
        win_idx      = engine.determine_winner(trick_data, trick.lead_suit, game.trump_suit)
        winning_seat = trick_data[win_idx]["player_index"]
        winner       = next(p for p in players if p.seat == winning_seat)

        # Broadcast state so everyone sees the final card on the table
        await self.broadcast_state()

        # Send trick winner notification so UI can show "X won the trick"
        await self.channel_layer.group_send(
            self.room_group,
            {"type": "trick_winner_msg", "winner": winner.username, "seat": winning_seat}
        )

        import asyncio
        asyncio.create_task(self.delayed_next_trick(game.code, trick.id, winner.id))

    async def delayed_next_trick(self, game_code, trick_id, winner_id):
        import asyncio
        await asyncio.sleep(2.5)

        game = await self.get_game_by_code(game_code)
        trick = await self.get_trick_by_id(trick_id)
        winner = await self.get_player_by_id(winner_id)

        await self.db_complete_trick(trick, winner)

        fresh = await self.get_players(game)
        if any(len(p.hand) > 0 for p in fresh):
            await self.db_update_game(game, current_player_index=winner.seat)
            await self.db_create_trick(game)
            await self.broadcast_state()
        else:
            await self.end_round(game, fresh)

    async def end_round(self, game, players):
        players_data = [{"seat": p.seat, "bid": p.bid, "tricks_won": p.tricks_won} for p in players]

        if game.teams_enabled and game.teams:
            deltas = engine.calculate_team_round_scores(game.teams, players_data)
        else:
            deltas = engine.calculate_round_scores(players_data)

        # Broadcast summary BEFORE resetting
        summary = [
            {
                "username": p.username,
                "bid":        p.bid,
                "tricks_won": p.tricks_won,
                "delta":      d,
                "team_index": team_index_for_seat(game, p.seat),
            }
            for p, d in zip(players, deltas)
        ]
        await self.channel_layer.group_send(
            self.room_group,
            {"type": "round_ended_msg", "scores": summary, "round": game.current_round},
        )

        await self.db_apply_scores(players, deltas)
        await self.db_complete_current_round(game)

        game = await self.get_game()
        if game.current_round >= game.max_rounds:
            actual_max = engine.max_rounds(len(players), game.num_decks)
            if game.max_rounds < actual_max:
                await self.db_update_game(game, status=Game.STATUS_PROMPT)
            else:
                await self.db_update_game(game, status=Game.STATUS_FINISHED)
                await self.trigger_export(game.code)
            await self.broadcast_state()
            return

        # Lead player index always rotates clockwise among all players, regardless of mode
        new_lead = (game.lead_player_index + 1) % len(players)
        await self.db_update_game(
            game,
            current_round=game.current_round + 1,
            lead_player_index=new_lead,
        )
        await self.start_new_round(game)

    # ── Validation ────────────────────────────────────────────────────────────

    async def validate_card_play(self, game, player, card):
        hand = player.hand
        in_hand = any(
            c["suit"] == card["suit"]
            and c["rank"] == card["rank"]
            and c["deck_id"] == card.get("deck_id", 1)
            for c in hand
        )
        if not in_hand:
            return False, "That card isn't in your hand."

        trick = await self.get_current_trick(game)
        if not trick or not trick.lead_suit:
            return True, ""   # first card — anything goes

        if card["suit"] == trick.lead_suit:
            return True, ""

        if any(c["suit"] == trick.lead_suit for c in hand):
            return False, f"You must follow the lead suit ({trick.lead_suit})."

        return True, ""

    # ── Broadcast ─────────────────────────────────────────────────────────────

    async def trigger_export(self, game_code):
        """Fire-and-forget: send game log to Telegram in background thread."""
        import asyncio
        from .export import send_game_log_to_telegram
        asyncio.create_task(asyncio.to_thread(send_game_log_to_telegram, game_code))

    async def broadcast_state(self):
        state = await self.build_state()
        await self.channel_layer.group_send(
            self.room_group, {"type": "game_state", "state": state}
        )

    async def game_state(self, event):
        await self.send(text_data=json.dumps({"type": "state", **event["state"]}))

    async def round_ended_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "round_ended",
            "scores": event["scores"],
            "round": event["round"],
        }))

    async def trick_winner_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "trick_winner",
            "winner": event["winner"],
            "seat": event["seat"],
        }))

    async def game_cancelled(self, event):
        await self.send(text_data=json.dumps({"type": "game_cancelled", "message": "Host cancelled the room."}))

    async def chat_message_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "chat_message",
            "username": event["username"],
            "message": event["message"],
            "is_spectator": event.get("is_spectator", False),
        }))

    async def peek_requested_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "peek_requested",
            "spectator": event["spectator"],
            "target_seat": event["target_seat"],
            "target_username": event["target_username"],
        }))

    async def peek_response_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "peek_response",
            "spectator": event["spectator"],
            "accepted": event["accepted"],
            "target_seat": event["target_seat"],
        }))

    async def takeover_requested_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "takeover_requested",
            "requester": event["requester"],
            "target_seat": event["target_seat"],
            "target_username": event["target_username"],
        }))

    async def takeover_response_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "takeover_response",
            "requester": event["requester"],
            "accepted": event["accepted"],
        }))

    async def ownership_transferred_msg(self, event):
        await self.send(text_data=json.dumps({
            "type": "ownership_transferred",
            "from_username": event["from_username"],
            "to_username": event["to_username"],
            "seat": event["seat"],
        }))

    async def send_error(self, message):
        await self.send(text_data=json.dumps({"type": "error", "message": message}))

    # ── State builder ─────────────────────────────────────────────────────────

    @database_sync_to_async
    def build_state(self):
        try:
            game = Game.objects.get(code=self.game_code)
        except Game.DoesNotExist:
            return {"error": "Game not found"}

        players = list(game.players.order_by("seat"))

        # Current trick cards
        trick_cards = []
        try:
            cur_round = game.rounds.filter(is_complete=False).order_by("-number").first()
            if cur_round:
                cur_trick = cur_round.tricks.filter(is_complete=False).order_by("-number").first()
                if cur_trick:
                    trick_cards = [
                        {
                            "suit":        tc.suit,
                            "rank":        tc.rank,
                            "deck_id":     tc.deck_id,
                            "player_seat": tc.player.seat,
                            "player_name": tc.player.username,
                            "play_order":  tc.play_order,
                        }
                        for tc in cur_trick.cards.select_related("player").order_by("play_order")
                    ]
        except Exception:
            pass

        # Enrich player state with team info
        def player_team(p):
            for i, team in enumerate(game.teams):
                if p.seat in team:
                    return i
            return -1

        caps = {t[0] for t in game.teams} if game.teams_enabled else set()

        players_state = [
            {
                "seat":        p.seat,
                "username":    p.username,
                "bid":         p.bid,
                "tricks_won":  p.tricks_won,
                "total_score": p.total_score,
                "hand_count":  len(p.hand),
                "hand":        p.hand,        # full hand — frontend filters
                "is_connected": p.is_connected,
                "team_index":   player_team(p),
                "is_captain":   p.seat in caps,
            }
            for p in players
        ]

        # Round leader seats for header display
        if game.teams_enabled and game.teams:
            lead_team_idx  = team_index_for_seat(game, game.lead_player_index)
            round_bid_lead_seat  = game.teams[lead_team_idx][0]
            round_play_lead_seat = (game.lead_player_index + 1) % len(players)
        else:
            n = len(players)
            round_bid_lead_seat  = game.lead_player_index
            round_play_lead_seat = (game.lead_player_index + 1) % n if n > 1 else game.lead_player_index

        spectators_state = [
            {
                "username":      s.username,
                "target_seat":   s.target_player.seat if s.target_player else None,
                "peek_accepted": s.peek_accepted,
                "is_connected":  s.is_connected,
            }
            for s in game.spectators.select_related("target_player").all()
        ]

        return {
            "game_code":      game.code,
            "host_username":  game.host_username,
            "status":         game.status,
            "current_round":  game.current_round,
            "max_rounds":     game.max_rounds,
            "trump_suit":     game.trump_suit,
            "trump_card":     game.trump_card,
            "current_player_index": game.current_player_index,
            "lead_player_index":    game.lead_player_index,
            "round_bid_lead_seat":  round_bid_lead_seat,
            "round_play_lead_seat": round_play_lead_seat,
            "num_decks":      game.num_decks,
            "expected_players": game.expected_players,
            "teams_enabled":  game.teams_enabled,
            "teams":          game.teams,          # [[captain_seat, teammate_seat], ...]
            "players":        players_state,
            "current_trick":  trick_cards,
            "spectators":     spectators_state,
        }

    # ── DB helpers ────────────────────────────────────────────────────────────

    @database_sync_to_async
    def get_game_by_code(self, game_code):
        return Game.objects.get(code=game_code)

    @database_sync_to_async
    def get_trick_by_id(self, trick_id):
        return Trick.objects.get(id=trick_id)

    @database_sync_to_async
    def get_player_by_id(self, player_id):
        return Player.objects.get(id=player_id)

    @database_sync_to_async
    def get_game(self):
        return Game.objects.get(code=self.game_code)

    @database_sync_to_async
    def get_players(self, game):
        return list(game.players.order_by("seat"))

    @database_sync_to_async
    def get_current_player_for_user(self, game):
        players = list(game.players.order_by("seat"))
        if game.current_player_index >= len(players):
            return None
        p = players[game.current_player_index]
        return p if p.username == self.username else None

    @database_sync_to_async
    def get_current_trick(self, game):
        r = game.rounds.filter(is_complete=False).order_by("-number").first()
        return r.tricks.filter(is_complete=False).order_by("-number").first() if r else None

    @database_sync_to_async
    def get_trick_cards(self, trick):
        return list(trick.cards.select_related("player").order_by("play_order"))

    @database_sync_to_async
    def get_player_seat(self, player_id):
        return Player.objects.get(id=player_id).seat

    @database_sync_to_async
    def detect_spectator(self, spectate_seat):
        """Return True and register/update spectator row if this user is not a player in a started game."""
        try:
            game = Game.objects.get(code=self.game_code)
        except Game.DoesNotExist:
            return False
        is_player = game.players.filter(username=self.username).exists()
        if is_player:
            return False
        if game.status == Game.STATUS_WAITING:
            return False
        # Upsert spectator row
        spec, _ = Spectator.objects.get_or_create(game=game, username=self.username)
        if spectate_seat is not None:
            try:
                target = game.players.get(seat=int(spectate_seat))
                spec.target_player = target
                spec.save()
            except (Player.DoesNotExist, ValueError):
                pass
        return True

    @database_sync_to_async
    def set_connected(self, connected):
        # Try player table first — covers normal players and post-takeover controllers
        updated = Player.objects.filter(
            game__code=self.game_code, username=self.username
        ).update(is_connected=connected)
        if not updated:
            if connected:
                Spectator.objects.filter(
                    game__code=self.game_code, username=self.username
                ).update(is_connected=True)
            else:
                # Spectator leaving — remove the row entirely, they never existed
                Spectator.objects.filter(
                    game__code=self.game_code, username=self.username
                ).delete()

    @database_sync_to_async
    def db_delete_game(self, game):
        game.delete()

    @database_sync_to_async
    def db_start_game(self, game, max_r, teams, teams_enabled=None):
        game.status        = Game.STATUS_BIDDING
        game.current_round = game.start_round
        game.max_rounds    = max_r
        game.teams         = teams
        if teams_enabled is not None:
            game.teams_enabled = teams_enabled
        game.save()

    @database_sync_to_async
    def db_update_game(self, game, **kwargs):
        for k, v in kwargs.items():
            setattr(game, k, v)
        game.save()

    @database_sync_to_async
    def db_create_round(self, game, trump_card, cards_per):
        return Round.objects.create(
            game=game, number=game.current_round,
            trump_suit=trump_card["suit"], trump_card=trump_card, cards_per_player=cards_per,
        )

    @database_sync_to_async
    def db_deal_hands(self, players, hands):
        for player, hand in zip(players, hands):
            player.hand = hand
            player.save()

    @database_sync_to_async
    def db_reset_bids_and_tricks(self, players):
        for p in players:
            p.bid        = -1
            p.tricks_won = 0
            p.save()

    @database_sync_to_async
    def db_set_bid(self, game, player, bid):
        all_players   = list(game.players.order_by("seat"))
        others_before = [
            {"seat": p.seat, "username": p.username, "bid": p.bid}
            for p in all_players if p.bid >= 0 and p.seat != player.seat
        ]
        BidLog.objects.create(
            game=game,
            round_number=game.current_round,
            seat=player.seat,
            username=player.username,
            trump_suit=game.trump_suit,
            trump_card=game.trump_card,
            hand_snapshot=list(player.hand),
            others_bids_before=others_before,
            bid_made=bid,
            all_scores_before_round={str(p.seat): p.total_score for p in all_players},
        )
        player.bid = bid
        player.save()

    @database_sync_to_async
    def db_copy_bid_to_teammates(self, game, captain):
        """Copy captain's bid to all their teammates."""
        for team in game.teams:
            if captain.seat == team[0]:
                Player.objects.filter(
                    game=game, seat__in=team[1:]
                ).update(bid=captain.bid)
                break

    @database_sync_to_async
    def db_create_trick(self, game):
        r = game.rounds.filter(is_complete=False).order_by("-number").first()
        return Trick.objects.create(round=r, number=r.tricks.count() + 1)

    @database_sync_to_async
    def db_play_card(self, game, player, card):
        r     = game.rounds.filter(is_complete=False).order_by("-number").first()
        trick = r.tricks.filter(is_complete=False).order_by("-number").first()
        order = trick.cards.count()
        if order == 0:
            trick.lead_suit = card["suit"]
            trick.save()
        all_players = list(game.players.all())
        TrickCard.objects.create(
            trick=trick, player=player,
            suit=card["suit"], rank=card["rank"],
            deck_id=card.get("deck_id", 1), play_order=order,
            hand_before=list(player.hand),
            all_scores_snapshot={str(p.seat): p.total_score  for p in all_players},
            all_tricks_snapshot={str(p.seat): p.tricks_won   for p in all_players},
            all_bids_snapshot  ={str(p.seat): p.bid          for p in all_players},
        )
        player.hand = [
            c for c in player.hand
            if not (
                c["suit"]    == card["suit"]
                and c["rank"]    == card["rank"]
                and c["deck_id"] == card.get("deck_id", 1)
            )
        ]
        player.save()

    @database_sync_to_async
    def db_complete_trick(self, trick, winner):
        trick.winner      = winner
        trick.is_complete = True
        trick.save()
        winner.tricks_won += 1
        winner.save()

    @database_sync_to_async
    def db_apply_scores(self, players, deltas):
        for p, delta in zip(players, deltas):
            p.total_score += delta
            p.save()

    @database_sync_to_async
    def db_complete_current_round(self, game):
        game.rounds.filter(is_complete=False).update(is_complete=True)

    @database_sync_to_async
    def db_get_or_create_spectator(self):
        game = Game.objects.get(code=self.game_code)
        spec, _ = Spectator.objects.get_or_create(game=game, username=self.username)
        return spec

    @database_sync_to_async
    def db_get_spectator_by_username(self, username):
        try:
            return Spectator.objects.select_related("target_player").get(
                game__code=self.game_code, username=username
            )
        except Spectator.DoesNotExist:
            return None

    @database_sync_to_async
    def db_get_player_by_seat(self, seat):
        try:
            return Player.objects.get(game__code=self.game_code, seat=int(seat))
        except (Player.DoesNotExist, ValueError):
            return None

    @database_sync_to_async
    def db_update_spectator(self, spec, **kwargs):
        for k, v in kwargs.items():
            setattr(spec, k, v)
        spec.save()

    @database_sync_to_async
    def db_get_player_by_username(self, username):
        try:
            return Player.objects.get(game__code=self.game_code, username=username)
        except Player.DoesNotExist:
            return None

    @database_sync_to_async
    def db_rename_player(self, player, new_username):
        # Remove spectator row for the incoming controller (they're becoming a player)
        Spectator.objects.filter(game=player.game, username=new_username).delete()
        player.username = new_username
        player.is_connected = True
        player.save()
