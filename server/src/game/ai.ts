import { createDeck } from './cards.js';
import { evaluate3, evaluate5 } from './evaluator.js';
import { frontCategoryToFiveScale, isLegalArrangement } from './rules.js';
import { randomPartition13 } from './partition.js';
import { scoreRound, type Arrangement } from './scoring.js';
import { log } from '../util/log.js';

export const AI_CONSTANTS = {
  NUM_CANDIDATES: Number(process.env.NUM_CANDIDATES ?? 900),
  NUM_ROLLOUTS: Number(process.env.NUM_ROLLOUTS ?? 600),
  TIME_BUDGET_MS: Number(process.env.TIME_BUDGET_MS ?? 12000),
  OPPONENT_HEURISTIC_TRIES: Number(process.env.OPPONENT_HEURISTIC_TRIES ?? 40),
  OPPONENT_MODEL: String(process.env.OPPONENT_MODEL ?? 'random_legal'),
  LOCAL_SEARCH_STEPS: Number(process.env.LOCAL_SEARCH_STEPS ?? 4),
  PRESELECT_TOP_K: Number(process.env.PRESELECT_TOP_K ?? 90),
  EVAL_NUM_ROLLOUTS: Number(process.env.EVAL_NUM_ROLLOUTS ?? 300),
  EVAL_TIME_BUDGET_MS: Number(process.env.EVAL_TIME_BUDGET_MS ?? 1000)
};

type Eval3 = (cards: string[]) => ReturnType<typeof evaluate3>;
type Eval5 = (cards: string[]) => ReturnType<typeof evaluate5>;

const MAX_ROUND_SCORE = 6;
const YIELD_EVERY = 200;

function nowMs() {
  return Date.now();
}

function setSubtract(a: string[], b: Set<string>): string[] {
  return a.filter((x) => !b.has(x));
}

function cardKey(cards: string[]): string {
  return [...cards].sort().join(',');
}

function createEvalCache(): { eval3: Eval3; eval5: Eval5 } {
  const cache3 = new Map<string, ReturnType<typeof evaluate3>>();
  const cache5 = new Map<string, ReturnType<typeof evaluate5>>();

  const eval3Cached: Eval3 = (cards) => {
    const key = cardKey(cards);
    const cached = cache3.get(key);
    if (cached) return cached;
    const val = evaluate3(cards);
    cache3.set(key, val);
    return val;
  };

  const eval5Cached: Eval5 = (cards) => {
    const key = cardKey(cards);
    const cached = cache5.get(key);
    if (cached) return cached;
    const val = evaluate5(cards);
    cache5.set(key, val);
    return val;
  };

  return { eval3: eval3Cached, eval5: eval5Cached };
}

const sampleIndexScratch: number[] = [];

function sample13(from: string[]): string[] {
  // Fisher-Yates partial shuffle over indices to avoid copying card arrays.
  const n = from.length;
  if (sampleIndexScratch.length < n) sampleIndexScratch.length = n;
  for (let i = 0; i < n; i++) sampleIndexScratch[i] = i;

  for (let i = 0; i < 13; i++) {
    const j = i + Math.floor(Math.random() * (n - i));
    const tmp = sampleIndexScratch[i];
    sampleIndexScratch[i] = sampleIndexScratch[j];
    sampleIndexScratch[j] = tmp;
  }

  const res = new Array<string>(13);
  for (let i = 0; i < 13; i++) res[i] = from[sampleIndexScratch[i]];
  return res;
}

function strengthHeuristic(arr: Arrangement, eval3: Eval3, eval5: Eval5): number {
  const f = eval3(arr.front);
  const m = eval5(arr.middle);
  const b = eval5(arr.back);
  // Simple weighted sum by category + top kickers
  const fv = f.category * 100 + (f.tiebreak[0] ?? 0);
  const mv = m.category * 100 + (m.tiebreak[0] ?? 0);
  const bv = b.category * 100 + (b.tiebreak[0] ?? 0);
  return fv + mv * 2 + bv * 3;
}

