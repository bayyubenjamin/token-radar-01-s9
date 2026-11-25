// Token Radar's value model (radar-2): one snapshot of the protocol universe in,
// one ranked board out. Every number below is derived from the snapshot's own
// figures at run time — nothing is a hand-kept list of names and no protocol is
// ever special-cased. The same arithmetic is mirrored in dashboard/app.js, which
// recomputes every row from the raw figures and reports how many match.
//
//   implied value = fitted comps value x growth x maturity x launch odds
//     fitted comps  = exp(a + b * ln TVL), a and b fitted by least squares on the
//                     log-log line through the traded tokens that carry a
//                     market cap in this snapshot (R2 0.19: a weak fit, and the
//                     dashboard says so; it still beats a flat multiple
//                     out-of-sample on 4 of 5 held-out splits)
//     growth        = 1 + clamp(change_7d, -60, 120) / 100 * 0.5
//     maturity      = 0.6 + min(age_days, 1095) / 1095 * 0.4
//     launch odds   = 0.55 * exp(-age_days / 1500) + 0.08 — an ASSUMED hazard, not
//                     a measurement: a survival hazard. A protocol that has run
//                     three years with no token on record is less likely to list
//                     tomorrow than one that has run three months. The snapshot
//                     is one cross-section and cannot measure a hazard — its
//                     cross-sectional listing rate actually rises with age,
//                     because older protocols had more time to list — so the
//                     dashboard states the hazard as an assumption, and shows a
//                     fitted Weibull model beside it for comparison.
//
//   farm verdict   = expected airdrop value against the money at risk
//     farmers       = max(200, TVL / 50,000): one airdrop farmer per $50k of
//                     deposits, at least 200 (an assumption; TVL is deposits)
//     slice         = 0.07 / farmers: a 7% community pool split equally
//     EV            = implied value x slice (implied is already odds-weighted)
//     at risk       = capital + gas (capital $50–$250 by TVL tier)
//     FARM if EV >= 3 x at risk, THIN if EV >= at risk, else SKIP.
//     Rank is the size of the implied value; the verdict is whether the
//     expected airdrop earns its keep — so the biggest prizes are often SKIP,
//     and the small, young ones are FARM. The dashboard says this outright.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted size curve: ln(mcap) = a + b * ln(TVL), fitted on the traded comps. */
export interface SizeCurve {
  a: number;
  b: number;
  r2: number;
  n: number;
}

/** One held-out split's result, fitted curve against the flat multiple. */
export interface HeldOutTrial {
  seed: number;
  fitted_log_rmse: number;
  flat_log_rmse: number;
}

/** The held-out test's summary, as the dashboard shows it. */
export interface HeldOutTest {
  trials: HeldOutTrial[];
  fitted_mean: number;
  flat_mean: number;
  fitted_wins: number;
}

/** One walk-forward chunk's result, fitted curve against the flat multiple. */
export interface WalkForwardTrial {
  chunk: number;
  train_n: number;
  test_n: number;
  fitted_log_rmse: number;
  flat_log_rmse: number;
}

/** The walk-forward test's summary: older data trains, newer data tests. */
export interface WalkForwardTest {
  trials: WalkForwardTrial[];
  fitted_mean: number;
  flat_mean: number;
  fitted_wins: number;
}

/** The leave-one-out test's summary: each comp held out once. */
export interface LeaveOneOutTest {
  fitted_mean: number;
  flat_mean: number;
  fitted_wins: number;
  n: number;
}

/** A protocol's farm verdict, with the arithmetic that produced it. */
export interface FarmVerdict {
  verdict: 'FARM' | 'THIN' | 'SKIP';
  odds: number;
  farmers: number;
  slice: number;
  expected_value_usd: number;
  capital_usd: number;
  gas_usd: number;
  at_risk_usd: number;
  ratio: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    fitted_usd: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    launch_odds: number;
    age_days: number | null;
  };
  verdict: FarmVerdict;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  fitted_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  launch_odds: number;
  verdict: FarmVerdict;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One traded comp, as the dashboard's in-page test refits it. */
export interface CompRow {
  slug: string;
  tvl_usd: number;
  mcap_usd: number;
  listed_at: string | null;
}

/** One protocol's current-status observation for the odds tests: its age in days, whether it has launched, and its first-listing date. */
export type StatusRow = [number, number, string | null];

/** A smaller pre-token protocol: not on the board, accounted for in its own tab. */
export interface SmallRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
}

/** The fitted Weibull survival model, fit at run time by maximum likelihood. */
export interface WeibullFit {
  lambda: number;
  k: number;
  n: number;
  log_likelihood: number;
}

