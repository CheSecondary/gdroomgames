# OpenSpades — ML Bot Training Blueprint

## Why we're collecting this data

OpenSpades is a Spades variant where 6–8 players bid on how many tricks they'll win, then play cards to fulfil that bid. The game has deep tactical layers: hand reading, bid bluffing, trump management, and — in teams mode — coordinated play where you deliberately *lose* a trick so your teammate can win it.

The goal is to train a neural network (or fine-tune an LLM) that can play as a human-quality bot, replacing a missing player in a friend group. The bot must make two kinds of decisions:

1. **Bid decision** — given my hand and the game state, how many tricks do I predict I'll win?
2. **Card play decision** — given my hand, the current trick, and all visible state, which card do I play?

Every game automatically exports a `.jsonl` file to Telegram. Each line is one decision event with full context — no need to look up any other line to understand it.

---

## What is captured

### `game_summary` (1 per game)
- Teams config, number of decks, rounds played
- Every player's final score, rank, team assignment

### `bid_decision` (1 per player per round)
Full snapshot of everything a player knows at bid time:

| Field | Why it matters |
|---|---|
| `hand` | The actual cards — suit/rank for every card |
| `trump_suit`, `trump_card` | Trump changes card values entirely |
| `spades_in_hand`, `trump_in_hand` | Quick strength indicator |
| `aces_in_hand`, `kings_in_hand`, `high_cards_in_hand` | Win potential |
| `hand_size` | Round N = N cards each — small hands play differently |
| `round_progress` | 0.0–1.0; last round (1.0) = wildly different strategy |
| `is_last_round` | Explicit flag for "bet it all" last-round logic |
| `my_score_before_round` | Are you in survival mode or can you be bold? |
| `my_rank_before_round` | Position on leaderboard going into this round |
| `team_score_before_round` | Combined team standing |
| `all_scores_before_round` | Everyone's scores — full board state |
| `others_bids_before` | What teammates/opponents have already bid |
| `sum_bids_before`, `num_already_bid` | Remaining tricks available |
| `bid_made` | **The decision** — label for supervised learning |
| `bid_outcome` | Did they actually make it? `"made"/"overtrick"/"set"` |
| `tricks_won_this_round` | Actual tricks won — ground truth |
| `team_bid_outcome` | Did the team as a whole make their combined bid? |

### `card_play` (1 per card played, every player, every trick)
Full snapshot of everything a player knows the moment they play a card:

| Field | Why it matters |
|---|---|
| `hand_before` | Full hand before playing — all options visible |
| `trump_in_hand`, `spades_in_hand`, `high_cards_in_hand` | Hand strength at this moment |
| `trick_so_far` | Cards already played in this trick — what's on the table |
| `winning_so_far` | Which card is currently winning |
| `lead_suit` | Must follow suit if possible |
| `i_am_leading` | First to play = total freedom, no suit constraint |
| `play_order` | 0=first, N-1=last; last player has full information |
| `players_after_me` | How many still to play — affects whether to "waste" a winner |
| `my_bid`, `my_tricks_won` | Current bid progress |
| `bid_gap` | Positive=still need tricks, 0=already made bid, negative=overbid |
| `my_score`, `my_rank` | Game standing at this exact moment |
| `team_bid`, `team_tricks`, `team_bid_gap` | Team's collective progress |
| `all_players[]` | Every player's `{score, bid, tricks_won, bid_gap, team}` right now |
| `is_last_trick`, `trick_progress` | End-of-round pressure |
| `is_last_round` | Last round = high-stakes, risky plays more justified |
| `card_played` | **The decision** — label for supervised learning |
| `won_trick` | Did this card win the trick? |
| `round_bid_outcome` | Did the player end up making their bid this round? |
| `tricks_won_this_round` | Final tricks won in this round (hindsight label) |

---

## Solo vs Teams — one model or two?

**Recommendation: one unified model, conditioned on `teams_enabled`.**

**Why unified works:**
- Core card tactics are identical: trump management, following suit, reading hand strength
- `teams_enabled` is a feature in every event — the model can learn team-specific behaviour from the team features (`team_bid_gap`, `team_tricks`, `team` object)
- We will have far more team games than solo games in practice — a separate solo model would underfit
- Transfer learning: solo game data teaches hand strength and bidding math; team data teaches cooperative play on top

**Why team play is harder for the model:**
- "Throw a trick" (deliberately losing so teammate wins) looks like a mistake in supervised training unless `team_bid_gap` context is included — and it is
- Voice chat coordination can't be captured (friend says "I have big joker, don't trump") — the model will never have this, but it can still learn *statistically good* team play
- If you want: train one model, then fine-tune a team-specific head using only `teams_enabled=true` games

**Key feature the model needs for team tactics:**
```
team_bid_gap  =  team_bid - team_tricks_so_far
```
If `team_bid_gap <= 0` and teammate is `winning_so_far` → throwing a low card is correct even though you "lose" the trick. This is fully captured.

---

## All perspectives captured

Yes — every game captures **every player's POV for every single decision**:

- 6-player teams game, 7 rounds → ~42 bid events + ~252 card play events
- All from different seats, different hand strengths, different score positions
- Players who lost because of bad hands are captured too — the model sees *why* certain hands lead to set outcomes regardless of tactics
- This is important: the model sees that `bid_outcome="set"` with 3 aces is unusual vs `bid_outcome="set"` with no high cards is expected — it learns hand quality independently

---

## How to use the data for training

