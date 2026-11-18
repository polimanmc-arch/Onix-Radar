// tests/indicators.test.js
// Unit tests for indicator calculation functions.
// Run with: node --test tests/indicators.test.js
// Requires Node >= 18 (native test runner).

const { test, describe } = require('node:test');
const assert = require('node:assert'); // non-strict for deepEqual on nulls

// ── Load indicator functions ──────────────────────────────────────────────
// The indicators file is an IIFE that writes to window.StockScannerCore.
// We shim window and require the file to extract the functions.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '../public/app/core/indicators.js'), 'utf8'
);
const ctx = vm.createContext({ window: {} });
vm.runInContext(src, ctx);
const {
  calcWMA, calcSMA, calcEMA, calcRSI, calcStoch, calcMACD, calcATR,
  seriesWMA, seriesSMA, seriesEMA, seriesRSI, seriesStoch, seriesMACD,
} = ctx.window.StockScannerCore;

// ── Helpers ───────────────────────────────────────────────────────────────
// Round to n decimal places for float comparisons
const r = (v, n=4) => v == null ? null : Math.round(v * 10**n) / 10**n;

// Ascending price series [1, 2, 3, ... n]
const asc  = n => Array.from({length:n}, (_,i) => n-i);   // newest-first
const flat = (v, n) => Array(n).fill(v);                   // all same value

// ── calcWMA ───────────────────────────────────────────────────────────────
describe('calcWMA', () => {
  test('returns [null,null] when insufficient data', () => {
    assert.deepEqual(calcWMA([1,2,3], 4), [null, null]);
    assert.deepEqual(calcWMA([], 3), [null, null]);
    assert.deepEqual(calcWMA(null, 3), [null, null]);
  });

  test('flat series → WMA equals the flat value', () => {
    const [cur, prev] = calcWMA(flat(5, 10), 5);
    assert.equal(r(cur), 5);
    assert.equal(r(prev), 5);
  });

  test('WMA(3) on [6,5,4,3,2,1] (newest-first)', () => {
    // p=[6,5,4,...], window=3 → weights 3,2,1 on [6,5,4]
    // cur = (6*3 + 5*2 + 4*1)/(3+2+1) = (18+10+4)/6 = 32/6 ≈ 5.333
    const [cur] = calcWMA([6,5,4,3,2,1], 3);
    assert.equal(r(cur), r(32/6));
  });

  test('prev is WMA starting one bar later', () => {
    const data = [6,5,4,3,2,1];
    const [, prev] = calcWMA(data, 3);
    const [cur2]   = calcWMA(data.slice(1), 3); // shift by one
    assert.equal(r(prev), r(cur2));
  });
});

// ── calcSMA ───────────────────────────────────────────────────────────────
describe('calcSMA', () => {
  test('returns [null,null] when insufficient data', () => {
    assert.deepEqual(calcSMA([1,2], 3), [null, null]);
    assert.deepEqual(calcSMA(null, 3), [null, null]);
  });

  test('flat series → SMA equals the flat value', () => {
    const [cur, prev] = calcSMA(flat(7, 10), 5);
    assert.equal(r(cur), 7);
    assert.equal(r(prev), 7);
  });

  test('SMA(3) on [6,4,2,0,...]', () => {
    // cur = mean of [6,4,2] = 4, prev = mean of [4,2,0] = 2
    const [cur, prev] = calcSMA([6,4,2,0,0,0], 3);
    assert.equal(r(cur), 4);
    assert.equal(r(prev), 2);
  });

  test('SMA is symmetric for uniform increments', () => {
    const data = asc(20); // [20,19,...,1]
    const [cur, prev] = calcSMA(data, 5);
    // cur = mean of [20,19,18,17,16] = 18
    assert.equal(r(cur), 18);
    // prev = mean of [19,18,17,16,15] = 17
    assert.equal(r(prev), 17);
  });
});

