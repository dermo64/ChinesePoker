import { describe, expect, it } from 'vitest';
import { evaluate5, evaluate3 } from '../game/evaluator.js';
import { compareFive, compareFrontToFive, isLegalArrangement } from '../game/rules.js';

describe('evaluate5', () => {
  it('detects straight flush', () => {
    const v = evaluate5(['AS', 'KS', 'QS', 'JS', 'TS']);
    expect(v.category).toBe(8);
  });

  it('orders high card correctly', () => {
    const a = evaluate5(['AS', 'KD', 'QC', 'JH', '9S']);
    const b = evaluate5(['KS', 'QD', 'JC', '8H', '9D']);
    expect(compareFive(a, b)).toBe(1);
  });

  it('handles wheel straight', () => {
    const v = evaluate5(['AS', '2D', '3C', '4H', '5S']);
    expect(v.category).toBe(4);
    expect(v.tiebreak[0]).toBe(5);
  });
});

describe('evaluate3', () => {
  it('detects trips', () => {
    const v = evaluate3(['AS', 'AD', 'AC']);
    expect(v.category).toBe(2);
  });
});

describe('legality', () => {
  it('rejects strong front over weak middle', () => {
    const front = evaluate3(['AS', 'AD', '9C']); // pair
    const middle = evaluate5(['2S', '3D', '4C', '7H', '9S']); // high card
    const back = evaluate5(['KS', 'KD', 'QC', 'JH', 'TS']);

    expect(isLegalArrangement({ frontVal: front, middleVal: middle, backVal: back })).toBe(false);
    expect(compareFrontToFive(front, middle)).toBe(1);
  });
});
