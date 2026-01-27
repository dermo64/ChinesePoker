export function compareLex(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const av = a[i] ?? -1;
        const bv = b[i] ?? -1;
        if (av !== bv)
            return av > bv ? 1 : -1;
    }
    return 0;
}
export function compareFive(a, b) {
    if (a.size !== 5 || b.size !== 5)
        throw new Error('compareFive expects two 5-card values');
    if (a.category !== b.category)
        return a.category > b.category ? 1 : -1;
    return compareLex(a.tiebreak, b.tiebreak);
}
// Map 3-card category into 5-card scale for ordering checks
// 3-card: 0 high, 1 pair, 2 trips
// 5-card: 0 high, 1 pair, 2 two-pair, 3 trips, ...
export function frontCategoryToFiveScale(front) {
    if (front.size !== 3)
        throw new Error('frontCategoryToFiveScale expects size=3');
    if (front.category === 0)
        return 0;
    if (front.category === 1)
        return 1;
    return 3;
}
// Returns >0 if front is stronger than five
export function compareFrontToFive(front, five) {
    if (front.size !== 3 || five.size !== 5)
        throw new Error('compareFrontToFive expects (3,5)');
    const fCat = frontCategoryToFiveScale(front);
    if (fCat !== five.category)
        return fCat > five.category ? 1 : -1;
    // Same category: compare kickers (pad missing kickers as -1 so 5-card usually dominates)
    return compareLex(front.tiebreak, five.tiebreak);
}
export function isLegalArrangement(args) {
    const { frontVal, middleVal, backVal } = args;
    if (compareFive(backVal, middleVal) < 0)
        return false;
    if (compareFrontToFive(frontVal, middleVal) > 0)
        return false;
    return true;
}
