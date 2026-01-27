import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { newGame, submitHand, suggestHand } from './api';
import type { Card, SubmitHandResponse, SuggestHandResponse } from './types';
import Zone, { type DropMeta, type ZoneId } from './Zone';
import CardView, { CardBack } from './CardView';

type Zones = {
  hand: Card[];
  front: Card[];
  middle: Card[];
  back: Card[];
};

function removeOnce(arr: Card[], card: Card): Card[] {
  const idx = arr.indexOf(card);
  if (idx === -1) return arr;
  return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
}

function addIfCapacity(arr: Card[], card: Card, cap: number): Card[] {
  if (arr.length >= cap) return arr;
  return [...arr, card];
}

const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
const RANK_ORDER: Record<string, number> = {
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

function compareCardSuitRank(a: Card, b: Card): number {
  const as = SUIT_ORDER[a[1]] ?? 99;
  const bs = SUIT_ORDER[b[1]] ?? 99;
  if (as !== bs) return as - bs;
  const ar = RANK_ORDER[a[0]] ?? -1;
  const br = RANK_ORDER[b[0]] ?? -1;
  // Descending rank within suit (A high)
  return br - ar;
}

function compareCardRankOnly(a: Card, b: Card): number {
  const ar = RANK_ORDER[a[0]] ?? -1;
  const br = RANK_ORDER[b[0]] ?? -1;
  if (ar !== br) return br - ar;
  // Deterministic tie-breaker
  const as = SUIT_ORDER[a[1]] ?? 99;
  const bs = SUIT_ORDER[b[1]] ?? 99;
  return as - bs;
}

function sortZoneCards(zone: ZoneId, cards: Card[]): Card[] {
  if (zone === 'front' || zone === 'middle' || zone === 'back') {
    return [...cards].sort(compareCardRankOnly);
  }
  return cards;
}

function reorder<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return arr;
  const a = [...arr];
  const [item] = a.splice(fromIndex, 1);
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
  a.splice(insertAt, 0, item);
  return a;
}

function insertAtIndex<T>(arr: T[], item: T, toIndex: number): T[] {
  const a = [...arr];
  const idx = Math.max(0, Math.min(toIndex, a.length));
  a.splice(idx, 0, item);
  return a;
}