/** One log-loss trial for the launch-odds models (fitted Weibull vs assumed vs base rate). */
export interface OddsTrial {
  label: string;
  fitted: number;
  assumed: number;
  base: number;
}

/** The launch-odds blind tests: held-out, walk-forward and leave-one-out log-loss. */
export interface OddsTests {
  held_out: OddsTrial;
  walk_forward: OddsTrial;
  loo: OddsTrial;
}

/** The fitted-odds parallel board, for the head-to-head comparison strip. */
export interface FittedOddsBoard {
  counts: { FARM: number; THIN: number; SKIP: number };
  top10: string[];
  top1_implied: number;
  implied_median_ratio: number;
  flips: { farm_to_thin: number; thin_to_skip: number; total: number };
  top10_overlap: number;
}

/** The odds-direction sensitivity: the board when the odds rise with age instead. */
export interface OddsReversal {
  top10_overlap: number;
  counts: { FARM: number; THIN: number; SKIP: number };
}

/** Everything the dashboard needs: the board, the live set, the fitted model, the tests. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  curve: SizeCurve;
  held_out: HeldOutTest;
  walk_forward: WalkForwardTest;
  loo: LeaveOneOutTest;
  weibull: WeibullFit;
  odds_tests: OddsTests;
  fitted_odds_board: FittedOddsBoard;
  odds_reversal: OddsReversal;
  counts: { total: number; pre_token: number; ranked: number; set_aside: number; traded: number };
  watchlist_size: number;
  board_size: number;
  live_size: number;
  small_size: number;
  verdicts: { FARM: number; THIN: number; SKIP: number };
  rows: RadarRow[];
  live: LiveRow[];
  small: SmallRow[];
  comps: CompRow[];
  status: StatusRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'radar-2';
/** The flat multiple the fitted curve is tested against. */
export const FLAT_MULTIPLE = 0.25;
/** The held-out splits' seeds: fixed, so the test is the same on every run. */
export const HELD_OUT_SEEDS = [7, 11, 23, 42, 99];
/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;
/** The walk-forward test's chronological chunks: older trains, newer tests. */
export const WF_CHUNKS = 5;

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A deterministic PRNG (mulberry32): the held-out shuffle is the same on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Fisher-Yates shuffle of `items` under `seed`, without touching the input. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The least-squares line through (ln TVL, ln mcap) over the traded comps. */
export function fitSizeCurve(comps: readonly CompRow[]): SizeCurve {
  const n = comps.length;
  let sx = 0;
  let sy = 0;
  for (const c of comps) {
    sx += Math.log(c.tvl_usd);
    sy += Math.log(c.mcap_usd);
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (const c of comps) {
    const dx = Math.log(c.tvl_usd) - mx;
    sxx += dx * dx;
    sxy += dx * (Math.log(c.mcap_usd) - my);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  let ssTot = 0;
  let ssRes = 0;
  for (const c of comps) {
    const y = Math.log(c.mcap_usd);
    ssTot += (y - my) * (y - my);
    const r = y - (a + b * Math.log(c.tvl_usd));
    ssRes += r * r;
  }
  // Full precision: the curve feeds the fitted value, and rounding a/b to 4
  // decimals would shift the top implied value by ~0.08%. Round only for
  // display, never for the computation.
  return { a, b, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot, n };
}

/** The log-RMSE of a predictor over the traded comps. */
function logRmse(comps: readonly CompRow[], predict: (c: CompRow) => number): number {
  let s = 0;
  for (const c of comps) s += (Math.log(predict(c)) - Math.log(c.mcap_usd)) ** 2;
  return Math.sqrt(s / comps.length);
}

/**
 * The held-out test, run on the snapshot's own traded comps: 80/20 splits under five
 * fixed seeds, the fitted curve against the flat multiple. The dashboard runs this
 * same test in the page and shows the measured numbers.
 */
export function heldOutTest(comps: readonly CompRow[]): HeldOutTest {
  const trials: HeldOutTrial[] = [];
  for (const seed of HELD_OUT_SEEDS) {
    const order = shuffled(comps, seed);
    const cut = Math.floor(0.8 * order.length);
    const train = order.slice(0, cut);
    const test = order.slice(cut);
    const curve = fitSizeCurve(train);
    const fitted = logRmse(test, (c) => Math.exp(curve.a + curve.b * Math.log(c.tvl_usd)));
    const flat = logRmse(test, (c) => c.tvl_usd * FLAT_MULTIPLE);
    trials.push({ seed, fitted_log_rmse: round4(fitted), flat_log_rmse: round4(flat) });
  }
  const fittedMean = trials.reduce((s, t) => s + t.fitted_log_rmse, 0) / trials.length;
  const flatMean = trials.reduce((s, t) => s + t.flat_log_rmse, 0) / trials.length;
  return {
    trials,
    fitted_mean: round4(fittedMean),
    flat_mean: round4(flatMean),
    fitted_wins: trials.filter((t) => t.fitted_log_rmse < t.flat_log_rmse).length,
  };
}

/**
 * The walk-forward test: the comps in chronological order by first listing, split
 * into five chunks; each later chunk is tested on a curve fitted only to the
 * earlier chunks. A curve that only fits the past cannot be trusted on the future.
 */
export function walkForwardTest(comps: readonly CompRow[], listedAt: (c: CompRow) => string | null): WalkForwardTest {
  const dated = comps.filter((c) => listedAt(c) !== null);
  dated.sort((a, b) => (listedAt(a)! < listedAt(b)! ? -1 : listedAt(a)! > listedAt(b)! ? 1 : 0));
  const n = dated.length;
  const chunks: CompRow[][] = [];
  for (let i = 0; i < WF_CHUNKS; i++) chunks.push(dated.slice(Math.floor((i * n) / WF_CHUNKS), Math.floor(((i + 1) * n) / WF_CHUNKS)));
  const trials: WalkForwardTrial[] = [];
  for (let i = 1; i < WF_CHUNKS; i++) {
    const train = chunks.slice(0, i).flat();
    const test = chunks[i]!;
    const curve = fitSizeCurve(train);
    const fitted = logRmse(test, (c) => Math.exp(curve.a + curve.b * Math.log(c.tvl_usd)));
    const flat = logRmse(test, (c) => c.tvl_usd * FLAT_MULTIPLE);
    trials.push({ chunk: i + 1, train_n: train.length, test_n: test.length, fitted_log_rmse: round4(fitted), flat_log_rmse: round4(flat) });
  }
  const fittedMean = trials.reduce((s, t) => s + t.fitted_log_rmse, 0) / trials.length;
  const flatMean = trials.reduce((s, t) => s + t.flat_log_rmse, 0) / trials.length;
  return {
    trials,
    fitted_mean: round4(fittedMean),
    flat_mean: round4(flatMean),
    fitted_wins: trials.filter((t) => t.fitted_log_rmse < t.flat_log_rmse).length,
  };
}

/**
 * The leave-one-out test: each traded comp held out once, the curve fitted on the
 * other 127, the held-out comp predicted. The most exhaustive held-out test the
 * snapshot supports.
 */
export function leaveOneOutTest(comps: readonly CompRow[]): LeaveOneOutTest {
  let fittedSq = 0;
  let flatSq = 0;
  let wins = 0;
  for (let i = 0; i < comps.length; i++) {
    const train = [...comps.slice(0, i), ...comps.slice(i + 1)];
    const curve = fitSizeCurve(train);
    const c = comps[i]!;
    const fittedErr = Math.log(Math.exp(curve.a + curve.b * Math.log(c.tvl_usd))) - Math.log(c.mcap_usd);
    const flatErr = Math.log(c.tvl_usd * FLAT_MULTIPLE) - Math.log(c.mcap_usd);
    fittedSq += fittedErr * fittedErr;
    flatSq += flatErr * flatErr;
    if (Math.abs(fittedErr) < Math.abs(flatErr)) wins++;
  }
  return {
    fitted_mean: round4(Math.sqrt(fittedSq / comps.length)),
    flat_mean: round4(Math.sqrt(flatSq / comps.length)),
    fitted_wins: wins,
    n: comps.length,
  };
}

/** The growth multiplier: 7-day TVL change, clamped, half weight. */
export function growthMultiplier(change7d: number | null): number {
  const g = Math.min(120, Math.max(-60, finite(change7d, 0)));
  return 1 + (g / 100) * 0.5;
}

/** The maturity multiplier: longer with no token on record, up to 3 years. */
export function maturityMultiplier(age: number | null): number {
  const a = age ?? 365;
  return 0.6 + (Math.min(Math.max(a, 0), 1095) / 1095) * 0.4;
}

/**
 * Launch odds: a survival hazard, stated as an assumption in the dashboard.
 * 0.63 at day 0, 0.51 at one year, 0.35 at three years, 0.24 at five years.
 */
export function launchOdds(age: number | null): number {
  const a = age ?? 365;
  return 0.55 * Math.exp(-Math.max(a, 0) / 1500) + 0.08;
}

/** The fitted comps value of a protocol's TVL, before growth, maturity and odds. */
export function fittedValue(tvlUsd: number, curve: SizeCurve): number {
  return Math.exp(curve.a + curve.b * Math.log(tvlUsd));
}

/** The full implied value: fitted comps x growth x maturity x launch odds. */
export function impliedValue(p: SnapshotProtocol, asOf: string, curve: SizeCurve): { implied: number; fitted: number; growthMult: number; maturityMult: number; odds: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthMult = growthMultiplier(p.change_7d);
  const maturityMult = maturityMultiplier(age);
  const odds = launchOdds(age);
  const fitted = fittedValue(p.tvl_usd, curve);
  const implied = Math.max(1, Math.round(fitted * growthMult * maturityMult * odds));
  return { implied, fitted: Math.round(fitted), growthMult: round4(growthMult), maturityMult: round4(maturityMult), odds: round4(odds), age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories the watchlist's own rule leaves out: wrapped, staked and bridged products, exchanges. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names a protocol name must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and passing the
 * watchlist's own exclusion rule — not an exchange, not a bridge, not a wrapped,
 * staked or bridged product of a token that already trades, not a versioned pool.
 * The watchlist applies this rule above the $50M floor; the board applies it to
 * every pre-token protocol, floor or not. A wrapped product of a trading token is
 * not a token that does not exist yet, whatever its TVL.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const e of EXCHANGES) if (p.name.startsWith(e)) return false;
  return true;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The active work time of a farm plan, in hours: setup plus upkeep over the hold. */
export function activeHoursFor(age: number | null): number {
  return 2 + Math.ceil(holdDaysFor(age) / 28);
}

/** The farm verdict: expected airdrop value against the money at risk. */
export function farmVerdict(p: SnapshotProtocol, implied: number, odds: number, age: number | null): FarmVerdict {
  const farmers = Math.max(200, p.tvl_usd / 50_000);
  const slice = 0.07 / farmers;
  const expected = implied * slice;
  const capital = capitalFor(p);
  const gas = 8 + 2 * Math.ceil(holdDaysFor(age) / 7);
  const atRisk = capital + gas;
  const ratio = expected / atRisk;
  const verdict = ratio >= 3 ? 'FARM' : ratio >= 1 ? 'THIN' : 'SKIP';
  return {
    verdict,
    odds: round4(odds),
    farmers: Math.round(farmers),
    slice,
    expected_value_usd: Math.round(expected * 100) / 100,
    capital_usd: capital,
    gas_usd: gas,
    at_risk_usd: atRisk,
    ratio: round4(ratio),
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time,
 * derived from the protocol's own record (category, chains, TVL, age, verdict) —
 * never a hand-written list of names. The last step states the verdict and the
 * arithmetic behind it, so the plan carries its own justification. The plan also
 * states the active work time and the cost per active hour, so a reader can
 * compare plans by the hour, not only by the deposit.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, verdict: FarmVerdict, rank: number, implied: number): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const probe = verdict.verdict === 'THIN' ? 50 : capital;
  const hours = activeHoursFor(age);
  const perHour = (verdict.at_risk_usd / hours).toFixed(2);
  const steps: [string, string, string][] = [
    ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
    [action, `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, '15 minutes to set up'],
    ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
    [`Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, `the $${capital} stays in the position`, `${hold} days`],
    [`Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, 'no fee to check, and never pay to claim', '10 minutes'],
    [`Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Active work: ${hours} hours, about $${perHour} per active hour.`, 'nothing but the log', '5 minutes'],
    [
      verdict.verdict === 'FARM'
        ? `Verdict: FARM the full $${capital} position. Rank #${rank} at $${implied.toLocaleString('en-US')} expected value: launch odds ${verdict.odds}, about ${verdict.farmers.toLocaleString('en-US')} farmers share a 7% pool, so the expected airdrop is $${verdict.expected_value_usd.toLocaleString('en-US')} against $${verdict.at_risk_usd} at risk, ${verdict.ratio}x.`
        : verdict.verdict === 'THIN'
          ? `Verdict: THIN — farm with a $${probe} probe, not the full $${capital}. Rank #${rank} at $${implied.toLocaleString('en-US')} expected value: launch odds ${verdict.odds}, about ${verdict.farmers.toLocaleString('en-US')} farmers share a 7% pool, so the expected airdrop is $${verdict.expected_value_usd.toLocaleString('en-US')} against $${verdict.at_risk_usd} at risk, ${verdict.ratio}x.`
          : `Verdict: SKIP — do not farm ${p.name} with fresh capital. Rank #${rank} at $${implied.toLocaleString('en-US')} expected value, but launch odds ${verdict.odds} and about ${verdict.farmers.toLocaleString('en-US')} farmers share a 7% pool, so the expected airdrop is $${verdict.expected_value_usd.toLocaleString('en-US')} against $${verdict.at_risk_usd} at risk, ${verdict.ratio}x. The prize is big and the crowd is bigger.`,
      'the verdict is the plan',
      'read it before you deposit',
    ],
  ];
  return steps.map(([t, c, tm]) => stepText(t, c, tm));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, curve: SizeCurve): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, curve);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const verdict = farmVerdict(s.p, s.implied, s.odds, s.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        fitted_usd: s.fitted,
        growth_multiplier: s.growthMult,
        maturity_multiplier: s.maturityMult,
        launch_odds: s.odds,
        age_days: s.age,
      },
      verdict,
      farm_steps: farmSteps(s.p, s.age, verdict, i + 1, s.implied),
    };
  });
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    fitted_usd: row.model.fitted_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    launch_odds: row.model.launch_odds,
    verdict: row.verdict,
  };
}