function candidateHeuristic(args: { frontVal: ReturnType<typeof evaluate3>; middleVal: ReturnType<typeof evaluate5>; backVal: ReturnType<typeof evaluate5> }): number {
  const { frontVal: f, middleVal: m, backVal: b } = args;
  const fCat = frontCategoryToFiveScale(f);
  const fv = fCat * 100 + (f.tiebreak[0] ?? 0);
  const mv = m.category * 100 + (m.tiebreak[0] ?? 0);
  const bv = b.category * 100 + (b.tiebreak[0] ?? 0);
  return fv * 2 + mv + bv;
}

function swapCards(arr: Arrangement, a: keyof Arrangement, ai: number, b: keyof Arrangement, bi: number): Arrangement {
  const next: Arrangement = {
    front: [...arr.front],
    middle: [...arr.middle],
    back: [...arr.back]
  };
  const tmp = next[a][ai];
  next[a][ai] = next[b][bi];
  next[b][bi] = tmp;
  return next;
}

function localImprove(seed: Arrangement, steps: number): {
  arrangement: Arrangement;
  frontVal: ReturnType<typeof evaluate3>;
  middleVal: ReturnType<typeof evaluate5>;
  backVal: ReturnType<typeof evaluate5>;
} | null {
  return localImproveWithEval(seed, steps, evaluate3, evaluate5);
}

function localImproveWithEval(seed: Arrangement, steps: number, eval3: Eval3, eval5: Eval5): {
  arrangement: Arrangement;
  frontVal: ReturnType<typeof evaluate3>;
  middleVal: ReturnType<typeof evaluate5>;
  backVal: ReturnType<typeof evaluate5>;
} | null {
  const seedFront = eval3(seed.front);
  const seedMiddle = eval5(seed.middle);
  const seedBack = eval5(seed.back);
  if (!isLegalArrangement({ frontVal: seedFront, middleVal: seedMiddle, backVal: seedBack })) return null;

  let bestArr = seed;
  let bestFront = seedFront;
  let bestMiddle = seedMiddle;
  let bestBack = seedBack;
  let bestH = candidateHeuristic({ frontVal: bestFront, middleVal: bestMiddle, backVal: bestBack });

  const frontIdx = [0, 1, 2];
  const middleIdx = [0, 1, 2, 3, 4];
  const backIdx = [0, 1, 2, 3, 4];

  for (let step = 0; step < steps; step++) {
    let improved = false;

    const consider = (cand: Arrangement) => {
      const f = eval3(cand.front);
      const m = eval5(cand.middle);
      const b = eval5(cand.back);
      if (!isLegalArrangement({ frontVal: f, middleVal: m, backVal: b })) return;
      const h = candidateHeuristic({ frontVal: f, middleVal: m, backVal: b });
      if (h > bestH) {
        bestH = h;
        bestArr = cand;
        bestFront = f;
        bestMiddle = m;
        bestBack = b;
        improved = true;
      }
    };

    for (const i of frontIdx) {
      for (const j of middleIdx) consider(swapCards(bestArr, 'front', i, 'middle', j));
      for (const j of backIdx) consider(swapCards(bestArr, 'front', i, 'back', j));
    }

    for (const i of middleIdx) {
      for (const j of backIdx) consider(swapCards(bestArr, 'middle', i, 'back', j));
    }

    if (!improved) break;
  }

  return { arrangement: bestArr, frontVal: bestFront, middleVal: bestMiddle, backVal: bestBack };
}

function arrangeHeuristic(cards13: string[], tries: number, eval3: Eval3, eval5: Eval5): Arrangement {
  let best: Arrangement | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < tries; i++) {
    const cand = randomPartition13(cards13);
    const f = eval3(cand.front);
    const m = eval5(cand.middle);
    const b = eval5(cand.back);
    if (!isLegalArrangement({ frontVal: f, middleVal: m, backVal: b })) continue;

    const s = strengthHeuristic(cand, eval3, eval5);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }

  // Fallback: keep trying until legal (should be fast)
  if (!best) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const cand = randomPartition13(cards13);
      const f = eval3(cand.front);
      const m = eval5(cand.middle);
      const b = eval5(cand.back);
      if (isLegalArrangement({ frontVal: f, middleVal: m, backVal: b })) return cand;
    }
  }

  return best;
}

async function yieldToEventLoop() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function randomLegalPartition(cards13: string[]): {
  arrangement: Arrangement;
  front: ReturnType<typeof evaluate3>;
  middle: ReturnType<typeof evaluate5>;
  back: ReturnType<typeof evaluate5>;
} {
  return randomLegalPartitionWithEval(cards13, evaluate3, evaluate5);
}

