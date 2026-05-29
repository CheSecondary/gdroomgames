# OpenSpades — ML Bot Training Blueprint

> Last updated to reflect all data collection features as of the current codebase.

---

## Why we're collecting this data

OpenSpades is a Spades variant where 6–8 players bid on how many tricks they'll win, then play cards to fulfil that bid. The game has deep tactical layers: hand reading, bid estimation, trump management, suit voiding, card counting, and — in teams mode — cooperative play where you deliberately *lose* a trick so your teammate wins it.

The goal is to train a model that plays as a human-quality bot, replacing a missing friend in the group. The bot must make three kinds of decisions:

1. **Bid decision** — how many tricks will I win this round?
2. **Card play decision** — which card do I play right now?
3. **Signal decision** — when and what to signal my teammate (optional, teams only)

Every completed game automatically exports a `.jsonl` file to Telegram. Each line is one self-contained decision event — no need to look at other lines to understand it.

---

## Event types

### `game_summary` — 1 per game
Overview of the whole game for grouping and filtering.

| Field | Notes |
|---|---|
| `teams_enabled`, `teams` | Team assignments `[[seat,seat],...]` |
| `num_decks` | 1 or 2 — changes probability of everything |
| `start_round`, `max_rounds`, `total_rounds` | Game length |
| `players[].final_score`, `rank` | Who won and by how much |

---

### `bid_decision` — 1 per player per round
Everything a player knows at the moment they submit their bid.

| Field | Why it matters |
|---|---|
| `hand` | Full hand — every card's suit/rank |
| `hand_size` | = round number; small hand = high variance |
| `trump_suit`, `trump_card` | Trump suit changes card values entirely |
| `trump_card_rank`, `trump_card_suit` | Explicit — e.g. trump=A♥ means 0 A♥ in play |
| `trump_card_already_out` | Always True — trump is removed before dealing |
| `spades_in_hand`, `trump_in_hand` | Quick strength indicator |
| `aces_in_hand`, `kings_in_hand`, `high_cards_in_hand` | Win potential |
| `round_progress` | 0.0–1.0; last round = wildly different strategy |
| `is_last_round` | Explicit flag: "all-or-nothing round" logic |
| `my_score_before_round` | Survival mode vs bold mode |
| `my_rank_before_round` | Where am I on leaderboard going in? |
| `total_players` | Context for rank interpretation |
| `team_score_before_round` | Combined team standing |
| `all_scores_before_round` | Full board state {username: score} |
| `others_bids_before` | What teammates/opponents have already bid |
| `sum_bids_before`, `num_already_bid` | Remaining tricks claimed vs available |
| `bid_made` | ★ **The decision** — supervised learning label |
| `bid_outcome` | `"made"/"overtrick"/"set"` — did it work? |
| `tricks_won_this_round` | Ground truth outcome |
| `team_bid_outcome` | Did the whole team make their combined bid? |
| `teams_enabled` | Flag for model conditioning |
| `team` | Team members, indices, usernames |

---

### `card_play` — 1 per card played, every player, every trick
Everything a player knows the instant they commit to a card.

#### Identity & context
| Field | Why it matters |
|---|---|
| `round`, `total_rounds`, `round_progress`, `is_last_round` | Game phase |
| `trick_num`, `total_tricks_this_round`, `trick_progress`, `is_last_trick` | Round phase |
| `trump_suit`, `trump_card`, `cards_per_player` | Round setup |
| `teams_enabled`, `team`, `total_players` | Team context |

#### Trick state
| Field | Why it matters |
|---|---|
| `lead_suit`, `lead_seat`, `lead_username` | Who set the suit constraint |
| `i_am_leading` | First to play = no constraint, full freedom |
| `play_order` | 0=first, N-1=last; last player has total info |
| `players_after_me` | How many still to play — affects "waste a winner" decision |
| `trick_so_far` | Cards already played this trick |
| `winning_so_far` | Which entry is currently winning the trick |