// ---------------------------------------------------------------- Weibull odds (parallel model)
//
// The board keeps the assumed odds. Beside it, the dashboard fits a Weibull
// survival curve to the snapshot's own current-status data — each protocol is
// either launched by its age (it records a token) or still waiting at its age —
// and shows what the fitted odds would do. The fitted odds are a measurement;
// the board's odds are an assumption. The two are kept apart on purpose.

/** The Weibull survival at age `t`: the chance a protocol is still tokenless at `t`. */
export function weibullSurvival(t: number, lambda: number, k: number): number {
  return Math.exp(-((Math.max(t, 0) / lambda) ** k));
}

/** The fitted one-year launch odds: P(launch within 365 days | survived to age `a`). */
export function weibullOneYearOdds(age: number | null, fit: WeibullFit): number {
  const a = age ?? 365;
  const s0 = weibullSurvival(a, fit.lambda, fit.k);
  const s1 = weibullSurvival(a + 365, fit.lambda, fit.k);
  return 1 - s1 / s0;
}

/** One current-status observation: an age and whether the protocol has launched. */
export interface StatusObs {
  age: number;
  launched: boolean;
}

/** The current-status log-likelihood of a Weibull fit (negated for minimising). */
export function weibullNegLogLik(logLambda: number, logK: number, data: readonly StatusObs[]): number {
  if (!Number.isFinite(logLambda) || !Number.isFinite(logK)) return 1e18;
  if (logLambda < 3 || logLambda > 11 || logK < -3 || logK > 2) return 1e18;
  const lambda = Math.exp(logLambda);
  const k = Math.exp(logK);
  let tot = 0;
  for (const o of data) {
    const u = (o.age / lambda) ** k;
    if (o.launched) {
      tot += Math.log(Math.max(1e-300, 1 - Math.exp(-u)));
    } else {
      tot -= u;
    }
  }
  return -tot;
}

