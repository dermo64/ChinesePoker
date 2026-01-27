import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createShuffledDeck, deal } from './game/cards.js';
import { gameStore } from './game/sessionStore.js';
import { arrangeWithMonteCarlo, estimateArrangementEv } from './game/ai.js';
import { evaluate5, evaluate3, describeHandValue } from './game/evaluator.js';
import { isLegalArrangement, compareFrontToFive, compareFive } from './game/rules.js';
import { scoreRound } from './game/scoring.js';

export const router = express.Router();

router.post('/new-game', (_req: Request, res: Response) => {
  const deck = createShuffledDeck();
  const { handA: userCards, handB: computerCards } = deal(deck, 13);

  const gameId = randomUUID();
  gameStore.set(gameId, {
    gameId,
    userCards,
    computerCards,
    createdAt: Date.now()
  });

  res.json({ gameId, userCards });
});

const SuggestSchema = z.object({
  gameId: z.string().min(1)
});

router.post('/suggest-hand', async (req: Request, res: Response) => {
  const parsed = SuggestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }

  const { gameId } = parsed.data;
  const game = gameStore.get(gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const suggestion = await arrangeWithMonteCarlo(game.userCards);
  const ev = await estimateArrangementEv(game.userCards, suggestion);

  const frontVal = evaluate3(suggestion.front);
  const middleVal = evaluate5(suggestion.middle);
  const backVal = evaluate5(suggestion.back);
  const legal = isLegalArrangement({ frontVal, middleVal, backVal });
  if (!legal) {
    res.status(500).json({ error: 'Suggestion was illegal (unexpected)' });
    return;
  }

  res.json({
    gameId,
    ev,
    suggestion: {
      front: { cards: suggestion.front, rank: describeHandValue(frontVal) },
      middle: { cards: suggestion.middle, rank: describeHandValue(middleVal) },
      back: { cards: suggestion.back, rank: describeHandValue(backVal) }
    }
  });
});

const SubmitSchema = z.object({
  gameId: z.string().min(1),
  front: z.array(z.string()).length(3),
  middle: z.array(z.string()).length(5),
  back: z.array(z.string()).length(5)
});

router.post('/submit-hand', async (req: Request, res: Response) => {
  const parsed = SubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }

  const { gameId, front, middle, back } = parsed.data;
  const game = gameStore.get(gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const all = [...front, ...middle, ...back];
  const set = new Set(all);
  if (set.size !== 13) {
    res.status(400).json({ error: 'Duplicate cards in submission' });
    return;
  }

  const dealtSet = new Set(game.userCards);
  if (dealtSet.size !== 13) {
    res.status(500).json({ error: 'Server state invalid: user cards corrupted' });
    return;
  }
  for (const c of all) {
    if (!dealtSet.has(c)) {
      res.status(400).json({ error: `Submitted card not in dealt hand: ${c}` });
      return;
    }
  }

  // Compute computer arrangement on demand.
  const computerArrangement = await arrangeWithMonteCarlo(game.computerCards);

  const userArrangement = { front, middle, back };

  // Evaluate user
  const userFrontVal = evaluate3(front);
  const userMiddleVal = evaluate5(middle);
  const userBackVal = evaluate5(back);

  // Foul detection: Back >= Middle >= Front (with 3-card front mapped into 5-card scale)
  const foulBackMiddle = compareFive(userBackVal, userMiddleVal) < 0;
  const foulMiddleFront = compareFrontToFive(userFrontVal, userMiddleVal) > 0;
  const userFoul = foulBackMiddle || foulMiddleFront;

  const userEv = await estimateArrangementEv(game.userCards, userArrangement);

  // Evaluate computer
  const compFrontVal = evaluate3(computerArrangement.front);
  const compMiddleVal = evaluate5(computerArrangement.middle);
  const compBackVal = evaluate5(computerArrangement.back);

  const compLegal = isLegalArrangement({
    frontVal: compFrontVal,
    middleVal: compMiddleVal,
    backVal: compBackVal
  });
  if (!compLegal) {
    // Should not happen (AI only generates legal), but guard anyway.
    res.status(500).json({ error: 'Computer produced illegal arrangement' });
    return;
  }

  const scored = scoreRound({
    user: {
      arrangement: userArrangement,
      values: { front: userFrontVal, middle: userMiddleVal, back: userBackVal },
      foul: userFoul
    },
    computer: {
      arrangement: computerArrangement,
      values: { front: compFrontVal, middle: compMiddleVal, back: compBackVal },
      foul: false
    }
  });

  res.json({
    gameId,
    userFoul,
    userEv,
    userHands: {
      front: { cards: front, rank: describeHandValue(userFrontVal) },
      middle: { cards: middle, rank: describeHandValue(userMiddleVal) },
      back: { cards: back, rank: describeHandValue(userBackVal) }
    },
    computerHands: {
      front: { cards: computerArrangement.front, rank: describeHandValue(compFrontVal) },
      middle: { cards: computerArrangement.middle, rank: describeHandValue(compMiddleVal) },
      back: { cards: computerArrangement.back, rank: describeHandValue(compBackVal) }
    },
    perHand: scored.perHand,
    total: scored.total,
    scoop: scored.scoop,
    explanation: scored.explanation
  });
});

router.get('/game/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const game = gameStore.get(id);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  res.json({
    gameId: game.gameId,
    userCards: game.userCards,
    // Intentionally included for debugging; remove if you want strict hidden info.
    computerCards: game.computerCards,
    createdAt: game.createdAt
  });
});
