import { createShuffledDeck } from '../game/cards.js';
import { arrangeWithMonteCarloWithEv, estimateArrangementEv } from '../game/ai.js';

async function runOnce(index: number) {
  const deck = createShuffledDeck();
  const cards13 = deck.slice(0, 13);

  const start = performance.now();
  const { arrangement, ev } = await arrangeWithMonteCarloWithEv(cards13);
  const ms = performance.now() - start;

  const sanityEv = await estimateArrangementEv(cards13, arrangement);

  console.log(`Run ${index + 1}: ${ms.toFixed(1)}ms, bestEv=${ev.toFixed(2)}, sanityEv=${sanityEv.toFixed(2)}`);

  return { ms, ev, sanityEv };
}

async function main() {
  const runs = Number(process.env.BENCH_RUNS ?? 3);
  const results = [] as Array<{ ms: number; ev: number; sanityEv: number }>;

  for (let i = 0; i < runs; i++) {
    results.push(await runOnce(i));
  }

  const avgMs = results.reduce((acc, r) => acc + r.ms, 0) / results.length;
  const avgEv = results.reduce((acc, r) => acc + r.ev, 0) / results.length;
  const avgSanity = results.reduce((acc, r) => acc + r.sanityEv, 0) / results.length;

  console.log(`Average: ${avgMs.toFixed(1)}ms, bestEv=${avgEv.toFixed(2)}, sanityEv=${avgSanity.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
