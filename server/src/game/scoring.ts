import type { HandValue } from './evaluator.js';
import { compareFive, compareFrontToFive, compareLex, frontCategoryToFiveScale } from './rules.js';

export type Arrangement = {
  front: string[];
  middle: string[];
  back: string[];
};

export type RoundInput = {
  user: {
    arrangement: Arrangement;
    values: { front: HandValue; middle: HandValue; back: HandValue };
    foul: boolean;
  };
  computer: {
    arrangement: Arrangement;
    values: { front: HandValue; middle: HandValue; back: HandValue };
    foul: boolean;
  };
};

function compareFront(a: HandValue, b: HandValue): number {
  if (a.size !== 3 || b.size !== 3) throw new Error('compareFront expects (3,3)');
  if (a.category !== b.category) return a.category > b.category ? 1 : -1;
  return compareLex(a.tiebreak, b.tiebreak);
}

export function scoreRound(input: RoundInput) {
  const { user, computer } = input;

  // Foul policy: accept but auto-loss
  if (user.foul) {
    return {
      perHand: {
        front: -1,
        middle: -1,
        back: -1
      },
      scoop: true,
      total: -6,
      explanation:
        'Foul: your hands violate Back >= Middle >= Front. Automatic loss (-6).'
    };
  }

  // Computer foul not expected; if it happens, give user auto-win
  if (computer.foul) {
    return {
      perHand: {
        front: 1,
        middle: 1,
        back: 1
      },
      scoop: true,
      total: 6,
      explanation: 'Computer foul: automatic win (+6).'
    };
  }

  const frontRes = compareFront(user.values.front, computer.values.front);
  const middleRes = compareFive(user.values.middle, computer.values.middle);
  const backRes = compareFive(user.values.back, computer.values.back);

  const perHand = {
    front: frontRes,
    middle: middleRes,
    back: backRes
  };

  const base = perHand.front + perHand.middle + perHand.back;

  const userWinsAll = perHand.front === 1 && perHand.middle === 1 && perHand.back === 1;
  const userLosesAll = perHand.front === -1 && perHand.middle === -1 && perHand.back === -1;

  let total = base;
  let scoop = false;

  if (userWinsAll) {
    scoop = true;
    total += 3;
  } else if (userLosesAll) {
    scoop = true;
    total -= 3;
  }

  const explanationParts: string[] = [];
  explanationParts.push(`Front: ${perHand.front === 1 ? 'win' : perHand.front === -1 ? 'loss' : 'tie'}`);
  explanationParts.push(`Middle: ${perHand.middle === 1 ? 'win' : perHand.middle === -1 ? 'loss' : 'tie'}`);
  explanationParts.push(`Back: ${perHand.back === 1 ? 'win' : perHand.back === -1 ? 'loss' : 'tie'}`);
  if (userWinsAll) explanationParts.push('Scoop bonus: +3');
  if (userLosesAll) explanationParts.push('Scoop penalty: -3');

  return {
    perHand,
    scoop,
    total,
    explanation: explanationParts.join(' | ')
  };
}