#### My hand & bid state
| Field | Why it matters |
|---|---|
| `hand_before` | Full hand before this play |
| `hand_size`, `trump_in_hand`, `spades_in_hand`, `high_cards_in_hand` | Quick hand stats |
| `suits_in_hand` | `{spades:2, hearts:0, ...}` — **explicit void detection** |
| `void_in_lead_suit` | Bool: "I have no lead-suit cards, I can trump or throw" |
| `my_bid`, `my_tricks_won` | Progress toward bid |
| `bid_gap` | Positive=need more, 0=made bid, negative=overbid |
| `my_score`, `my_rank` | Game standing right now |

#### Team state
| Field | Why it matters |
|---|---|
| `team_bid`, `team_tricks`, `team_bid_gap` | Team progress — drives "throw vs fight" decisions |

#### All players snapshot (exact moment)
| Field | Why it matters |
|---|---|
| `all_players[]` | Every player: `{score, bid, tricks_won, bid_gap, team_index}` |

#### Card counting — what's still out there
| Field | Why it matters |
|---|---|
| `cards_played_this_round` | Flat list of every card played in completed tricks |
| `trumps_played_this_round` | Trump depletion — how many are gone |
| `highest_unseen_per_suit` | `{spades:"J"}` = A+K+Q gone, J is the highest danger |
| `unseen_count_per_suit` | `{spades:4}` = 4 spades still floating |
| `cards_risk_by_suit` | For every card in my hand: `{rank:"6", is_trump:true, unseen_above:5}` — how many unseen cards in same suit can beat it. unseen_above=0 = guaranteed win |
| `void_in_lead_suit` | Immediate void flag for current trick |

#### Trick history (same round)
| Field | Why it matters |
|---|---|
| `completed_tricks_this_round` | All completed tricks so far: who played what, `play_type` per card |
| `play_type` per card | `"follow"/"trump"/"throw"` — "throw" in a suit = likely void now |

#### Decision + outcome
| Field | Why it matters |
|---|---|
| `card_played` | ★ **The decision** — supervised learning label |
| `team_signal_sent` | Signal sent to teammate before this play (if any) |
| `won_trick` | Did this card win the trick? |
| `tricks_won_this_round`, `round_bid_outcome` | Hindsight labels for quality assessment |

---

### `team_signal` — 1 per signal sent (teams mode only)
Separate event for every tap on a signal button — logged anytime during play, not just on your turn. Rapid-clicks are all captured.

| Field | Why it matters |
|---|---|
| `signal` | `"got_this"/"you_take"/"covered"/"need_one"` |
| `sender_seat`, `sender_username` | Who sent it |
| `round`, `trick_num` | When in the game |
| `cards_in_trick_when_sent` | **0** = proactive (before anyone played) / **N** = reactive (after seeing N plays) |
| `teams_enabled` | Always True for this event type |

---

## What tactics are now covered

| Tactic | How it's in the data |
|---|---|
| Bid estimation from hand strength | `hand`, `aces_in_hand`, `kings_in_hand`, `trump_in_hand` |
| Last-round aggressive bidding | `is_last_round`, score context |
| Reading opponents' bids to estimate their strength | `others_bids_before`, `sum_bids_before` |
| Teammate winning → I play low | `winning_so_far` + `team_bid_gap <= 0` |
| Suit void setup (throw off early to trump later) | `play_type="throw"` in `completed_tricks_this_round` |
| Trump fishing (lead trump to clear field) | `i_am_leading` + trump play in trick history |
| Sandwich play (seats 0+3 squeeze opponents 1+2) | `play_order` + `trick_so_far` + team assignments |
| Last player plays minimum winning card | `players_after_me=0` + `winning_so_far` + full hand |
| Bag forcing on opponents | `all_players[].bid_gap` negative = overbid accumulating |
| Score protection (leading, play safe) | `my_rank`, `my_score`, `team_score` |
| Damage control (bad hand, minimise set) | `bid_gap` very negative + `bid_outcome="set"` label |
| "Is my K♥ safe?" (trump=A♥ removed) | `highest_unseen["hearts"]` + trump card subtracted from deck |
| "Is my 6♠ a gamble?" | `cards_risk_by_suit["spades"][0].unseen_above` |
| Trump count awareness | `trumps_played_this_round` + `unseen_count["spades"]` |
| Card counting — what's still live | `highest_unseen_per_suit` + `cards_played_this_round` |
| Double-deck probability differences | `num_decks` + correct unseen counts (trump card subtracted) |
| "Teammate threw off spades → probably void" | `play_type="throw"` in trick history |
| Proactive vs reactive signaling | `cards_in_trick_when_sent` in signal events |
| Panic/urgent re-signals | Multiple consecutive `team_signal` events allowed and logged |