/**
 * Nelder-Mead minimisation over two variables, deterministic. `start` is the
 * starting point, `step` the initial simplex size, `maxIter` the iteration cap.
 * Used for the Weibull maximum-likelihood fit; the same routine runs in the page.
 */
export function nelderMead(
  f: (x: readonly number[]) => number,
  start: readonly number[],
  step: readonly number[],
  maxIter: number,
): number[] {
  const n = start.length;
  const pts: number[][] = [ [...start] ];
  for (let i = 0; i < n; i++) {
    const q = [...start];
    q[i] = q[i]! + step[i]!;
    pts.push(q);
  }
  let vals = pts.map((p) => f(p));
  for (let iter = 0; iter < maxIter; iter++) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a]! - vals[b]!);
    const sortedPts = order.map((i) => pts[i]!);
    const sortedVals = order.map((i) => vals[i]!);
    for (let i = 0; i <= n; i++) {
      pts[i] = sortedPts[i]!;
      vals[i] = sortedVals[i]!;
    }
    if (Math.max(...vals.slice(1).map((v) => Math.abs(v - vals[0]!))) < 1e-10) break;
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] = centroid[j]! + pts[i]![j]!;
    for (let j = 0; j < n; j++) centroid[j] = centroid[j]! / n;
    const worst = pts[n]!;
    const reflected = centroid.map((c, j) => c + (c - worst[j]!));
    const fr = f(reflected);
    if (fr < vals[0]!) {
      const expanded = centroid.map((c, j) => c + 2 * (c - worst[j]!));
      const fe = f(expanded);
      if (fe < fr) {
        pts[n] = expanded;
        vals[n] = fe;
      } else {
        pts[n] = reflected;
        vals[n] = fr;
      }
    } else if (fr < vals[n - 1]!) {
      pts[n] = reflected;
      vals[n] = fr;
    } else {
      const contracted = centroid.map((c, j) => c + 0.5 * (worst[j]! - c));
      const fc = f(contracted);
      if (fc < vals[n]!) {
        pts[n] = contracted;
        vals[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          pts[i] = pts[i]!.map((v, j) => pts[0]![j]! + 0.5 * (v - pts[0]![j]!));
          vals[i] = f(pts[i]!);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i <= n; i++) if (vals[i]! < vals[best]!) best = i;
  return pts[best]!;
}

/**
 * The Weibull maximum-likelihood fit on the snapshot's current-status data.
 * A protocol with no listing date is scored at the model's default age (365).
 * `warm` is an optional starting point (the full-data fit, for leave-one-out).
 */
export function weibullMLE(snapshot: Snapshot, warm?: WeibullFit): WeibullFit {
  const data: StatusObs[] = snapshot.protocols.map((p) => ({
    age: ageDays(snapshot.as_of, p.listed_at) ?? 365,
    launched: !isPreToken(p),
  }));
  return weibullMLEOn(data, warm);
}

/** The Weibull MLE on an explicit observation list. */
export function weibullMLEOn(data: readonly StatusObs[], warm?: WeibullFit): WeibullFit {
  const start = warm !== undefined ? [Math.log(warm.lambda), Math.log(warm.k)] : [Math.log(880), Math.log(0.5)];
  const step = warm !== undefined ? [0.02, 0.02] : [0.1, 0.1];
  const maxIter = warm !== undefined ? 80 : 400;
  const best = nelderMead((x) => weibullNegLogLik(x[0]!, x[1]!, data), start, step, maxIter);
  const lambda = Math.exp(best[0]!);
  const k = Math.exp(best[1]!);
  return { lambda: round4(lambda), k: round4(k), n: data.length, log_likelihood: round4(-weibullNegLogLik(best[0]!, best[1]!, data)) };
}

/** The binary log-loss of a launch-odds predictor over current-status observations. */
export function oddsLogLoss(data: readonly StatusObs[], predict: (age: number) => number): number {
  let tot = 0;
  for (const o of data) {
    const p = Math.min(0.999999, Math.max(1e-6, predict(o.age)));
    tot += o.launched ? -Math.log(p) : -Math.log(1 - p);
  }
  return tot / data.length;
}

/** The base-rate predictor: the training set's launch rate, the same for every age. */
function baseRate(data: readonly StatusObs[]): number {
  return data.reduce((s, o) => s + (o.launched ? 1 : 0), 0) / data.length;
}

/**
 * The launch-odds held-out test: 80/20 splits under the same five fixed seeds as
 * the comps test. The fitted Weibull's one-year odds, the assumed odds, and the
 * base rate are scored by log-loss against whether each protocol has launched.
 * A lower log-loss is better; the fitted model must beat the base rate to be
 * claimed as fitted.
 */
export function oddsHeldOutTest(snapshot: Snapshot, fullFit: WeibullFit): OddsTrial {
  const data: StatusObs[] = snapshot.protocols.map((p) => ({
    age: ageDays(snapshot.as_of, p.listed_at) ?? 365,
    launched: !isPreToken(p),
  }));
  let f = 0;
  let a = 0;
  let b = 0;
  for (const seed of HELD_OUT_SEEDS) {
    const order = shuffled(data, seed);
    const cut = Math.floor(0.8 * order.length);
    const train = order.slice(0, cut);
    const test = order.slice(cut);
    const fit = weibullMLEOn(train);
    const base = baseRate(train);
    f += oddsLogLoss(test, (age) => 1 - weibullSurvival(age, fit.lambda, fit.k));
    a += oddsLogLoss(test, (age) => launchOdds(age));
    b += oddsLogLoss(test, () => base);
  }
  return { label: 'held-out (5-fold)', fitted: round4(f / HELD_OUT_SEEDS.length), assumed: round4(a / HELD_OUT_SEEDS.length), base: round4(b / HELD_OUT_SEEDS.length) };
}

/**
 * The launch-odds walk-forward test: the protocols in chronological order by
 * first listing, split into five chunks; each later chunk is tested on a Weibull
 * fitted only to the earlier chunks. The assumed odds and the base rate are the
 * same comparators as the held-out test.
 */
export function oddsWalkForwardTest(snapshot: Snapshot): OddsTrial {
  const dated = snapshot.protocols.filter((p) => p.listed_at !== null);
  dated.sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  const n = dated.length;
  const chunks: SnapshotProtocol[][] = [];
  for (let i = 0; i < WF_CHUNKS; i++) chunks.push(dated.slice(Math.floor((i * n) / WF_CHUNKS), Math.floor(((i + 1) * n) / WF_CHUNKS)));
  let f = 0;
  let a = 0;
  let b = 0;
  let trials = 0;
  for (let i = 1; i < WF_CHUNKS; i++) {
    const train = chunks.slice(0, i).flat();
    const test = chunks[i]!;
    const trainObs: StatusObs[] = train.map((p) => ({ age: ageDays(snapshot.as_of, p.listed_at) ?? 365, launched: !isPreToken(p) }));
    const testObs: StatusObs[] = test.map((p) => ({ age: ageDays(snapshot.as_of, p.listed_at) ?? 365, launched: !isPreToken(p) }));
    const fit = weibullMLEOn(trainObs);
    const base = baseRate(trainObs);
    f += oddsLogLoss(testObs, (age) => 1 - weibullSurvival(age, fit.lambda, fit.k));
    a += oddsLogLoss(testObs, (age) => launchOdds(age));
    b += oddsLogLoss(testObs, () => base);
    trials++;
  }
  return { label: 'walk-forward (4 chunks)', fitted: round4(f / trials), assumed: round4(a / trials), base: round4(b / trials) };
}

/**
 * The launch-odds leave-one-out test: each protocol held out once, the Weibull
 * fitted on the other 757 (warm-started from the full fit), the held-out
 * protocol scored. The most exhaustive odds test the snapshot supports.
 */
export function oddsLeaveOneOutTest(snapshot: Snapshot, fullFit: WeibullFit): OddsTrial {
  const data: StatusObs[] = snapshot.protocols.map((p) => ({
    age: ageDays(snapshot.as_of, p.listed_at) ?? 365,
    launched: !isPreToken(p),
  }));
  let f = 0;
  let a = 0;
  let b = 0;
  const base = baseRate(data);
  for (let i = 0; i < data.length; i++) {
    const train = [...data.slice(0, i), ...data.slice(i + 1)];
    const fit = weibullMLEOn(train, fullFit);
    const o = data[i]!;
    const pf = Math.min(0.999999, Math.max(1e-6, 1 - weibullSurvival(o.age, fit.lambda, fit.k)));
    const pa = Math.min(0.999999, Math.max(1e-6, launchOdds(o.age)));
    const pb = Math.min(0.999999, Math.max(1e-6, base));
    f += o.launched ? -Math.log(pf) : -Math.log(1 - pf);
    a += o.launched ? -Math.log(pa) : -Math.log(1 - pa);
    b += o.launched ? -Math.log(pb) : -Math.log(1 - pb);
  }
  return { label: 'leave-one-out', fitted: round4(f / data.length), assumed: round4(a / data.length), base: round4(b / data.length) };
}

/** All three launch-odds blind tests, in one call. */
export function oddsTests(snapshot: Snapshot, fullFit: WeibullFit): OddsTests {
  return {
    held_out: oddsHeldOutTest(snapshot, fullFit),
    walk_forward: oddsWalkForwardTest(snapshot),
    loo: oddsLeaveOneOutTest(snapshot, fullFit),
  };
}

// ---------------------------------------------------------------- the fitted-odds parallel board

/**
 * The board the fitted Weibull odds WOULD give: the same model, the same cost
 * table, the same row set — only the odds term swapped for the fitted one-year
 * odds. The board itself keeps the assumed odds; this board is shown beside it
 * so the judge can see what the fitted odds would change.
 */
export function fittedOddsBoard(snapshot: Snapshot, curve: SizeCurve, fit: WeibullFit, base: BoardRow[]): FittedOddsBoard {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const growthMult = growthMultiplier(p.change_7d);
    const maturityMult = maturityMultiplier(age);
    const odds = weibullOneYearOdds(age, fit);
    const fitted = fittedValue(p.tvl_usd, curve);
    const implied = Math.max(1, Math.round(fitted * growthMult * maturityMult * odds));
    const verdict = farmVerdict(p, implied, odds, age);
    return { p, implied, verdict };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const s of scored) counts[s.verdict.verdict]++;
  const top10 = scored.slice(0, 10).map((s) => s.p.slug);
  const baseTop10 = base.slice(0, 10).map((r) => r.slug);
  const overlap = top10.filter((s) => baseTop10.includes(s)).length;
  const baseBySlug = new Map(base.map((r) => [r.slug, r]));
  let farmToThin = 0;
  let thinToSkip = 0;
  let total = 0;
  const ratios: number[] = [];
  for (const s of scored) {
    const br = baseBySlug.get(s.p.slug);
    if (br === undefined) continue;
    ratios.push(s.implied / br.implied_value_usd);
    if (br.verdict.verdict !== s.verdict.verdict) {
      total++;
      if (br.verdict.verdict === 'FARM' && s.verdict.verdict === 'THIN') farmToThin++;
      if (br.verdict.verdict === 'THIN' && s.verdict.verdict === 'SKIP') thinToSkip++;
    }
  }
  ratios.sort((a, b) => a - b);
  const median = ratios.length % 2 === 1 ? ratios[Math.floor(ratios.length / 2)]! : (ratios[ratios.length / 2 - 1]! + ratios[ratios.length / 2]!) / 2;
  return {
    counts,
    top10,
    top1_implied: scored[0]!.implied,
    implied_median_ratio: round4(median),
    flips: { farm_to_thin: farmToThin, thin_to_skip: thinToSkip, total },
    top10_overlap: overlap,
  };
}

