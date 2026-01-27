import { createDeck } from './cards.js';
import { evaluate3, evaluate5 } from './evaluator.js';
import { frontCategoryToFiveScale, isLegalArrangement } from './rules.js';
import { randomPartition13 } from './partition.js';
import { scoreRound } from './scoring.js';
import { log } from '../util/log.js';
export const AI_CONSTANTS = {
    NUM_CANDIDATES: Number(process.env.NUM_CANDIDATES ?? 500),
    NUM_ROLLOUTS: Number(process.env.NUM_ROLLOUTS ?? 500),
    TIME_BUDGET_MS: Number(process.env.TIME_BUDGET_MS ?? 10000),
    OPPONENT_HEURISTIC_TRIES: Number(process.env.OPPONENT_HEURISTIC_TRIES ?? 40),
    LOCAL_SEARCH_STEPS: Number(process.env.LOCAL_SEARCH_STEPS ?? 4),
    EVAL_NUM_ROLLOUTS: Number(process.env.EVAL_NUM_ROLLOUTS ?? 300),
    EVAL_TIME_BUDGET_MS: Number(process.env.EVAL_TIME_BUDGET_MS ?? 1000)
};
function nowMs() {
    return Date.now();
}
function setSubtract(a, b) {
    return a.filter((x) => !b.has(x));
}
function sample13(from) {
    // Fisher-Yates partial shuffle first 13
    const a = [...from];
    for (let i = 0; i < 13; i++) {
        const j = i + Math.floor(Math.random() * (a.length - i));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, 13);
}
function strengthHeuristic(arr) {
    const f = evaluate3(arr.front);
    const m = evaluate5(arr.middle);
    const b = evaluate5(arr.back);
    // Simple weighted sum by category + top kickers
    const fv = f.category * 100 + (f.tiebreak[0] ?? 0);
    const mv = m.category * 100 + (m.tiebreak[0] ?? 0);
    const bv = b.category * 100 + (b.tiebreak[0] ?? 0);
    return fv + mv * 2 + bv * 3;
}
function candidateHeuristic(args) {
    const { frontVal: f, middleVal: m, backVal: b } = args;
    const fCat = frontCategoryToFiveScale(f);
    const fv = fCat * 100 + (f.tiebreak[0] ?? 0);
    const mv = m.category * 100 + (m.tiebreak[0] ?? 0);
    const bv = b.category * 100 + (b.tiebreak[0] ?? 0);
    return fv * 2 + mv + bv;
}
function swapCards(arr, a, ai, b, bi) {
    const next = {
        front: [...arr.front],
        middle: [...arr.middle],
        back: [...arr.back]
    };
    const tmp = next[a][ai];
    next[a][ai] = next[b][bi];
    next[b][bi] = tmp;
    return next;
}
function localImprove(seed, steps) {
    const seedFront = evaluate3(seed.front);
    const seedMiddle = evaluate5(seed.middle);
    const seedBack = evaluate5(seed.back);
    if (!isLegalArrangement({ frontVal: seedFront, middleVal: seedMiddle, backVal: seedBack }))
        return null;
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
        const consider = (cand) => {
            const f = evaluate3(cand.front);
            const m = evaluate5(cand.middle);
            const b = evaluate5(cand.back);
            if (!isLegalArrangement({ frontVal: f, middleVal: m, backVal: b }))
                return;
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
            for (const j of middleIdx)
                consider(swapCards(bestArr, 'front', i, 'middle', j));
            for (const j of backIdx)
                consider(swapCards(bestArr, 'front', i, 'back', j));
        }
        for (const i of middleIdx) {
            for (const j of backIdx)
                consider(swapCards(bestArr, 'middle', i, 'back', j));
        }
        if (!improved)
            break;
    }
    return { arrangement: bestArr, frontVal: bestFront, middleVal: bestMiddle, backVal: bestBack };
}
function arrangeHeuristic(cards13, tries) {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < tries; i++) {
        const cand = randomPartition13(cards13);
        const f = evaluate3(cand.front);
        const m = evaluate5(cand.middle);
        const b = evaluate5(cand.back);
        if (!isLegalArrangement({ frontVal: f, middleVal: m, backVal: b }))
            continue;
        const s = strengthHeuristic(cand);
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
            const f = evaluate3(cand.front);
            const m = evaluate5(cand.middle);
            const b = evaluate5(cand.back);
            if (isLegalArrangement({ frontVal: f, middleVal: m, backVal: b }))
                return cand;
        }
    }
    return best;
}
async function yieldToEventLoop() {
    await new Promise((resolve) => setImmediate(resolve));
}
export async function estimateArrangementEv(knownCards13, arrangement) {
    const t0 = nowMs();
    const deck = createDeck();
    const known = new Set(knownCards13);
    const remaining = setSubtract(deck, known);
    const candFront = evaluate3(arrangement.front);
    const candMiddle = evaluate5(arrangement.middle);
    const candBack = evaluate5(arrangement.back);
    if (!isLegalArrangement({ frontVal: candFront, middleVal: candMiddle, backVal: candBack })) {
        return Number.NaN;
    }
    let sum = 0;
    let rollouts = 0;
    for (let r = 0; r < AI_CONSTANTS.EVAL_NUM_ROLLOUTS; r++) {
        if (nowMs() - t0 > AI_CONSTANTS.EVAL_TIME_BUDGET_MS)
            break;
        const opp13 = sample13(remaining);
        const oppArr = arrangeHeuristic(opp13, AI_CONSTANTS.OPPONENT_HEURISTIC_TRIES);
        const oppFront = evaluate3(oppArr.front);
        const oppMiddle = evaluate5(oppArr.middle);
        const oppBack = evaluate5(oppArr.back);
        const scored = scoreRound({
            user: {
                arrangement: oppArr,
                values: { front: oppFront, middle: oppMiddle, back: oppBack },
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
        if (r % 80 === 79)
            await yieldToEventLoop();
    }
    if (rollouts === 0)
        return Number.NaN;
    return sum / rollouts;
}
export async function arrangeWithMonteCarloWithEv(computerCards13) {
    const t0 = nowMs();
    const deck = createDeck();
    const known = new Set(computerCards13);
    const remaining = setSubtract(deck, known);
    let best = null;
    let bestEv = -Infinity;
    let candidatesTried = 0;
    for (let c = 0; c < AI_CONSTANTS.NUM_CANDIDATES; c++) {
        if (nowMs() - t0 > AI_CONSTANTS.TIME_BUDGET_MS)
            break;
        const seed = randomPartition13(computerCards13);
        const improved = localImprove(seed, AI_CONSTANTS.LOCAL_SEARCH_STEPS);
        if (!improved)
            continue;
        const cand = improved.arrangement;
        const candFront = improved.frontVal;
        const candMiddle = improved.middleVal;
        const candBack = improved.backVal;
        candidatesTried++;
        let sum = 0;
        let rollouts = 0;
        for (let r = 0; r < AI_CONSTANTS.NUM_ROLLOUTS; r++) {
            if (nowMs() - t0 > AI_CONSTANTS.TIME_BUDGET_MS)
                break;
            const opp13 = sample13(remaining);
            const oppArr = arrangeHeuristic(opp13, AI_CONSTANTS.OPPONENT_HEURISTIC_TRIES);
            const oppFront = evaluate3(oppArr.front);
            const oppMiddle = evaluate5(oppArr.middle);
            const oppBack = evaluate5(oppArr.back);
            const scored = scoreRound({
                user: {
                    arrangement: oppArr,
                    values: { front: oppFront, middle: oppMiddle, back: oppBack },
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
            if (r % 40 === 39)
                await yieldToEventLoop();
        }
        if (rollouts === 0)
            break;
        const ev = sum / rollouts;
        if (ev > bestEv) {
            bestEv = ev;
            best = cand;
        }
        if (c % 10 === 9)
            await yieldToEventLoop();
    }
    if (!best) {
        best = arrangeHeuristic(computerCards13, 200);
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
export async function arrangeWithMonteCarlo(computerCards13) {
    const res = await arrangeWithMonteCarloWithEv(computerCards13);
    return res.arrangement;
}