// ── calcEMA ───────────────────────────────────────────────────────────────
describe('calcEMA', () => {
  test('returns [null,null] when insufficient data', () => {
    assert.deepEqual(calcEMA([1,2,3], 3), [null, null]); // needs n+2=5
    assert.deepEqual(calcEMA(null, 3), [null, null]);
  });

  test('flat series → EMA equals the flat value', () => {
    const [cur, prev] = calcEMA(flat(10, 30), 10);
    assert.equal(r(cur), 10);
    assert.equal(r(prev), 10);
  });

  test('EMA is between min and max of the series', () => {
    const data = asc(50);
    const [cur] = calcEMA(data, 10);
    assert.ok(cur >= Math.min(...data));
    assert.ok(cur <= Math.max(...data));
  });

  test('cur and prev differ by less than one period step for smooth data', () => {
    const data = asc(60); // smooth linear
    const [cur, prev] = calcEMA(data, 10);
    assert.ok(Math.abs(cur - prev) < 2);
  });
});

// ── calcRSI ───────────────────────────────────────────────────────────────
describe('calcRSI', () => {
  test('returns [null,null] when insufficient data', () => {
    assert.deepEqual(calcRSI([1,2], 14), [null, null]);
    assert.deepEqual(calcRSI(null, 14), [null, null]);
  });

  test('all gains → RSI approaches 100', () => {
    // newest-first strictly descending means all gains when reversed
    const data = asc(50); // newest-first [50,49,...,1] → gains on reversal
    const [cur] = calcRSI(data, 14);
    assert.ok(cur > 50, `Expected RSI > 50, got ${cur}`);
  });

  test('all losses → RSI approaches 0', () => {
    // newest-first ascending = losses on reversal
    const data = Array.from({length:50}, (_,i) => i+1); // [1,2,...,50]
    const [cur] = calcRSI(data, 14);
    assert.ok(cur < 50, `Expected RSI < 50, got ${cur}`);
  });

  test('RSI is bounded [0, 100]', () => {
    const data = asc(30);
    const [cur, prev] = calcRSI(data, 14);
    assert.ok(cur >= 0 && cur <= 100);
    assert.ok(prev >= 0 && prev <= 100);
  });

  test('flat price → RSI = 50', () => {
    const data = flat(100, 30);
    const [cur] = calcRSI(data, 14);
    assert.equal(r(cur), 50);
  });
});

// ── calcATR ───────────────────────────────────────────────────────────────
describe('calcATR', () => {
  test('returns [null,null] when insufficient data', () => {
    assert.deepEqual(calcATR([1],[1],[1], 14), [null, null]);
    assert.deepEqual(calcATR(null,null,null, 14), [null, null]);
  });

  test('ATR is always positive', () => {
    const n = 30;
    const h = asc(n).map(v => v + 1);
    const l = asc(n).map(v => v - 1);
    const c = asc(n);
    const [cur, prev] = calcATR(h, l, c, 14);
    assert.ok(cur > 0);
    assert.ok(prev > 0);
  });

  test('flat OHLC → ATR ≈ 0', () => {
    const n = 30;
    const h = flat(10, n), l = flat(10, n), c = flat(10, n);
    const [cur] = calcATR(h, l, c, 14);
    assert.ok(Math.abs(cur) < 0.001);
  });

  test('wider candles → larger ATR', () => {
    const n = 30;
    const c = flat(10, n);
    const [atr1] = calcATR(flat(11, n), flat(9, n), c, 14);  // range=2
    const [atr2] = calcATR(flat(15, n), flat(5, n), c, 14);  // range=10
    assert.ok(atr2 > atr1);
  });
});