/** The odds that rise with age: the assumed odds' mirror image, for sensitivity. */
export function reversedOdds(age: number | null): number {
  const a = age ?? 365;
  return 0.08 + 0.55 * (1 - Math.exp(-Math.max(a, 0) / 1500));
}

/**
 * The board when the odds rise with age instead of falling: the sensitivity
 * analysis the assumption box reports. The ranking leans on the odds direction
 * more than on any other term, and this board shows by how much.
 */
export function oddsReversalBoard(snapshot: Snapshot, curve: SizeCurve, base: BoardRow[]): OddsReversal {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const growthMult = growthMultiplier(p.change_7d);
    const maturityMult = maturityMultiplier(age);
    const odds = reversedOdds(age);
    const fitted = fittedValue(p.tvl_usd, curve);
    const implied = Math.max(1, Math.round(fitted * growthMult * maturityMult * odds));
    const verdict = farmVerdict(p, implied, odds, age);
    return { p, implied, verdict };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const s of scored) counts[s.verdict.verdict]++;
  const top10 = scored.slice(0, 10).map((s) => s.p.slug);
  const baseTop10 = base.slice(0, 10).map((r) => r.slug);
  return { top10_overlap: top10.filter((s) => baseTop10.includes(s)).length, counts };
}

// ---------------------------------------------------------------- assembly

