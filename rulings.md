# Rulings

Edge cases the engine commits to, in the sibling convention: one line per ruling,
each backed by a test in `test/scoring.test.ts` or `test/engine.test.ts`.

- **RL-1** Yacht Full House requires exactly 3+2 — five of a kind scores 0 there.
- **RL-2** Yacht Four of a Kind scores only the four matched dice (5×5s → 20, not 25).
- **RL-3** Yacht straights are the exact sets 1-5 / 2-6; a Yahtzee-style 4-run does not count.
- **RL-4** Yahtzee-style 3K/4K score the sum of ALL five dice.
- **RL-5** Upper bonus threshold is inclusive: exactly 63 earns the 35.
- **RL-6** Joker activates only when the dice are five of a kind AND the fiveKind box is filled — with 50 *or* 0.
- **RL-7** The +100 bonus additionally requires the fiveKind box to hold a 50 (a zeroed box pays nothing).
- **RL-8** Joker priority is upper-match → any lower → zero an upper; enforced in `legalMoves`, not just scoring.
- **RL-9** Under a Joker, Full House/Small/Large Straight score their fixed values (25/30/40).
- **RL-10** A player may not hold dice before their first roll of a turn, and may not "roll" with all five held.
- **RL-11** Die faces are drawn from the shared seeded stream inside `applyMove` — one draw per unheld die, in die order. Faces are never read from the wire.
- **RL-12** Ties split the pot: every seat at the top total is a winner.