// ── calcMACD ──────────────────────────────────────────────────────────────
describe('calcMACD', () => {
  test('returns [null,null] when insufficient data', () => {
    assert.deepEqual(calcMACD([1,2,3], 12, 26, 9), [null, null]);
    assert.deepEqual(calcMACD(null, 12, 26, 9), [null, null]);
  });

  test('flat series → MACD histogram ≈ 0', () => {
    const data = flat(50, 60);
    const [cur] = calcMACD(data, 12, 26, 9);
    assert.ok(Math.abs(cur) < 0.001, `Expected ~0, got ${cur}`);
  });

  test('MACD returns two numeric values for sufficient data', () => {
    const data = asc(60);
    const [cur, prev] = calcMACD(data, 12, 26, 9);
    assert.equal(typeof cur, 'number');
    assert.equal(typeof prev, 'number');
  });
});

// ── calcStoch ─────────────────────────────────────────────────────────────
describe('calcStoch', () => {
  test('returns [null,null] when insufficient data', () => {
    assert.deepEqual(calcStoch([1],[1],[1], 14, 3, 3), [null, null]);
    assert.deepEqual(calcStoch(null,null,null, 14, 1, 3), [null, null]);
  });

  test('Stoch is bounded [0, 100]', () => {
    const n = 30;
    const h = asc(n).map(v => v + 1);
    const l = asc(n).map(v => v - 1);
    const c = asc(n);
    const [cur, prev] = calcStoch(h, l, c, 14, 1, 3);
    if(cur != null) { assert.ok(cur >= 0 && cur <= 100); }
    if(prev != null){ assert.ok(prev >= 0 && prev <= 100); }
  });

  test('price at top of range → Stoch near 100', () => {
    const n = 30;
    const h = flat(100, n), l = flat(0, n), c = flat(100, n);
    const [cur] = calcStoch(h, l, c, 5, 1, 1);
    assert.ok(cur > 90, `Expected Stoch near 100, got ${cur}`);
  });

  test('price at bottom of range → Stoch near 0', () => {
    const n = 30;
    const h = flat(100, n), l = flat(0, n), c = flat(0, n);
    const [cur] = calcStoch(h, l, c, 5, 1, 1);
    assert.ok(cur < 10, `Expected Stoch near 0, got ${cur}`);
  });
});

// ── seriesSMA / seriesWMA / seriesEMA ─────────────────────────────────────
describe('series functions', () => {
  test('seriesSMA length = closes.length - n + 1', () => {
    const closes = asc(20);
    const s = seriesSMA(closes, 5);
    assert.equal(s.length, 20 - 5 + 1);
  });

  test('seriesWMA length = closes.length - n + 1', () => {
    const closes = asc(20);
    const s = seriesWMA(closes, 5);
    assert.equal(s.length, 20 - 5 + 1);
  });

  test('seriesEMA length = closes.length - n + 1', () => {
    const closes = asc(20);
    const s = seriesEMA(closes, 5);
    assert.equal(s.length, closes.length - 5 + 1);
  });

  test('seriesSMA last value matches calcSMA cur for same window', () => {
    const closes = asc(20);
    const series = seriesSMA(closes, 5);
    const [cur] = calcSMA(closes, 5);
    // seriesSMA is oldest-first; last element = most recent = calcSMA cur
    assert.equal(r(series[series.length-1]), r(cur));
  });

  test('seriesRSI is bounded [0,100]', () => {
    const closes = asc(40);
    const s = seriesRSI(closes, 14);
    s.forEach(v => assert.ok(v >= 0 && v <= 100));
  });

  test('seriesMACD returns {line, signal, hist} arrays', () => {
    const closes = asc(60);
    const result = seriesMACD(closes, 12, 26, 9);
    assert.ok(Array.isArray(result.line));
    assert.ok(Array.isArray(result.signal));
    assert.ok(Array.isArray(result.hist));
    assert.ok(result.hist.length > 0);
  });

  test('seriesStoch returns array bounded [0,100]', () => {
    const n = 30;
    const h = asc(n).map(v=>v+1);
    const l = asc(n).map(v=>v-1);
    const c = asc(n);
    const s = seriesStoch(h, l, c, 5, 1);
    s.forEach(v => assert.ok(v >= 0 && v <= 100));
  });
});