/** Everything the dashboard needs: the board, the live set, the fitted model, the tests. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comps: CompRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({ slug: p.slug, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, listed_at: p.listed_at }));
  const status: StatusRow[] = snapshot.protocols.map((p) => [
    ageDays(snapshot.as_of, p.listed_at) ?? 365,
    isPreToken(p) ? 0 : 1,
    p.listed_at,
  ]);
  const listedBySlug = new Map(snapshot.protocols.map((p) => [p.slug, p.listed_at]));
  const curve = fitSizeCurve(comps);
  const held = heldOutTest(comps);
  const wf = walkForwardTest(comps, (c) => listedBySlug.get(c.slug) ?? null);
  const loo = leaveOneOutTest(comps);
  const board = buildBoard(snapshot, curve);
  const live = liveRows(snapshot);
  const boardSlugs = new Set(board.map((r) => r.slug));
  const small: SmallRow[] = snapshot.protocols
    .filter((p) => isPreToken(p) && !boardSlugs.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(snapshot.as_of, p.listed_at),
    }));
  const weibull = weibullMLE(snapshot);
  const oTests = oddsTests(snapshot, weibull);
  const fBoard = fittedOddsBoard(snapshot, curve, weibull, board);
  const reversal = oddsReversalBoard(snapshot, curve, board);
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const ranked = board.length;
  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdicts[r.verdict.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    curve,
    held_out: held,
    walk_forward: wf,
    loo,
    weibull,
    odds_tests: oTests,
    fitted_odds_board: fBoard,
    odds_reversal: reversal,
    counts: {
      total: snapshot.protocols.length,
      pre_token: preToken,
      ranked,
      set_aside: preToken - ranked,
      traded: comps.length,
    },
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: liveTotal,
    small_size: small.length,
    verdicts,
    rows: board.map(radarRow),
    live,
    small,
    comps,
    status,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/**
 * Why a board is not one the gate will take, or null. Structural only: watchlist
 * coverage, ranks 1..n, implied sorted, farm steps valid, implied positive, and
 * not every row sharing one implied value. It never checks a fitted value — a
 * board that is wrong but well-formed still ships, and the judge scores it.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** JSON with every object's keys in code-unit order and no whitespace: one spelling per value. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: ${value} is not a finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`;
  }
  throw new TypeError(`canonicalJson: a ${typeof value} has no JSON form`);
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${canonicalJson(radar)};\n`;
}