function randomLegalPartitionWithEval(cards13: string[], eval3: Eval3, eval5: Eval5): {
  arrangement: Arrangement;
  front: ReturnType<typeof evaluate3>;
  middle: ReturnType<typeof evaluate5>;
  back: ReturnType<typeof evaluate5>;
} {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const arr = randomPartition13(cards13);
    const f = eval3(arr.front);
    const m = eval5(arr.middle);
    const b = eval5(arr.back);
    if (isLegalArrangement({ frontVal: f, middleVal: m, backVal: b })) {
      return { arrangement: arr, front: f, middle: m, back: b };
    }
  }
}

function sampleOpponent(remaining: string[], eval3: Eval3, eval5: Eval5): {
  arrangement: Arrangement;
  front: ReturnType<typeof evaluate3>;
  middle: ReturnType<typeof evaluate5>;
  back: ReturnType<typeof evaluate5>;
} {
  const opp13 = sample13(remaining);
  if (AI_CONSTANTS.OPPONENT_MODEL === 'heuristic') {
    const oppArr = arrangeHeuristic(opp13, AI_CONSTANTS.OPPONENT_HEURISTIC_TRIES, eval3, eval5);
    const oppFront = eval3(oppArr.front);
    const oppMiddle = eval5(oppArr.middle);
    const oppBack = eval5(oppArr.back);
    return { arrangement: oppArr, front: oppFront, middle: oppMiddle, back: oppBack };
  }

  return randomLegalPartitionWithEval(opp13, eval3, eval5);
}

async function preSampleOpponents(args: {
  remaining: string[];
  count: number;
  eval3: Eval3;
  eval5: Eval5;
  t0: number;
  timeBudgetMs: number;
}): Promise<ReturnType<typeof sampleOpponent>[]> {
  const { remaining, count, eval3, eval5, t0, timeBudgetMs } = args;
  const samples: ReturnType<typeof sampleOpponent>[] = [];

  for (let i = 0; i < count; i++) {
    if (nowMs() - t0 > timeBudgetMs) break;
    samples.push(sampleOpponent(remaining, eval3, eval5));
    if (i % YIELD_EVERY === YIELD_EVERY - 1) await yieldToEventLoop();
  }

  return samples;
}

export async function estimateArrangementEv(knownCards13: string[], arrangement: Arrangement): Promise<number> {
  const t0 = nowMs();

  const { eval3, eval5 } = createEvalCache();

  const deck = createDeck();
  const known = new Set(knownCards13);
  const remaining = setSubtract(deck, known);

  const candFront = eval3(arrangement.front);
  const candMiddle = eval5(arrangement.middle);
  const candBack = eval5(arrangement.back);
  if (!isLegalArrangement({ frontVal: candFront, middleVal: candMiddle, backVal: candBack })) {
    return Number.NaN;
  }

  const opponents = await preSampleOpponents({
    remaining,
    count: AI_CONSTANTS.EVAL_NUM_ROLLOUTS,
    eval3,
    eval5,
    t0,
    timeBudgetMs: AI_CONSTANTS.EVAL_TIME_BUDGET_MS
  });

  let sum = 0;
  let rollouts = 0;

  for (let r = 0; r < opponents.length; r++) {
    if (nowMs() - t0 > AI_CONSTANTS.EVAL_TIME_BUDGET_MS) break;

    const opp = opponents[r];

    const scored = scoreRound({
      user: {
        arrangement: opp.arrangement,
        values: { front: opp.front, middle: opp.middle, back: opp.back },
        foul: false
      },
      computer: {
        arrangement,
        values: { front: candFront, middle: candMiddle, back: candBack },
        foul: false
      }
    });

    // scoreRound returns from "user" perspective, so arrangement EV is negative of that
    sum += -scored.total;
    rollouts++;

    if (r % YIELD_EVERY === YIELD_EVERY - 1) await yieldToEventLoop();
  }

  if (rollouts === 0) return Number.NaN;
  return sum / rollouts;
}