export default function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [zones, setZones] = useState<Zones>({ hand: [], front: [], middle: [], back: [] });
  const [dragState, setDragState] = useState<{ card: Card; from: ZoneId } | null>(null);
  const [result, setResult] = useState<SubmitHandResponse | null>(null);
  const [selectedHand, setSelectedHand] = useState<Exclude<ZoneId, 'hand'>>('back');
  const [handSortMode, setHandSortMode] = useState<'suit_rank' | 'rank_only'>('suit_rank');
  const [suggestion, setSuggestion] = useState<SuggestHandResponse | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const submitRef = useRef<HTMLDivElement | null>(null);
  const [showOutcomeEffect, setShowOutcomeEffect] = useState(false);

  const suggestionEvText = useMemo(() => {
    if (!suggestion) return null;
    if (!Number.isFinite(suggestion.ev)) return 'EV: N/A';
    return `EV: ${suggestion.ev.toFixed(2)}`;
  }, [suggestion]);

  const userEvText = useMemo(() => {
    if (!result) return null;
    if (!Number.isFinite(result.userEv)) return 'EV: N/A';
    return `EV: ${result.userEv.toFixed(2)}`;
  }, [result]);

  const playerScoop = useMemo(() => {
    if (!result || result.userFoul) return false;
    return result.perHand.front === 1 && result.perHand.middle === 1 && result.perHand.back === 1;
  }, [result]);

  useEffect(() => {
    if (!result || (!result.userFoul && !playerScoop)) {
      setShowOutcomeEffect(false);
      return;
    }
    setShowOutcomeEffect(true);
    const timer = window.setTimeout(() => setShowOutcomeEffect(false), 4000);
    return () => window.clearTimeout(timer);
  }, [result, playerScoop]);

  const canSubmit = zones.front.length === 3 && zones.middle.length === 5 && zones.back.length === 5 && !!gameId;

  async function onNewGame() {
    setBusy(true);
    setError(null);
    setResult(null);
    setRevealStep(0);
    setHandSortMode('suit_rank');
    setSelectedHand('back');
    setSuggestion(null);
    setSuggestError(null);
    const start = performance.now();
    const minDealDelayMs = 350;
    try {
      const res = await newGame();
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, minDealDelayMs - elapsed);
      if (remaining > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      }
      setGameId(res.gameId);
      setZones({ hand: res.userCards, front: [], middle: [], back: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!result) {
      setRevealStep(0);
      return;
    }

    if (result.userFoul) {
      setRevealStep(3);
      return;
    }

    setRevealStep(1);
    const t1 = window.setTimeout(() => setRevealStep(2), 2000);
    const t2 = window.setTimeout(() => setRevealStep(3), 4000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [result]);

  const revealIndex: Record<'front' | 'middle' | 'back', number> = { front: 1, middle: 2, back: 3 };

  function isRevealed(hand: keyof typeof revealIndex) {
    return revealStep >= revealIndex[hand];
  }

  function resultLabel(score: number) {
    if (score > 0) return 'You win';
    if (score < 0) return 'Computer wins';
    return 'Tie';
  }

  async function onAskComputer() {
    if (!gameId) return;
    setSuggestBusy(true);
    setSuggestError(null);
    try {
      const res = await suggestHand(gameId);
      setSuggestion(res);
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggestBusy(false);
    }
  }

  function onSortHand() {
    setZones((prev) => {
      const comparator = handSortMode === 'suit_rank' ? compareCardSuitRank : compareCardRankOnly;
      return {
        ...prev,
        hand: [...prev.hand].sort(comparator)
      };
    });
    setHandSortMode((prev) => (prev === 'suit_rank' ? 'rank_only' : 'suit_rank'));
  }

  function onDragStartCard(card: Card, from: ZoneId, _fromIndex?: number) {
    setDragState({ card, from });
  }

  function onDropCard(card: Card, from: ZoneId, to: ZoneId, meta?: DropMeta) {
    setError(null);
    setResult(null);

    const caps: Record<ZoneId, number> = { hand: 13, front: 3, middle: 5, back: 5 };

    setZones((prev) => {
      // Ensure card is actually in source.
      if (!prev[from].includes(card)) return prev;

      const fromIndex = meta?.fromIndex ?? prev[from].indexOf(card);
      const toIndex = meta?.toIndex;

      // Reorder within same zone.
      if (from === to) {
        if (from !== 'hand') return prev;
        if (toIndex === undefined) return prev;
        if (fromIndex < 0) return prev;
        return {
          ...prev,
          [from]: reorder(prev[from], fromIndex, toIndex)
        } as Zones;
      }

      // Ensure destination has room.
      if (prev[to].length >= caps[to]) return prev;

      const nextFrom = removeOnce(prev[from], card);
      const nextTo =
        toIndex === undefined
          ? addIfCapacity(prev[to], card, caps[to])
          : insertAtIndex(prev[to], card, toIndex);
      const nextToSorted =
        to === 'hand'
          ? [...nextTo].sort(handSortMode === 'suit_rank' ? compareCardSuitRank : compareCardRankOnly)
          : nextTo;

      return {
        ...prev,
        [from]: sortZoneCards(from, nextFrom),
        [to]: sortZoneCards(to, nextToSorted)
      } as Zones;
    });

    setDragState(null);
  }

  function capacityFor(hand: Exclude<ZoneId, 'hand'>): number {
    return hand === 'front' ? 3 : 5;
  }

  function playCardIntoSelected(card: Card) {
    setError(null);
    setResult(null);

    setZones((prev) => {
      if (!prev.hand.includes(card)) return prev;
      const cap = capacityFor(selectedHand);
      if (prev[selectedHand].length >= cap) return prev;

      const nextHand = removeOnce(prev.hand, card);
      const nextTarget = sortZoneCards(selectedHand, addIfCapacity(prev[selectedHand], card, cap));
      return {
        ...prev,
        hand: nextHand,
        [selectedHand]: nextTarget
      } as Zones;
    });
  }

  useEffect(() => {
    const selectedFull = zones[selectedHand].length >= capacityFor(selectedHand);
    if (!selectedFull) return;

    const nextTarget =
      zones.back.length < capacityFor('back')
        ? 'back'
        : zones.middle.length < capacityFor('middle')
          ? 'middle'
          : zones.front.length < capacityFor('front')
            ? 'front'
            : selectedHand;
    if (nextTarget !== selectedHand) {
      setSelectedHand(nextTarget);
    }
  }, [selectedHand, zones.back.length, zones.middle.length, zones.front.length]);

  useEffect(() => {
    if (result) return;
    if (zones.front.length === 3 && zones.middle.length === 5 && zones.back.length === 5) {
      submitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [zones.front.length, zones.middle.length, zones.back.length, result]);

  async function onSubmit() {
    if (!gameId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await submitHand({
        gameId,
        front: zones.front,
        middle: zones.middle,
        back: zones.back
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function renderShowdownCards(cards: Card[], revealed: boolean, keyPrefix: string, instant?: boolean) {
    return cards.map((card, idx) => (
      <div key={`${keyPrefix}-${card}-${idx}`} className={`flip-card ${revealed ? 'revealed' : ''} ${instant ? 'instant' : ''}`}>
        <div className="flip-card-inner">
          <div className="flip-card-front">
            <CardView card={card} />
          </div>
          <div className="flip-card-back">
            <CardBack />
          </div>
        </div>
      </div>
    ));
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Chinese Poker (十三张)</h1>
        <div className="header-actions">
          <button onClick={onNewGame} disabled={busy}>
            New Game
          </button>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {showOutcomeEffect && result && (
        <div className={`showdown-effects ${result.userFoul ? 'foul' : 'scoop'}`}>
          <div className="effect-banner">{result.userFoul ? 'FOUL' : 'SCOOP!'}</div>
          <div className="emoji-rain">
            {Array.from({ length: 18 }).map((_, idx) => (
              <span
                key={`emoji-${idx}`}
                className="emoji"
                style={{
                  left: `${(idx * 5.5 + 3) % 100}%`,
                  animationDelay: `${(idx % 6) * 0.25}s`,
                  animationDuration: `${3 + (idx % 5) * 0.35}s`
                }}
              >
                {result.userFoul ? '💩' : '🍨'}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="board">
        {result && (
          <section className="showdown">
            <h2>Showdown</h2>
            {result.userFoul && <div className="showdown-banner foul">Foul hand — automatic loss</div>}
            {(['front', 'middle', 'back'] as const).map((hand) => {
              const revealed = !!result?.userFoul || isRevealed(hand);
              const outcome = result.perHand[hand];
              const outcomeClass = outcome > 0 ? 'win' : outcome < 0 ? 'loss' : 'tie';
              const label = hand === 'back' ? 'Back' : hand === 'middle' ? 'Middle' : 'Front';
              return (
                <div key={hand} className={`showdown-row baize-surface ${revealed ? 'revealed' : 'hidden'}`}>
                  <div className="showdown-side">
                    <div className="showdown-label">You</div>
                    {revealed && <div className="showdown-rank">{result.userHands[hand].rank}</div>}
                    <div className="showdown-cards">
                      {renderShowdownCards(result.userHands[hand].cards, revealed, `user-${hand}`, result.userFoul)}
                    </div>
                  </div>
                  <div className="showdown-center">
                    <div className="showdown-hand-name">{label}</div>
                    {revealed && <div className={`showdown-result ${outcomeClass}`}>{resultLabel(outcome)}</div>}
                  </div>
                  <div className="showdown-side">
                    <div className="showdown-label">Computer</div>
                    {revealed && <div className="showdown-rank">{result.computerHands[hand].rank}</div>}
                    <div className="showdown-cards">
                      {renderShowdownCards(result.computerHands[hand].cards, revealed, `cpu-${hand}`, result.userFoul)}
                    </div>
                  </div>
                </div>
              );
            })}
            {(result.userFoul || revealStep >= revealIndex.back) && (
              <div className="showdown-score">
                <div className="showdown-score-title">Score</div>
                <div className="showdown-score-grid">
                  <div>{userEvText ?? 'EV: N/A'}</div>
                  <div>Front: {result.perHand.front}</div>
                  <div>Middle: {result.perHand.middle}</div>
                  <div>Back: {result.perHand.back}</div>
                  <div>Scoop: {result.scoop ? 'Yes' : 'No'}</div>
                  <div className="showdown-score-total">Total: {result.total}</div>
                </div>
                <div className="showdown-score-explanation">{result.explanation}</div>
              </div>
            )}
          </section>
        )}

        {!result && (
          <>
            {zones.hand.length > 0 && (
              <div className="hand-row">
                <Zone
                  title="Your Cards"
                  zoneId="hand"
                  cards={zones.hand}
                  capacity={13}
                  onDropCard={onDropCard}
                  onDragStartCard={onDragStartCard}
                  enableIndexedDrop
                  onCardClick={(card: Card) => {
                    playCardIntoSelected(card);
                  }}
                  headerRight={
                    <button className="btn-secondary" onClick={onSortHand} disabled={busy || zones.hand.length === 0}>
                      {handSortMode === 'suit_rank' ? 'Sort by suit' : 'Sort by value'}
                    </button>
                  }
                  highlight={dragState?.from !== 'hand'}
                  className="zone-hand baize-zone"
                />
              </div>
            )}

            <div className="zones">
              <Zone
                title="Back (5)"
                zoneId="back"
                cards={zones.back}
                capacity={5}
                onDropCard={onDropCard}
                onDragStartCard={onDragStartCard}
                highlight={dragState?.from !== 'back'}
                selected={selectedHand === 'back'}
                onSelect={() => setSelectedHand('back')}
                onCardClick={(card: Card, idx: number) => {
                  onDropCard(card, 'back', 'hand', { fromIndex: idx, toIndex: zones.hand.length });
                }}
                className="baize-zone zone-compact"
              />
              <Zone
                title="Middle (5)"
                zoneId="middle"
                cards={zones.middle}
                capacity={5}
                onDropCard={onDropCard}
                onDragStartCard={onDragStartCard}
                highlight={dragState?.from !== 'middle'}
                selected={selectedHand === 'middle'}
                onSelect={() => setSelectedHand('middle')}
                onCardClick={(card: Card, idx: number) => {
                  onDropCard(card, 'middle', 'hand', { fromIndex: idx, toIndex: zones.hand.length });
                }}
                className="baize-zone zone-compact"
              />
              <Zone
                title="Front (3)"
                zoneId="front"
                cards={zones.front}
                capacity={3}
                onDropCard={onDropCard}
                onDragStartCard={onDragStartCard}
                highlight={dragState?.from !== 'front'}
                selected={selectedHand === 'front'}
                onSelect={() => setSelectedHand('front')}
                onCardClick={(card: Card, idx: number) => {
                  onDropCard(card, 'front', 'hand', { fromIndex: idx, toIndex: zones.hand.length });
                }}
                className="baize-zone zone-compact"
              />
            </div>

            <div className="submit-row" ref={submitRef}>
              <div className="submit-panel">
                <button onClick={onSubmit} disabled={busy || !canSubmit}>
                  Submit
                </button>
              </div>
            </div>

          </>
        )}
      </div>

      <section className="results suggestion-panel">
        <div>
          <div className="header-actions" style={{ justifyContent: 'flex-start', marginBottom: 10 }}>
            <button onClick={onAskComputer} disabled={!gameId || suggestBusy}>
              {suggestBusy ? 'Thinking…' : 'Ask Computer'}
            </button>
          </div>
          {suggestError && <div className="alert alert-error">{suggestError}</div>}
          {!suggestion && <div className="muted">Click “Ask Computer” to see how it would arrange your 13 cards.</div>}
          {suggestion && (
            <div>
              <div className="score-line">{suggestionEvText}</div>
              <div className="results-grid">
                <div className="result-col">
                  <h3>Suggested Back</h3>
                  <div className="result-hand-rank">{suggestion.suggestion.back.rank}</div>
                  <div className="result-hand-cards">{suggestion.suggestion.back.cards.join(' ')}</div>
                </div>
                <div className="result-col">
                  <h3>Suggested Middle</h3>
                  <div className="result-hand-rank">{suggestion.suggestion.middle.rank}</div>
                  <div className="result-hand-cards">{suggestion.suggestion.middle.cards.join(' ')}</div>
                </div>
                <div className="result-col">
                  <h3>Suggested Front</h3>
                  <div className="result-hand-rank">{suggestion.suggestion.front.rank}</div>
                  <div className="result-hand-cards">{suggestion.suggestion.front.cards.join(' ')}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
