import { describe, expect, it } from 'vitest';
import { arrangeWithMonteCarloWithEv, estimateArrangementEv } from '../game/ai.js';
import { isLegalArrangement } from '../game/rules.js';
import { evaluate3, evaluate5 } from '../game/evaluator.js';

const TEST_HAND = ['AS', 'KS', 'QS', 'JS', 'TS', '9S', '8S', '7S', '6S', '5S', '4S', '3S', '2S'];

function isLegal(arrangement: { front: string[]; middle: string[]; back: string[] }) {
  const frontVal = evaluate3(arrangement.front);
  const middleVal = evaluate5(arrangement.middle);
  const backVal = evaluate5(arrangement.back);
  return isLegalArrangement({ frontVal, middleVal, backVal });
}

describe('ai Monte Carlo', () => {
  it('returns a legal arrangement and finite EV for a known hand', async () => {
    const { arrangement, ev } = await arrangeWithMonteCarloWithEv(TEST_HAND);
    expect(isLegal(arrangement)).toBe(true);
    expect(Number.isFinite(ev)).toBe(true);
  }, 20000);

  it('estimateArrangementEv returns a finite EV for a legal arrangement', async () => {
    const { arrangement } = await arrangeWithMonteCarloWithEv(TEST_HAND);
    const ev = await estimateArrangementEv(TEST_HAND, arrangement);
    expect(Number.isFinite(ev)).toBe(true);
  }, 20000);
});