export async function arrangeWithMonteCarloWithEv(computerCards13: string[]): Promise<{ arrangement: Arrangement; ev: number }> {
  const t0 = nowMs();

  const { eval3, eval5 } = createEvalCache();

  const deck = createDeck();
  const known = new Set(computerCards13);
  const remaining = setSubtract(deck, known);

  const opponents = await preSampleOpponents({
    remaining,
    count: AI_CONSTANTS.NUM_ROLLOUTS,
    eval3,
    eval5,
    t0,
    timeBudgetMs: AI_CONSTANTS.TIME_BUDGET_MS
  });

  let best: Arrangement | null = null;
  let bestEv = -Infinity;
  let candidatesTried = 0;

  const candidates: Array<{
    arrangement: Arrangement;
    frontVal: ReturnType<typeof evaluate3>;
    middleVal: ReturnType<typeof evaluate5>;
    backVal: ReturnType<typeof evaluate5>;
    heuristic: number;
  }> = [];

  for (let c = 0; c < AI_CONSTANTS.NUM_CANDIDATES; c++) {
    if (nowMs() - t0 > AI_CONSTANTS.TIME_BUDGET_MS) break;

    const seed = randomPartition13(computerCards13);
    const improved = localImproveWithEval(seed, AI_CONSTANTS.LOCAL_SEARCH_STEPS, eval3, eval5);
    if (!improved) continue;

    const heuristic = candidateHeuristic({
      frontVal: improved.frontVal,
      middleVal: improved.middleVal,
      backVal: improved.backVal
    });

    candidates.push({
      arrangement: improved.arrangement,
      frontVal: improved.frontVal,
      middleVal: improved.middleVal,
      backVal: improved.backVal,
      heuristic
    });
    candidatesTried++;

    if (c % YIELD_EVERY === YIELD_EVERY - 1) await yieldToEventLoop();
  }

  const preselect = candidates
    .sort((a, b) => b.heuristic - a.heuristic)
    .slice(0, Math.min(AI_CONSTANTS.PRESELECT_TOP_K, candidates.length));

  for (let i = 0; i < preselect.length; i++) {
    if (nowMs() - t0 > AI_CONSTANTS.TIME_BUDGET_MS) break;

    const cand = preselect[i].arrangement;
    const candFront = preselect[i].frontVal;
    const candMiddle = preselect[i].middleVal;
    const candBack = preselect[i].backVal;

    let sum = 0;
    let rollouts = 0;
    const rolloutTarget = opponents.length > 0 ? opponents.length : AI_CONSTANTS.NUM_ROLLOUTS;

    for (let r = 0; r < rolloutTarget; r++) {
      if (nowMs() - t0 > AI_CONSTANTS.TIME_BUDGET_MS) break;

      const opp = opponents.length > 0 ? opponents[r] : sampleOpponent(remaining, eval3, eval5);

      const scored = scoreRound({
        user: {
          arrangement: opp.arrangement,
          values: { front: opp.front, middle: opp.middle, back: opp.back },
          foul: false
        },
        computer: {
          arrangement: cand,
          values: { front: candFront, middle: candMiddle, back: candBack },
          foul: false
        }
      });

      // scoreRound returns from "user" perspective, so computer EV is negative of that
      sum += -scored.total;
      rollouts++;

      if (bestEv > -Infinity) {
        const remainingRollouts = rolloutTarget - rollouts;
        const optimistic = (sum + remainingRollouts * MAX_ROUND_SCORE) / rolloutTarget;
        if (optimistic < bestEv) break;
      }

      if (r % YIELD_EVERY === YIELD_EVERY - 1) await yieldToEventLoop();
    }

    if (rollouts === 0) continue;
    const ev = sum / rollouts;

    if (ev > bestEv) {
      bestEv = ev;
      best = cand;
    }

    if (i % YIELD_EVERY === YIELD_EVERY - 1) await yieldToEventLoop();
  }

  if (!best) {
    best = arrangeHeuristic(computerCards13, 200, eval3, eval5);
    bestEv = Number.NaN;
  }

  log.debug('AI chose arrangement', {
    best,
    bestEv,
    candidatesTried,
    timeMs: nowMs() - t0,
    constants: AI_CONSTANTS
  });

  return { arrangement: best, ev: bestEv };
}

export async function arrangeWithMonteCarlo(computerCards13: string[]): Promise<Arrangement> {
  const res = await arrangeWithMonteCarloWithEv(computerCards13);
  return res.arrangement;
}