---

## Solo vs Teams — one model or two?

**Recommendation: one unified model, conditioned on `teams_enabled`.**

Core card tactics transfer completely (trump management, hand reading, card counting). Team-specific behaviour is learned from team features:
- `team_bid_gap` drives throw decisions — if team is covered, don't fight for the trick
- `cards_risk_by_suit` and `play_type` history drive coordination plays
- `team_signal_sent` and `team_signal` events provide explicit coordination labels

Training more solo games still improves the team model — solo teaches hand quality, team data teaches cooperation on top. Don't separate them.

---

## All perspectives captured

A 6-player teams game, 7 rounds gives:
- **42** `bid_decision` events (6 players × 7 rounds)
- **252** `card_play` events (6 players × 7 rounds × 6 tricks)
- **N** `team_signal` events (however many signals were sent)

All perspectives included: winner, loser, bad hand, good hand, first to bid, last to bid. The model sees:
- `bid_outcome="set"` with 3 aces (unusual, situational) vs 0 high cards (expected) — learns hand quality independently
- Team throw plays are correctly labelled: `won_trick=False` with `team_bid_gap<=0` + teammate `winning_so_far` is a **correct** play
- Double-deck games, single-deck games, 4-player, 6-player — all conditioned on their own context

---

## The voice chat gap — what the model still won't know

In real games: "Ravi, I have big joker, don't trump." This future-hand declaration is impossible to capture from gameplay alone.

**What the model CAN learn instead:**
- Statistical inference: high bid + played low → they're sandbagging, likely have a winner saved
- `play_type` history: teammate threw off spades in trick 2 → probably void now → safe to lead spades
- `team_signal_sent` data: when experienced players send signals, the model learns what game states trigger them

**Closing this gap further — future feature:**
Add chat message logging to the JSONL export. Currently chat is ephemeral (WS only). If we persist chat messages in a `ChatMessage` DB model and export them as `chat_message` events with full game context, the model can learn:
- "teammate said 'I can't win this'" → they bid 0 or have a weak hand
- "teammate said 'do you have hearts?'" → they need hearts covered
This would make the bot genuinely conversational AND trainable on natural language coordination.

---

## Will 50–100 games produce a human-like bot?

**Honest answer: no, not yet. But it's a starting point.**

