const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
const SUITS = ['S', 'H', 'D', 'C'] as const;

export type Card = string; // e.g. "AS", "TD"

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(`${r}${s}`);
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createShuffledDeck(): Card[] {
  return shuffle(createDeck());
}

export function deal(deck: Card[], handSize: number) {
  if (deck.length < handSize * 2) {
    throw new Error('Deck too small to deal');
  }
  const handA = deck.slice(0, handSize);
  const handB = deck.slice(handSize, handSize * 2);
  return { handA, handB };
}

export const rankToValue: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

export function parseCard(card: Card) {
  if (typeof card !== 'string' || card.length !== 2) throw new Error(`Invalid card: ${card}`);
  const r = card[0];
  const s = card[1];
  const rv = rankToValue[r];
  if (!rv) throw new Error(`Invalid rank: ${card}`);
  if (s !== 'S' && s !== 'H' && s !== 'D' && s !== 'C') throw new Error(`Invalid suit: ${card}`);
  return { rank: rv, suit: s as 'S' | 'H' | 'D' | 'C' };
}
