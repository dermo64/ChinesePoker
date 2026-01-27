# Chinese Poker (十三张) vs Computer

A simple full-stack web app where you arrange 13 cards into Chinese Poker hands (Front 3 / Middle 5 / Back 5) and play against a computer opponent.

## Tech

- Server: Node.js + TypeScript + Express
- Client: React + TypeScript (Vite)

## Rules implemented

- Each player is dealt 13 cards.
- You must arrange into:
  - **Back**: 5 cards (strongest)
  - **Middle**: 5 cards
  - **Front**: 3 cards (weakest)
- **Ordering constraint (no foul)**: `Back >= Middle >= Front` by poker strength.
  - 5-card hands use standard poker ranking (high card .. straight flush).
  - 3-card **Front** hand uses only: high card / one pair / three of a kind.
    - No straights/flushes in the 3-card evaluation.

## Scoring

Baseline scoring:

- Compare corresponding hands:
  - Front vs Front
  - Middle vs Middle
  - Back vs Back
- Win = +1, Loss = -1, Tie = 0 (from the human player's perspective)
- **Scoop bonus**: if you win all three comparisons, add **+3**. If the computer wins all three, add **-3**.

### Foul handling (your choice)

This app **accepts** fouled submissions and scores them as an automatic loss:

- If your arrangement violates `Back >= Middle >= Front`, you are marked as **foul**.
- Score is set to **-6** for you and **+6** for the computer.

This corresponds to “lose all three hands” (-3) plus the scoop bonus (-3).

## Computer opponent AI (bounded Monte Carlo)

The server chooses the computer’s arrangement via bounded Monte Carlo:

- Randomly sample many candidate legal (Front/Middle/Back) partitions of the computer’s 13 cards.
- For each candidate, estimate expected score by rolling out random opponent (human) hands from the remaining deck.
- For each sampled opponent hand, use a fast heuristic arranger to produce a legal partition.
- Choose the candidate with best mean score.

Tunable constants (server):

- `NUM_CANDIDATES`
- `NUM_ROLLOUTS`
- `TIME_BUDGET_MS`

Enable debug logs with:

- `LOG_LEVEL=debug`

## Run locally

### Prereqs

- Node.js 18+ recommended

### Install

From repo root:

```bash
npm install
```

### Dev

From repo root:

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## API

- `POST /api/new-game` → `{ gameId, userCards }`
- `POST /api/submit-hand` → scores round and returns both players’ arranged hands + evaluation + explanation

