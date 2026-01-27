import { shuffle } from './cards.js';
export function randomPartition13(cards13) {
    if (cards13.length !== 13)
        throw new Error('randomPartition13 expects 13 cards');
    const perm = shuffle(cards13);
    const front = perm.slice(0, 3);
    const middle = perm.slice(3, 8);
    const back = perm.slice(8, 13);
    return { front, middle, back };
}