| Games | What the model can do |
|---|---|
| 50 games (~15K events) | Basic bidding (don't overbid with weak hand), crude card plays, no real tactics |
| 100 games (~30K events) | Consistent bidding math, basic trump management, occasionally correct team throws |
| 500 games (~150K events) | Solid bidding, reliable card counting, consistent team cooperation via signals |
| 1000+ games (~300K+ events) | Human-level play in most situations, good instincts |
| 5000+ games | Genuinely competitive, possibly better than average human |

**The LLM shortcut:** Fine-tuning a pre-trained model (Mistral 7B, Phi-3, Qwen-2) on our JSONL data changes the equation dramatically. The LLM already knows what "bid_gap=-2" means, already understands card games conceptually from its training corpus. Fine-tuning with even 100 games could reach what an MLP trained on 500 games achieves, because you're not teaching it cards from scratch — you're teaching it *your specific game and your group's style.*

**The hardest human behaviours to replicate:**
1. Bluff bidding (bid low to hide a strong hand) — needs many games to see the pattern
2. Read opponent tells from bid patterns — needs opponent modelling
3. Last-round kamikaze plays — `is_last_round` is there, but knowing WHEN to gamble takes volume

---

## Chat interface with the bot (future vision)

The idea: talk to the bot like you talk to Ravi.

```
You:   "hey I can't win anything this round, my deck is bad"
Bot:   "I have A♥ and K♠, I'll cover. You play safe."

You:   "do you have hearts?"
Bot:   "yeah, I have 3 hearts including the K, go ahead"

You:   "ooooo boy we won that trick!"
Bot:   "😂 that's what the signal was for, you played it perfectly"
```

**How to build it:**
1. Bot has full game state (same `build_state()` dict the frontend uses)
2. Chat messages from human players are injected into the bot's context
3. A conversational LLM layer (GPT-4o, Claude, or fine-tuned Mistral) handles:
   - Parsing your message in context of current game state
   - Generating a natural response ("I have K♥, I'll cover")
   - AND outputting the strategic decision (which card/bid to play)
4. The chat logs + game outcomes become additional training data

**Why this is powerful for training:**
If we log in-game chat messages as `chat_message` events in the JSONL (needs a `ChatMessage` DB model — currently chat is ephemeral), the model can learn:
- When teammate says "I have hearts" → how does their subsequent card play change?
- When bot says "you take it" via signal AND chat, does the team make their bid more often?
- Natural language coordination patterns from Telugu + English casual chat

**Result:** a bot that doesn't just play mechanically but communicates naturally like a real teammate — understands "bro I'm sinking this round" and adjusts strategy accordingly.

---

## Training recipe

### Step 1 — Collect data
```bash
# Download all .jsonl files from Telegram, concatenate
cat openspades_*.jsonl > all_games.jsonl

# Quick stats
grep -c '"event": "card_play"' all_games.jsonl     # total card play events
grep -c '"event": "bid_decision"' all_games.jsonl   # total bid events
grep -c '"event": "team_signal"' all_games.jsonl    # total signal events
```

### Step 2 — Bid model features
```python
features = [
    event["round_progress"],
    event["is_last_round"],             # 0/1
    event["hand_size"],
    event["trump_in_hand"] / event["hand_size"],
    event["aces_in_hand"],
    event["kings_in_hand"],
    event["high_cards_in_hand"],
    event["my_score_before_round"],     # normalise by max possible score
    event["my_rank_before_round"] / event["total_players"],
    event["sum_bids_before"] / event["hand_size"],
    event["num_already_bid"] / event["total_players"],
    int(event["teams_enabled"]),
    event.get("team_score_before_round", 0),
    # trump card info
    RANK_VAL[event["trump_card_rank"]],  # 0-12
]
label = event["bid_made"]
quality_label = {"made":1, "overtrick":0.5, "set":0}[event["bid_outcome"]]
```

### Step 3 — Card play model features
```python
# Per-card risk features (most important additions from later sessions)
for suit in ["spades","hearts","diamonds","clubs"]:
    cards_in_suit = event["cards_risk_by_suit"].get(suit, [])
    best_card = cards_in_suit[0] if cards_in_suit else None
    features += [
        len(event["suits_in_hand"][suit]),          # count of cards I have in suit
        best_card["unseen_above"] if best_card else -1,  # risk of best card in suit
    ]

# Card counting
features += [
    event["trumps_played_this_round"],
    event["unseen_count_per_suit"]["spades"],       # one per suit
    event["unseen_count_per_suit"]["hearts"],
    event["unseen_count_per_suit"]["diamonds"],
    event["unseen_count_per_suit"]["clubs"],
    RANK_VAL.get(event["highest_unseen_per_suit"]["spades"] or "2", 0),  # highest danger per suit
    # ... same for other suits
]

# Position & trick context
features += [
    event["play_order"] / event["total_players"],
    int(event["i_am_leading"]),
    event["players_after_me"],
    event["bid_gap"] or 0,
    event.get("team_bid_gap") or 0,
    event["trick_progress"],
    int(event["is_last_trick"]),
    int(event["is_last_round"]),
    int(event.get("void_in_lead_suit", False)),
]

label = (event["card_played"]["suit"], event["card_played"]["rank"])
```

### Step 4 — Architecture

**Start with:** Fine-tune a small LLM (Phi-3 mini, Mistral 7B)
- The JSONL field names are natural language — the model reads them as text
- Pre-trained LLMs already understand card game concepts
- 100 games fine-tuning → better than 500 games MLP

**Scale to:** Transformer with set encoding
- Hand cards as an order-invariant set (sort by value for stable input)
- Trick history as a sequence (positional encoding per trick)
- Cross-attention between my hand and what's been played

### Step 5 — Evaluation
```python
# Split by game_code, not by event (avoid data leakage)
train_games, test_games = train_test_split(all_game_codes, test_size=0.2)

# Bid model: mean absolute error
bid_mae = mean_abs_error(predicted_bids, actual_tricks_won)

# Card play: top-1 and top-3 accuracy
top1_acc = (predicted_card == actual_card_played).mean()
top3_acc = (actual_card_played in top3_predictions).mean()

# Live test: bot vs itself, does it make bids >50% of the time?
```

---

## Bot integration plan

```
GameBoard.tsx
    ↓ "your turn" signal
    ↓ if player.is_bot:
BotPlayer service (Python sidecar)
    → reads state from build_state()
    → optionally reads recent chat messages
    → calls bid_model(state) or play_model(state)
    → optionally generates a chat response (LLM layer)
    → sends WebSocket: place_bid / play_card / send_chat
```

### Backend changes needed
1. Add `is_bot = BooleanField(default=False)` to `Player` model
2. In `consumers.py`: when current player `is_bot`, call bot service instead of waiting for WS
3. Add 0.5–2s random delay before bot plays (human feel)
4. Bot service endpoint: POST `/bot/decide/` with state JSON → returns `{action, card/bid, message?}`

### Difficulty levels
| Level | Implementation |
|---|---|
| Easy | Random legal move (no model — just rule-following) |
| Medium | MLP trained on collected data |
| Hard | Transformer trained on data |
| Expert | Transformer + MCTS (simulate remaining card distributions) |
| Conversational | Expert model + LLM chat layer (full teammate experience) |

---

## Data quality notes

- **Bad hands are the most valuable data** — set outcomes from bad hands teach the model what hand quality really means
- **Team throws look like mistakes** without context. The label `won_trick=False` with `team_bid_gap<=0` + `winning_so_far.seat` being a teammate = **correct play**. The model must see both context and outcome together.
- **Trump card is always out** — no player can hold the trump card. `highest_unseen` and `cards_risk_by_suit` are already corrected for this.
- **Double-deck changes everything** — filter or condition on `num_decks` when training, never mix single and double deck without that flag
- **Round 1–3 are high variance** (1–3 cards each) — weight later rounds higher in training loss
- **Signal frequency is a personality signal** — frequent signals = anxious player / beginner; rare signals = confident / experienced. The model learns both styles from data.
- **Proactive signals (cards_in_trick_when_sent=0) are stronger strategic signals** than reactive ones — they reveal information about your hand before you've seen opponents play

---

## File locations

| File | Purpose |
|---|---|
| `backend/game/export.py` | Builds JSONL + all helper functions (_unseen_cards, _cards_risk_by_suit, etc.) |
| `backend/game/models.py` | `BidLog`, `TrickCard` (snapshots), `TeamSignalLog` |
| `backend/game/consumers.py` | `trigger_export()`, `handle_send_team_signal()`, `db_log_team_signal()` |
| `backend/game/migrations/` | 0007–0010 add ML training fields |
| `backend/.env` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| `frontend/components/GameBoard.tsx` | `TeamSignalButtons`, `TeamSignalToast` components |
| Telegram | Receives one `.jsonl` per completed game automatically, forever |

### JSONL event count per 4-player 2v2 game (13 rounds)
| Event type | Count |
|---|---|
| `game_summary` | 1 |
| `bid_decision` | ~52 (4 players × 13 rounds) |
| `card_play` | ~312 (4 × 13 rounds × 6 avg tricks) |
| `team_signal` | variable (0 to 100+) |
| **Total** | **~365+ per game** |

Every completed game → one `.jsonl` file in Telegram, automatically, forever.