### Step 1 — Collect games
Play enough games to have statistically meaningful data. Rough targets:
- ~200+ games minimum for a usable model
- ~1000+ games for a good model
- Each game gives ~300 decision events (bid + play combined)
- Team games are more valuable — prioritise collecting those

Download all `.jsonl` files from the Telegram bot and concatenate:
```bash
cat openspades_*.jsonl > all_games.jsonl
```

### Step 2 — Feature engineering for bid model

**Input features** (numerical, normalised 0–1 where possible):
```
round_progress, is_last_round, hand_size,
trump_in_hand / hand_size, spades_in_hand / hand_size,
aces_in_hand, kings_in_hand, high_cards_in_hand,
my_score_before_round (normalised),
my_rank_before_round / total_players,
sum_bids_before / hand_size,      ← remaining tricks available ratio
num_already_bid / total_players,
teams_enabled (0/1),
team_score_before_round (if teams_enabled)
```

**Output (label):** `bid_made` (integer, regression or classification 0–N)

**Quality signal:** also train a secondary head to predict `bid_outcome` — a model that can predict whether its own bid will succeed is a better bidder.

### Step 3 — Feature engineering for card play model

**Input features:**
```
play_order / total_players,      ← position in trick
i_am_leading (0/1),
players_after_me,
bid_gap,                         ← how desperate am I for tricks
team_bid_gap,                    ← how desperate is my team
my_rank / total_players,
round_progress, trick_progress, is_last_trick, is_last_round,
hand_size,
trump_in_hand / hand_size,
winning_so_far.card (encoded),
lead_suit (one-hot: spades/hearts/diamonds/clubs/none),
trump_suit (one-hot),
teams_enabled (0/1),

# For each card in hand_before (variable length → encode as set):
  card_suit (one-hot), card_rank (0–12 normalised), is_trump (0/1)

# For each card in trick_so_far:
  seat_relative (0=teammate, 1=opponent), card_suit, card_rank, is_trump
```

**Output (label):** `card_played` (suit + rank) — treated as a classification over the legal moves

### Step 4 — Architecture options

**Option A — Simple MLP (start here):**
- Flatten all features into a fixed-size vector
- 3–4 hidden layers with ReLU
- Softmax output over legal moves
- Fast to train, easy to debug

**Option B — Transformer (better long-term):**
- Hand cards as a set (order-invariant) → use a set transformer or sort by value
- Trick-so-far cards as a sequence → positional encoding
- Cross-attention between hand and trick
- This is how Pluribus (poker bot) style models work

**Option C — Fine-tune an LLM (easiest to get started):**
- Feed a JSONL line as text to a small LLM (Mistral 7B, Phi-3)
- The rich field names act as natural language context
- Fine-tune with the card/bid as the completion
- Pro: understands `"bid_gap": -1` means "already overbid" without encoding

### Step 5 — Training loop
```python
# Pseudocode
for line in all_games.jsonl:
    event = json.loads(line)
    if event["event"] == "bid_decision":
        features = extract_bid_features(event)
        label    = event["bid_made"]
        loss     = mse(model_bid(features), label)
    elif event["event"] == "card_play":
        features     = extract_play_features(event)
        legal_moves  = event["hand_before"]
        label        = event["card_played"]
        loss         = cross_entropy(model_play(features, legal_moves), label)
    optimizer.step(loss)
```

### Step 6 — Evaluation
- Split by game (not by event) to avoid data leakage
- Metric for bid: mean absolute error on `bid_made` vs actual `tricks_won_this_round`
- Metric for card play: top-1 accuracy on `card_played`; also evaluate "legal move rank" (was the chosen card in top-3 predicted?)
- Play bot vs itself and measure: does it make its bid >50% of the time? Does it win team games >50%?

---

## Integration plan — bot in place of a missing friend

### Architecture
```
GameBoard.tsx
    ↓ ws message: "your turn"
    ↓ if player is bot:
BotPlayer service (Python or Node sidecar)
    → calls bid_model(state) or play_model(state)
    → sends ws message: place_bid / play_card
```

### Backend integration
1. Mark a `Player` row as `is_bot=True` (add field to model)
2. In `consumers.py`, when it's a bot's turn, call the bot service instead of waiting for client WS message
3. Bot service receives the same state dict that `build_state()` returns — no new API needed
4. Bot responds within 1–2 seconds (add a small random delay for realism)

### Bot difficulty levels
- **Easy**: random legal move (no model needed — just follows rules)
- **Medium**: MLP model trained on data
- **Hard**: Transformer model trained on data
- **Expert**: model + Monte Carlo tree search (simulate remaining cards)

---

## Data quality notes

- **Bad hands are valuable training data** — a player getting set with 0 high cards teaches the model that hand quality caps bid ceiling
- **Team throws are labelled correctly** — `won_trick=False` with `team_bid_gap <= 0` and teammate `winning_so_far` is a *correct* play even though it "lost"
- **Voice chat coordination is missing** — accept that the bot will be ~80% of a coordinated human team; it won't do "he told me to hold my joker" plays
- **Duplicate deck games** — `num_decks=2` changes probability dramatically; always condition on this or filter to single-deck games first
- **Small round games (round 1–3)** — very few cards, high variance; consider weighting later rounds higher in training

---

## File locations

| File | Purpose |
|---|---|
| `backend/game/export.py` | Builds JSONL and sends to Telegram |
| `backend/game/models.py` | `BidLog`, `TrickCard` snapshots |
| `backend/game/consumers.py` | `trigger_export()` called at game end |
| `backend/.env` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Telegram bot | Receives `.jsonl` files automatically |

Every completed game → one `.jsonl` file in Telegram, automatically, forever.
