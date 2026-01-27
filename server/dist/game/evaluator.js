import { parseCard } from './cards.js';
function sortDesc(nums) {
    return [...nums].sort((a, b) => b - a);
}
function isStraight(ranksDesc) {
    const uniq = Array.from(new Set(ranksDesc)).sort((a, b) => b - a);
    if (uniq.length !== 5)
        return { ok: false, high: 0 };
    const max = uniq[0];
    const min = uniq[4];
    // Wheel: A-5 straight
    if (max === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
        return { ok: true, high: 5 };
    }
    if (max - min !== 4)
        return { ok: false, high: 0 };
    for (let i = 0; i < 4; i++) {
        if (uniq[i] - 1 !== uniq[i + 1])
            return { ok: false, high: 0 };
    }
    return { ok: true, high: max };
}
export function evaluate5(cards) {
    if (cards.length !== 5)
        throw new Error('evaluate5 expects 5 cards');
    const parsed = cards.map(parseCard);
    const ranks = parsed.map((c) => c.rank);
    const suits = parsed.map((c) => c.suit);
    const ranksDesc = sortDesc(ranks);
    const flush = new Set(suits).size === 1;
    const straightInfo = isStraight(ranksDesc);
    const counts = new Map();
    for (const r of ranks)
        counts.set(r, (counts.get(r) ?? 0) + 1);
    const groups = Array.from(counts.entries())
        .map(([rank, count]) => ({ rank, count }))
        .sort((a, b) => (b.count - a.count) || (b.rank - a.rank));
    // Categories:
    // 8 Straight flush
    // 7 Four of a kind
    // 6 Full house
    // 5 Flush
    // 4 Straight
    // 3 Three of a kind
    // 2 Two pair
    // 1 One pair
    // 0 High card
    if (straightInfo.ok && flush) {
        return { size: 5, category: 8, tiebreak: [straightInfo.high] };
    }
    if (groups[0].count === 4) {
        const quad = groups[0].rank;
        const kicker = groups[1].rank;
        return { size: 5, category: 7, tiebreak: [quad, kicker] };
    }
    if (groups[0].count === 3 && groups[1].count === 2) {
        return { size: 5, category: 6, tiebreak: [groups[0].rank, groups[1].rank] };
    }
    if (flush) {
        return { size: 5, category: 5, tiebreak: sortDesc(ranks) };
    }
    if (straightInfo.ok) {
        return { size: 5, category: 4, tiebreak: [straightInfo.high] };
    }
    if (groups[0].count === 3) {
        const trips = groups[0].rank;
        const kickers = sortDesc(groups.slice(1).map((g) => g.rank));
        return { size: 5, category: 3, tiebreak: [trips, ...kickers] };
    }
    if (groups[0].count === 2 && groups[1].count === 2) {
        const highPair = Math.max(groups[0].rank, groups[1].rank);
        const lowPair = Math.min(groups[0].rank, groups[1].rank);
        const kicker = groups[2].rank;
        return { size: 5, category: 2, tiebreak: [highPair, lowPair, kicker] };
    }
    if (groups[0].count === 2) {
        const pair = groups[0].rank;
        const kickers = sortDesc(groups.slice(1).map((g) => g.rank));
        return { size: 5, category: 1, tiebreak: [pair, ...kickers] };
    }
    return { size: 5, category: 0, tiebreak: sortDesc(ranks) };
}
export function evaluate3(cards) {
    if (cards.length !== 3)
        throw new Error('evaluate3 expects 3 cards');
    const parsed = cards.map(parseCard);
    const ranks = parsed.map((c) => c.rank);
    const counts = new Map();
    for (const r of ranks)
        counts.set(r, (counts.get(r) ?? 0) + 1);
    const groups = Array.from(counts.entries())
        .map(([rank, count]) => ({ rank, count }))
        .sort((a, b) => (b.count - a.count) || (b.rank - a.rank));
    // Category mapping (3-card front):
    // 2 trips
    // 1 pair
    // 0 high card
    if (groups[0].count === 3) {
        return { size: 3, category: 2, tiebreak: [groups[0].rank] };
    }
    if (groups[0].count === 2) {
        const pair = groups[0].rank;
        const kicker = groups[1].rank;
        return { size: 3, category: 1, tiebreak: [pair, kicker] };
    }
    return { size: 3, category: 0, tiebreak: sortDesc(ranks) };
}
export function describeHandValue(v) {
    if (v.size === 3) {
        if (v.category === 2)
            return `Three of a kind (${v.tiebreak[0]})`;
        if (v.category === 1)
            return `One pair (${v.tiebreak[0]})`;
        return `High card (${v.tiebreak[0]})`;
    }
    switch (v.category) {
        case 8:
            return `Straight flush (${v.tiebreak[0]})`;
        case 7:
            return `Four of a kind (${v.tiebreak[0]})`;
        case 6:
            return `Full house (${v.tiebreak[0]} over ${v.tiebreak[1]})`;
        case 5:
            return `Flush (${v.tiebreak[0]})`;
        case 4:
            return `Straight (${v.tiebreak[0]})`;
        case 3:
            return `Three of a kind (${v.tiebreak[0]})`;
        case 2:
            return `Two pair (${v.tiebreak[0]} & ${v.tiebreak[1]})`;
        case 1:
            return `One pair (${v.tiebreak[0]})`;
        default:
            return `High card (${v.tiebreak[0]})`;
    }
}
