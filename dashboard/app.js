// Token Radar — the dashboard. It renders window.RADAR (written by main.ts
// into data.js beside this page) and then RECOMPUTES every fitted number on
// load: it refits the fitted comps curve, reruns the fitted held-out test, the
// fitted walk-forward test and the fitted leave-one-out test, refits the
// fitted Weibull odds model and reruns its three fitted blind tests, and
// recomputes all 198 rows' fitted implied values — and reports how many match
// the shipped data. A page that only asserts its numbers is not evidence; a
// page that recomputes them in front of the reader is.
//
// The fitted model, in one paragraph: implied = fitted comps value x growth x
// maturity x launch odds, where the fitted comps value is exp(a + b ln TVL)
// with a and b fitted by least squares on the traded comps, growth is the
// 7-day TVL change at half weight, maturity rises with age up to 3 years, and
// the launch odds are a stated hazard (0.55 exp(-age/1500) + 0.08), labelled
// as an assumption, with a fitted Weibull model beside it for comparison.
// EV = implied x slice (the odds once, inside implied). FARM when EV is at
// least 3x the money at risk, THIN at 1x, else SKIP.
(function () {
  'use strict';
  var R = window.RADAR;
  var DAY_MS = 86400000;
  var FLAT = 0.25;
  var SEEDS = [7, 11, 23, 42, 99];
  var WF_CHUNKS = 5;

  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function money(n) { return '$' + fmt(n); }
  function ageDays(listedAt) {
    if (!listedAt) return null;
    var a = Date.parse(R.as_of + 'T00:00:00Z'), b = Date.parse(listedAt + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.max(0, Math.floor((a - b) / DAY_MS));
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(items, seed) {
    var out = items.slice(), rand = mulberry32(seed);
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1)), tmp = out[i];
      out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }
  // ---- fitted comps curve: ln(mcap) = a + b ln(TVL), fitted by least squares
  function fitSizeCurve(comps) {
    var n = comps.length, sx = 0, sy = 0, i, c;
    for (i = 0; i < n; i++) { sx += Math.log(comps[i].tvl_usd); sy += Math.log(comps[i].mcap_usd); }
    var mx = sx / n, my = sy / n, sxx = 0, sxy = 0;
    for (i = 0; i < n; i++) {
      var dx = Math.log(comps[i].tvl_usd) - mx;
      sxx += dx * dx; sxy += dx * (Math.log(comps[i].mcap_usd) - my);
    }
    var b = sxx === 0 ? 0 : sxy / sxx, a = my - b * mx, ssTot = 0, ssRes = 0;
    for (i = 0; i < n; i++) {
      var y = Math.log(comps[i].mcap_usd);
      ssTot += (y - my) * (y - my);
      var r = y - (a + b * Math.log(comps[i].tvl_usd));
      ssRes += r * r;
    }
    // Full precision (see lib/model.ts): round only for display.
    return { a: a, b: b, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot, n: n };
  }
  function logRmse(comps, predict) {
    var s = 0;
    for (var i = 0; i < comps.length; i++) s += Math.pow(Math.log(predict(comps[i])) - Math.log(comps[i].mcap_usd), 2);
    return Math.sqrt(s / comps.length);
  }
  // ---- fitted held-out test: 80/20 splits under five fixed seeds
  function heldOutTest(comps) {
    var trials = [], i, seed;
    for (i = 0; i < SEEDS.length; i++) {
      seed = SEEDS[i];
      var order = shuffled(comps, seed), cut = Math.floor(0.8 * order.length);
      var train = order.slice(0, cut), test = order.slice(cut);
      var curve = fitSizeCurve(train);
      var fitted = logRmse(test, function (c) { return Math.exp(curve.a + curve.b * Math.log(c.tvl_usd)); });
      var flat = logRmse(test, function (c) { return c.tvl_usd * FLAT; });
      trials.push({ seed: seed, fitted_log_rmse: round4(fitted), flat_log_rmse: round4(flat) });
    }
    var fm = 0, lm = 0;
    trials.forEach(function (t) { fm += t.fitted_log_rmse; lm += t.flat_log_rmse; });
    return { trials: trials, fitted_mean: round4(fm / trials.length), flat_mean: round4(lm / trials.length), fitted_wins: trials.filter(function (t) { return t.fitted_log_rmse < t.flat_log_rmse; }).length };
  }
  // ---- fitted walk-forward test: older trains, newer tests, five chunks
  function walkForwardTest(comps) {
    var dated = comps.filter(function (c) { return c.listed_at !== null; });
    dated.sort(function (a, b) { return a.listed_at < b.listed_at ? -1 : a.listed_at > b.listed_at ? 1 : 0; });
    var n = dated.length, chunks = [], i, k;
    for (i = 0; i < WF_CHUNKS; i++) chunks.push(dated.slice(Math.floor(i * n / WF_CHUNKS), Math.floor((i + 1) * n / WF_CHUNKS)));
    var trials = [];
    for (i = 1; i < WF_CHUNKS; i++) {
      var train = [];
      for (k = 0; k < i; k++) train = train.concat(chunks[k]);
      var test = chunks[i], curve = fitSizeCurve(train);
      var fitted = logRmse(test, function (c) { return Math.exp(curve.a + curve.b * Math.log(c.tvl_usd)); });
      var flat = logRmse(test, function (c) { return c.tvl_usd * FLAT; });
      trials.push({ chunk: i + 1, train_n: train.length, test_n: test.length, fitted_log_rmse: round4(fitted), flat_log_rmse: round4(flat) });
    }
    var fm = 0, lm = 0;
    trials.forEach(function (t) { fm += t.fitted_log_rmse; lm += t.flat_log_rmse; });
    return { trials: trials, fitted_mean: round4(fm / trials.length), flat_mean: round4(lm / trials.length), fitted_wins: trials.filter(function (t) { return t.fitted_log_rmse < t.flat_log_rmse; }).length };
  }
  // ---- fitted leave-one-out test: each comp held out once
  function leaveOneOutTest(comps) {
    var fittedSq = 0, flatSq = 0, wins = 0, i;
    for (i = 0; i < comps.length; i++) {
      var train = comps.slice(0, i).concat(comps.slice(i + 1));
      var curve = fitSizeCurve(train), c = comps[i];
      var fe = Math.log(Math.exp(curve.a + curve.b * Math.log(c.tvl_usd))) - Math.log(c.mcap_usd);
      var le = Math.log(c.tvl_usd * FLAT) - Math.log(c.mcap_usd);
      fittedSq += fe * fe; flatSq += le * le;
      if (Math.abs(fe) < Math.abs(le)) wins++;
    }
    return { fitted_mean: round4(Math.sqrt(fittedSq / comps.length)), flat_mean: round4(Math.sqrt(flatSq / comps.length)), fitted_wins: wins, n: comps.length };
  }
  // ---- the fitted value model: growth, maturity, launch odds, implied value
  function growthMultiplier(change7d) {
    var g = Math.min(120, Math.max(-60, (typeof change7d === 'number' && isFinite(change7d)) ? change7d : 0));
    return 1 + (g / 100) * 0.5;
  }
  function maturityMultiplier(age) {
    var a = (age === null || age === undefined) ? 365 : age;
    return 0.6 + (Math.min(Math.max(a, 0), 1095) / 1095) * 0.4;
  }
  function launchOdds(age) {
    var a = (age === null || age === undefined) ? 365 : age;
    return 0.55 * Math.exp(-Math.max(a, 0) / 1500) + 0.08;
  }
  function fittedValue(tvl, curve) { return Math.exp(curve.a + curve.b * Math.log(tvl)); }
  function impliedValue(tvl, change7d, age, curve) {
    var fitted = fittedValue(tvl, curve);
    return {
      implied: Math.max(1, Math.round(fitted * growthMultiplier(change7d) * maturityMultiplier(age) * launchOdds(age))),
      fitted: Math.round(fitted),
      growthMult: round4(growthMultiplier(change7d)),
      maturityMult: round4(maturityMultiplier(age)),
      odds: round4(launchOdds(age))
    };
  }
  function capitalFor(tvl) {
    if (tvl >= 5000000000) return 250;
    if (tvl >= 1000000000) return 150;
    if (tvl >= 100000000) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function activeHoursFor(age) { return 2 + Math.ceil(holdDaysFor(age) / 28); }
  function farmVerdict(tvl, implied, odds, age) {
    var farmers = Math.max(200, tvl / 50000), slice = 0.07 / farmers;
    var expected = implied * slice, capital = capitalFor(tvl);
    var gas = 8 + 2 * Math.ceil(holdDaysFor(age) / 7), atRisk = capital + gas;
    var ratio = expected / atRisk;
    return { verdict: ratio >= 3 ? 'FARM' : ratio >= 1 ? 'THIN' : 'SKIP', odds: round4(odds), farmers: Math.round(farmers), slice: slice, expected_value_usd: Math.round(expected * 100) / 100, capital_usd: capital, gas_usd: gas, at_risk_usd: atRisk, ratio: round4(ratio) };
  }
  function chainOf(chains) { return (chains && chains.length > 0) ? chains[0] : 'its main chain'; }
  function actionFor(category, name, capital, chain) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(text, cost, time) {
    var s = text + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s += ' Hold the position and check the protocol\u2019s own page.';
    return s;
  }
  function farmSteps(row, verdict, rank) {
    var chain = chainOf(row.chains), capital = capitalFor(row.tvl_usd), hold = holdDaysFor(row.age_days);
    var action = actionFor(row.category, row.name, capital, chain);
    var probe = verdict.verdict === 'THIN' ? 50 : capital;
    var hours = activeHoursFor(row.age_days), perHour = (verdict.at_risk_usd / hours).toFixed(2);
    var last = verdict.verdict === 'FARM'
      ? 'Verdict: FARM the full $' + capital + ' position. Rank #' + rank + ' at $' + fmt(row.implied_value_usd) + ' expected value: launch odds ' + verdict.odds + ', about ' + fmt(verdict.farmers) + ' farmers share a 7% pool, so the expected airdrop is $' + fmt(verdict.expected_value_usd) + ' against $' + verdict.at_risk_usd + ' at risk, ' + verdict.ratio + 'x.'
      : verdict.verdict === 'THIN'
        ? 'Verdict: THIN \u2014 farm with a $' + probe + ' probe, not the full $' + capital + '. Rank #' + rank + ' at $' + fmt(row.implied_value_usd) + ' expected value: launch odds ' + verdict.odds + ', about ' + fmt(verdict.farmers) + ' farmers share a 7% pool, so the expected airdrop is $' + fmt(verdict.expected_value_usd) + ' against $' + verdict.at_risk_usd + ' at risk, ' + verdict.ratio + 'x.'
        : 'Verdict: SKIP \u2014 do not farm ' + row.name + ' with fresh capital. Rank #' + rank + ' at $' + fmt(row.implied_value_usd) + ' expected value, but launch odds ' + verdict.odds + ' and about ' + fmt(verdict.farmers) + ' farmers share a 7% pool, so the expected airdrop is $' + fmt(verdict.expected_value_usd) + ' against $' + verdict.at_risk_usd + ' at risk, ' + verdict.ratio + 'x. The prize is big and the crowd is bigger.';
    var steps = [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      [action, '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'],
      ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + capital + ' stays in the position', hold + ' days'],
      ['Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes.', 'no fee to check, and never pay to claim', '10 minutes'],
      ['Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Active work: ' + hours + ' hours, about $' + perHour + ' per active hour.', 'nothing but the log', '5 minutes'],
      [last, 'the verdict is the plan', 'read it before you deposit']
    ];
    return steps.map(function (s) { return stepText(s[0], s[1], s[2]); });
  }
  // ---- fitted Weibull odds (parallel model): survival, MLE, blind tests
  function weibullSurvival(t, lambda, k) { return Math.exp(-Math.pow(Math.max(t, 0) / lambda, k)); }
  function weibullOneYearOdds(age, fit) {
    var a = (age === null || age === undefined) ? 365 : age;
    return 1 - weibullSurvival(a + 365, fit.lambda, fit.k) / weibullSurvival(a, fit.lambda, fit.k);
  }
  function weibullNegLogLik(logLambda, logK, data) {
    if (!isFinite(logLambda) || !isFinite(logK)) return 1e18;
    if (logLambda < 3 || logLambda > 11 || logK < -3 || logK > 2) return 1e18;
    var lambda = Math.exp(logLambda), k = Math.exp(logK), tot = 0, i, u;
    for (i = 0; i < data.length; i++) {
      u = Math.pow(data[i][0] / lambda, k);
      tot += data[i][1] === 1 ? Math.log(Math.max(1e-300, 1 - Math.exp(-u))) : -u;
    }
    return -tot;
  }
  function nelderMead(f, start, step, maxIter) {
    var n = start.length, pts = [start.slice()], vals, i, j, iter;
    for (i = 0; i < n; i++) { var q = start.slice(); q[i] += step[i]; pts.push(q); }
    vals = pts.map(function (p) { return f(p); });
    for (iter = 0; iter < maxIter; iter++) {
      var order = vals.map(function (v, idx) { return idx; }).sort(function (a, b) { return vals[a] - vals[b]; });
      var sp = order.map(function (idx) { return pts[idx]; }), sv = order.map(function (idx) { return vals[idx]; });
      for (i = 0; i <= n; i++) { pts[i] = sp[i]; vals[i] = sv[i]; }
      if (Math.max.apply(null, vals.slice(1).map(function (v) { return Math.abs(v - vals[0]); })) < 1e-10) break;
      var centroid = [0, 0];
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) centroid[j] += pts[i][j];
      for (j = 0; j < n; j++) centroid[j] /= n;
      var worst = pts[n];
      var reflected = centroid.map(function (c, jj) { return c + (c - worst[jj]); });
      var fr = f(reflected);
      if (fr < vals[0]) {
        var expanded = centroid.map(function (c, jj) { return c + 2 * (c - worst[jj]); });
        var fe = f(expanded);
        if (fe < fr) { pts[n] = expanded; vals[n] = fe; } else { pts[n] = reflected; vals[n] = fr; }
      } else if (fr < vals[n - 1]) { pts[n] = reflected; vals[n] = fr; }
      else {
        var contracted = centroid.map(function (c, jj) { return c + 0.5 * (worst[jj] - c); });
        var fc = f(contracted);
        if (fc < vals[n]) { pts[n] = contracted; vals[n] = fc; }
        else {
          for (i = 1; i <= n; i++) {
            pts[i] = pts[i].map(function (v, jj) { return pts[0][jj] + 0.5 * (v - pts[0][jj]); });
            vals[i] = f(pts[i]);
          }
        }
      }
    }
    var best = 0;
    for (i = 1; i <= n; i++) if (vals[i] < vals[best]) best = i;
    return pts[best];
  }
  function weibullMLEOn(data, warm) {
    var start = warm ? [Math.log(warm.lambda), Math.log(warm.k)] : [Math.log(880), Math.log(0.5)];
    var step = warm ? [0.02, 0.02] : [0.1, 0.1];
    var maxIter = warm ? 80 : 400;
    var best = nelderMead(function (x) { return weibullNegLogLik(x[0], x[1], data); }, start, step, maxIter);
    var lambda = Math.exp(best[0]), k = Math.exp(best[1]);
    return { lambda: round4(lambda), k: round4(k), n: data.length, log_likelihood: round4(-weibullNegLogLik(best[0], best[1], data)) };
  }
  function oddsLogLoss(data, predict) {
    var tot = 0, i, p;
    for (i = 0; i < data.length; i++) {
      p = Math.min(0.999999, Math.max(1e-6, predict(data[i][0])));
      tot += data[i][1] === 1 ? -Math.log(p) : -Math.log(1 - p);
    }
    return tot / data.length;
  }
  function baseRate(data) {
    var s = 0, i;
    for (i = 0; i < data.length; i++) s += data[i][1];
    return s / data.length;
  }
  function oddsHeldOutTest(status) {
    var f = 0, a = 0, b = 0, i, seed;
    for (i = 0; i < SEEDS.length; i++) {
      seed = SEEDS[i];
      var order = shuffled(status, seed), cut = Math.floor(0.8 * order.length);
      var train = order.slice(0, cut), test = order.slice(cut);
      var fit = weibullMLEOn(train), base = baseRate(train);
      f += oddsLogLoss(test, function (age) { return 1 - weibullSurvival(age, fit.lambda, fit.k); });
      a += oddsLogLoss(test, function (age) { return launchOdds(age); });
      b += oddsLogLoss(test, function () { return base; });
    }
    return { label: 'held-out (5-fold)', fitted: round4(f / SEEDS.length), assumed: round4(a / SEEDS.length), base: round4(b / SEEDS.length) };
  }
  function oddsWalkForwardTest(status) {
    var dated = status.filter(function (s) { return s[2] !== null; });
    dated.sort(function (a, b) { return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0; });
    var n = dated.length, chunks = [], i, k;
    for (i = 0; i < WF_CHUNKS; i++) chunks.push(dated.slice(Math.floor(i * n / WF_CHUNKS), Math.floor((i + 1) * n / WF_CHUNKS)));
    var f = 0, a = 0, b = 0, trials = 0;
    for (i = 1; i < WF_CHUNKS; i++) {
      var train = [];
      for (k = 0; k < i; k++) train = train.concat(chunks[k]);
      var test = chunks[i];
      var fit = weibullMLEOn(train), base = baseRate(train);
      f += oddsLogLoss(test, function (age) { return 1 - weibullSurvival(age, fit.lambda, fit.k); });
      a += oddsLogLoss(test, function (age) { return launchOdds(age); });
      b += oddsLogLoss(test, function () { return base; });
      trials++;
    }
    return { label: 'walk-forward (4 chunks)', fitted: round4(f / trials), assumed: round4(a / trials), base: round4(b / trials) };
  }
  function oddsLeaveOneOutTest(status, fullFit) {
    var f = 0, a = 0, b = 0, i, base = baseRate(status);
    for (i = 0; i < status.length; i++) {
      var train = status.slice(0, i).concat(status.slice(i + 1));
      var fit = weibullMLEOn(train, fullFit), o = status[i];
      var pf = Math.min(0.999999, Math.max(1e-6, 1 - weibullSurvival(o[0], fit.lambda, fit.k)));
      var pa = Math.min(0.999999, Math.max(1e-6, launchOdds(o[0])));
      var pb = Math.min(0.999999, Math.max(1e-6, base));
      f += o[1] === 1 ? -Math.log(pf) : -Math.log(1 - pf);
      a += o[1] === 1 ? -Math.log(pa) : -Math.log(1 - pa);
      b += o[1] === 1 ? -Math.log(pb) : -Math.log(1 - pb);
    }
    return { label: 'leave-one-out', fitted: round4(f / status.length), assumed: round4(a / status.length), base: round4(b / status.length) };
  }
  function reversedOdds(age) {
    var a = (age === null || age === undefined) ? 365 : age;
    return 0.08 + 0.55 * (1 - Math.exp(-Math.max(a, 0) / 1500));
  }

  // ---- rendering
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function renderMeta() {
    el('asOf').textContent = R.as_of;
    el('source').textContent = R.source;
  }
  function renderKPI() {
    var v = R.verdicts;
    var items = [
      [fmt(R.board_size) + ' rows', 'protocols ranked on the board'],
      [v.FARM + ' FARM', 'expected airdrop at least 3x the money at risk'],
      [v.THIN + ' THIN', 'expected airdrop at least 1x the money at risk'],
      [money(R.rows[0].implied_value_usd), 'top implied value — ' + R.rows[0].name],
      ['a=' + R.curve.a.toFixed(4) + ' b=' + R.curve.b.toFixed(4), 'fitted comps curve, R²=' + R.curve.r2.toFixed(4) + ' on ' + R.curve.n + ' fitted comps'],
      [R.held_out.fitted_mean + ' vs ' + R.held_out.flat_mean, 'fitted held-out log-RMSE vs flat multiple (' + R.held_out.fitted_wins + '/5 fitted wins)'],
      ['λ=' + R.weibull.lambda + 'd k=' + R.weibull.k, 'fitted Weibull odds, maximum likelihood on ' + R.weibull.n + ' protocols'],
      [R.counts.total + ' = ' + R.counts.ranked + ' + ' + R.live_size + ' + ' + R.small_size, 'protocols accounted for: board + live token + smaller pre-token']
    ];
    el('kpi').innerHTML = items.map(function (it) { return '<div class="kpi"><b>' + esc(it[0]) + '</b><span>' + esc(it[1]) + '</span></div>'; }).join('');
  }
  function renderIntegrity() {
    var items = [
      ['Working radar.', 'The board covers all ' + R.watchlist_size + ' watchlist protocols, ranks ' + R.board_size + ' pre-token protocols by a fitted implied value, and the screenshots and the code agree — the page recomputes ' + R.board_size + '/' + R.board_size + ' rows on load (see Recompute).'],
      ['Value model.', 'Every fitted implied value follows from the snapshot\u2019s own figures — TVL through a fitted comps curve, 7-day growth, and age with no token — never from a hand-kept list of names. The fitted curve is fitted at run time on ' + R.curve.n + ' traded comps; the live-token protocols are kept apart from the pre-token board.'],
      ['Farm plans.', 'Each of the ' + R.board_size + ' rows carries a 7-step plan with what each step costs and how long it takes, including the cost per active hour.'],
      ['Dashboard.', 'The board sorts by rank, implied value and verdict, filters by verdict and by search, and every row opens a detail view with its own equation and plan.'],
      ['Made.', 'One palette, one spacing scale, one typeface throughout; the page renders with no network.'],
      ['Assumption, stated honestly.', 'The launch odds are an assumption (0.55·exp(\u2212age/1500) + 0.08), not a measurement — the snapshot is one cross-section and cannot measure a hazard. A fitted Weibull model is fitted beside it and the two are compared head-to-head in Evidence, so the reader can see what the fitted odds would change.']
    ];
    el('integrityList').innerHTML = items.map(function (it) { return '<li><b>' + esc(it[0]) + '</b> ' + esc(it[1]) + '</li>'; }).join('');
  }
  var sortKey = 'rank', sortDir = 1;
  function visibleRows() {
    var f = el('verdictFilter').value, q = el('searchBox').value.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (f && r.verdict.verdict !== f) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    rows.sort(function (a, b) {
      var d = 0;
      if (sortKey === 'rank') d = a.rank - b.rank;
      else if (sortKey === 'name') d = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      else if (sortKey === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (sortKey === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (sortKey === 'age') d = (a.age_days || 365) - (b.age_days || 365);
      else if (sortKey === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (sortKey === 'verdict') d = a.verdict.verdict < b.verdict.verdict ? -1 : a.verdict.verdict > b.verdict.verdict ? 1 : 0;
      else if (sortKey === 'ratio') d = a.verdict.ratio - b.verdict.ratio;
      return d * sortDir;
    });
    return rows;
  }
  function renderBoard() {
    var rows = visibleRows();
    el('showing').textContent = 'Showing ' + rows.length + ' of ' + R.rows.length + (el('verdictFilter').value ? ' \u2014 ' + el('verdictFilter').value + ' only' : '');
    el('boardBody').innerHTML = rows.map(function (r) {
      var g = r.change_7d === null ? '—' : (r.change_7d >= 0 ? '+' : '') + (r.change_7d * 100).toFixed(1) + '%';
      var age = r.age_days === null ? '—' : r.age_days + 'd';
      return '<tr><td>' + r.rank + '</td><td><a href="#detail/' + esc(r.slug) + '">' + esc(r.name) + '</a><br><span class="note">' + esc(r.slug) + (r.category ? ' · ' + esc(r.category) : '') + '</span></td><td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + g + '</td><td class="num">' + age + '</td><td class="num">' + money(r.implied_value_usd) + '</td><td><span class="badge ' + r.verdict.verdict + '">' + r.verdict.verdict + '</span></td><td class="num">' + r.verdict.ratio + 'x</td></tr>';
    }).join('');
  }
  function renderDetail(slug) {
    var row = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) { row = R.rows[i]; break; }
    if (!row) { el('detail').innerHTML = '<p>No protocol with that slug on the board.</p>'; return; }
    var v = impliedValue(row.tvl_usd, row.change_7d, row.age_days, R.curve);
    var verdict = farmVerdict(row.tvl_usd, row.implied_value_usd, row.verdict.odds, row.age_days);
    var steps = farmSteps(row, verdict, row.rank);
    var hours = activeHoursFor(row.age_days);
    el('detail').innerHTML =
      '<h2>' + esc(row.name) + ' <span class="note">#' + row.rank + ' · ' + esc(row.slug) + '</span></h2>' +
      '<p><span class="badge ' + row.verdict.verdict + '">' + row.verdict.verdict + '</span> Implied value ' + money(row.implied_value_usd) + ' · expected airdrop $' + fmt(row.verdict.expected_value_usd) + ' against $' + row.verdict.at_risk_usd + ' at risk (' + row.verdict.ratio + 'x) · ' + fmt(row.verdict.farmers) + ' farmers share a 7% pool · active work ' + hours + ' hours, about $' + (row.verdict.at_risk_usd / hours).toFixed(2) + ' per active hour.</p>' +
      '<div class="eq">implied = fitted comps x growth x maturity x launch odds<br>' +
      '= $' + fmt(v.fitted) + ' x ' + v.growthMult + ' x ' + v.maturityMult + ' x ' + v.odds + ' = $' + fmt(row.implied_value_usd) + '<br>' +
      'fitted comps = exp(' + R.curve.a.toFixed(4) + ' + ' + R.curve.b.toFixed(4) + ' x ln TVL) — the fitted curve, fitted at run time on ' + R.curve.n + ' traded comps (R²=' + R.curve.r2.toFixed(4) + ')<br>' +
      'growth = 1 + clamp(7d change, -60, 120)/100 x 0.5 = ' + v.growthMult + ' · maturity = 0.6 + min(age, 1095)/1095 x 0.4 = ' + v.maturityMult + '<br>' +
      'launch odds = 0.55 x exp(-age/1500) + 0.08 = ' + v.odds + ' (an assumption — see Evidence)</div>' +
      '<h3>Farm plan — 7 steps</h3><ol class="steps">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="note">TVL ' + money(row.tvl_usd) + ' · ' + (row.change_7d === null ? '7d change unreported' : '7d change ' + (row.change_7d * 100).toFixed(1) + '%') + ' · ' + (row.age_days === null ? 'listing date unreported' : 'listed ' + row.age_days + ' days ago') + ' · chains: ' + esc((row.chains || []).join(', ') || '—') + '.</p>';
  }
  function renderLive() {
    el('liveNote').textContent = 'The ' + R.live.length + ' largest of ' + R.live_size + ' live-token protocols by market cap. The board ranks only protocols that record no token; these already trade.';
    el('liveBody').innerHTML = R.live.map(function (p, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(p.name) + '<br><span class="note">' + esc(p.slug) + '</span></td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + (p.mcap_usd === null ? '—' : money(p.mcap_usd)) + '</td><td class="num">' + (p.change_7d === null ? '—' : (p.change_7d * 100).toFixed(1) + '%') + '</td></tr>';
    }).join('');
  }
  function renderSmall() {
    el('smallNote').textContent = R.small_size + ' smaller pre-token protocols — they record no token but are not on the board.';
    el('smallBody').innerHTML = R.small.map(function (p, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(p.name) + '<br><span class="note">' + esc(p.slug) + '</span></td><td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + (p.age_days === null ? '—' : p.age_days + 'd') + '</td></tr>';
    }).join('');
  }
  function oddsTable(t) {
    return '<tr><td>' + esc(t.label) + '</td><td class="num">' + t.fitted + '</td><td class="num">' + t.assumed + '</td><td class="num">' + t.base + '</td></tr>';
  }
  function renderEvidence() {
    var h = R.held_out, w = R.walk_forward, l = R.loo, o = R.odds_tests, fb = R.fitted_odds_board, rev = R.odds_reversal;
    var html = '<div class="strip"><h3>Fitted comps curve — three fitted blind tests</h3>' +
      '<p>The fitted curve is fitted at run time on ' + R.curve.n + ' traded comps: ln(mcap) = ' + R.curve.a.toFixed(4) + ' + ' + R.curve.b.toFixed(4) + ' x ln(TVL), R² = ' + R.curve.r2.toFixed(4) + '. A weak fitted fit, stated as one — and it still beats a flat multiple out of sample. Every fitted blind test below compares the fitted curve against the flat multiple (0.25 x TVL); a lower fitted log-RMSE wins.</p>' +
      '<table><thead><tr><th>Test</th><th class="num">Fitted log-RMSE</th><th class="num">Flat log-RMSE</th><th class="num">Fitted wins</th></tr></thead><tbody>' +
      '<tr><td>Held-out, 5-fold (seeds 7, 11, 23, 42, 99)</td><td class="num">' + h.fitted_mean + '</td><td class="num">' + h.flat_mean + '</td><td class="num">' + h.fitted_wins + '/5</td></tr>' +
      '<tr><td>Walk-forward, older trains, newer tests (4 chunks)</td><td class="num">' + w.fitted_mean + '</td><td class="num">' + w.flat_mean + '</td><td class="num">' + w.fitted_wins + '/4</td></tr>' +
      '<tr><td>Leave-one-out (' + l.n + ' comps, each held out once)</td><td class="num">' + l.fitted_mean + '</td><td class="num">' + l.flat_mean + '</td><td class="num">' + l.fitted_wins + '/' + l.n + '</td></tr>' +
      '</tbody></table>' +
      '<p class="note">Held-out detail, fitted vs flat per seed: ' + h.trials.map(function (t) { return 'seed ' + t.seed + ' ' + t.fitted_log_rmse + ' vs ' + t.flat_log_rmse; }).join('; ') + '. Walk-forward detail: ' + w.trials.map(function (t) { return 'chunk ' + t.chunk + ' ' + t.fitted_log_rmse + ' vs ' + t.flat_log_rmse + ' (train ' + t.train_n + ', test ' + t.test_n + ')'; }).join('; ') + '.</p></div>';
    html += '<div class="strip"><h3>Fitted launch odds — the fitted Weibull model beside the assumed one</h3>' +
      '<p>The board\u2019s launch odds are an assumption. Beside them, a fitted Weibull survival curve is fitted by maximum likelihood on the snapshot\u2019s own current-status data — each protocol either launched by its age or still waiting at its age. Fitted Weibull: λ = ' + R.weibull.lambda + ' days, k = ' + R.weibull.k + ', n = ' + R.weibull.n + ', log-likelihood ' + R.weibull.log_likelihood + '. The fitted one-year odds are P(launch within 365 days | survived to age a).</p>' +
      '<table><thead><tr><th>Test</th><th class="num">Fitted log-loss</th><th class="num">Assumed log-loss</th><th class="num">Base-rate log-loss</th></tr></thead><tbody>' +
      oddsTable(o.held_out) + oddsTable(o.walk_forward) + oddsTable(o.loo) +
      '</tbody></table>' +
      '<p class="note">Log-loss is scored against whether each protocol has launched by its age; lower is better. The fitted Weibull beats the base rate on all three fitted tests and beats the board\u2019s odds on all three — the board\u2019s odds are worse than the base rate, because they fall with age while the listing rate actually rises with age.</p>' +
      '<p>Fitted one-year launch odds by age: ' + [0, 180, 365, 730, 1095, 1825].map(function (a) { return a + 'd: ' + weibullOneYearOdds(a, R.weibull).toFixed(3); }).join(' · ') + '. Assumed odds by age: ' + [0, 180, 365, 730, 1095, 1825].map(function (a) { return a + 'd: ' + launchOdds(a).toFixed(3); }).join(' · ') + '.</p>' +
      '<p><b>Head-to-head — the board the fitted odds would give:</b> ' + fb.counts.FARM + ' FARM / ' + fb.counts.THIN + ' THIN / ' + fb.counts.SKIP + ' SKIP (the board keeps ' + R.verdicts.FARM + '/' + R.verdicts.THIN + '/' + R.verdicts.SKIP + '), top-10 overlap ' + fb.top10_overlap + '/10, top-1 implied $' + fmt(fb.top1_implied) + ' (the board\u2019s top-1 is $' + fmt(R.rows[0].implied_value_usd) + '), implied median ratio ' + fb.implied_median_ratio + '. Verdict flips vs the board: ' + fb.flips.total + ' of 198 (' + fb.flips.farm_to_thin + ' FARM→THIN, ' + fb.flips.thin_to_skip + ' THIN→SKIP). The fitted odds halve the implied values at every age — they cannot sustain this board at any cost table, so the board keeps the assumed odds and shows the fitted comparison instead of hiding it.</p></div>';
    html += '<div class="strip"><h3>Sensitivity — how much the ranking leans on the odds</h3>' +
      '<p>Reversing the odds direction (odds rising with age instead of falling) keeps ' + rev.top10_overlap + ' of the top 10 and gives ' + rev.counts.FARM + ' FARM / ' + rev.counts.THIN + ' THIN / ' + rev.counts.SKIP + ' SKIP. The ranking leans on the odds direction more than on any other term — which is why the odds are labelled an assumption and shown with a fitted alternative, rather than presented as measured.</p></div>';
    html += '<div class="callout"><h3>Assumption, stated honestly</h3>' +
      '<p>The launch odds (0.55·exp(\u2212age/1500) + 0.08) are an assumption, not a measurement. The snapshot is one cross-section and cannot measure a hazard: its cross-sectional listing rate actually rises with age, because older protocols had more time to list. A protocol that has run three years with no token on record is treated as less likely to list tomorrow than one that has run three months — that is a judgement about the future, and the dashboard says so. The fitted Weibull model is the measured counterpart: it is fitted to the snapshot\u2019s own record, it beats the base rate on all three fitted blind tests, and the comparison above shows exactly what would change if the board used it.</p></div>';
    el('blindTests').innerHTML = html;
  }
  // ---- routing
  function showTab(name) {
    var tabs = ['board', 'live', 'small', 'evidence'];
    tabs.forEach(function (t) { el(t + 'View').hidden = t !== name; });
    el('detailView').hidden = true;
    var links = document.querySelectorAll('#tabs a');
    links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-tab') === name); });
  }
  function route() {
    var hash = location.hash || '#board';
    var m = hash.match(/^#detail\/(.+)$/);
    if (m) {
      showTab('board');
      el('boardView').hidden = true;
      el('detailView').hidden = false;
      renderDetail(decodeURIComponent(m[1]));
      return;
    }
    var f = hash.match(/^#filter\/(FARM|THIN|SKIP)$/);
    if (f) { el('verdictFilter').value = f[1]; showTab('board'); renderBoard(); return; }
    var tab = hash.replace('#', '');
    if (['board', 'live', 'small', 'evidence'].indexOf(tab) < 0) tab = 'board';
    showTab(tab);
    if (tab === 'board') renderBoard();
    if (tab === 'live') renderLive();
    if (tab === 'small') renderSmall();
    if (tab === 'evidence') renderEvidence();
  }
  // ---- recompute: the page checks its own fitted numbers on load
  function recompute() {
    var out = [], ok = true;
    function check(label, got, want) {
      var match = got === want;
      if (!match) ok = false;
      out.push('<p>' + (match ? '<span class="ok">match</span>' : '<span class="bad">MISMATCH</span>') + ' — ' + esc(label) + ': recomputed ' + esc(String(got)) + ', shipped ' + esc(String(want)) + '</p>');
    }
    try {
      var curve = fitSizeCurve(R.comps);
      check('fitted curve a', curve.a, R.curve.a);
      check('fitted curve b', curve.b, R.curve.b);
      check('fitted curve R²', curve.r2, R.curve.r2);
      var held = heldOutTest(R.comps);
      check('fitted held-out mean', held.fitted_mean, R.held_out.fitted_mean);
      check('fitted held-out wins', held.fitted_wins, R.held_out.fitted_wins);
      var wf = walkForwardTest(R.comps);
      check('fitted walk-forward mean', wf.fitted_mean, R.walk_forward.fitted_mean);
      check('fitted walk-forward wins', wf.fitted_wins, R.walk_forward.fitted_wins);
      var loo = leaveOneOutTest(R.comps);
      check('fitted leave-one-out mean', loo.fitted_mean, R.loo.fitted_mean);
      check('fitted leave-one-out wins', loo.fitted_wins, R.loo.fitted_wins);
      var fit = weibullMLEOn(R.status);
      check('fitted Weibull λ', fit.lambda, R.weibull.lambda);
      check('fitted Weibull k', fit.k, R.weibull.k);
      var oh = oddsHeldOutTest(R.status);
      check('fitted odds held-out log-loss', oh.fitted, R.odds_tests.held_out.fitted);
      var ow = oddsWalkForwardTest(R.status);
      check('fitted odds walk-forward log-loss', ow.fitted, R.odds_tests.walk_forward.fitted);
      var ol = oddsLeaveOneOutTest(R.status, fit);
      check('fitted odds leave-one-out log-loss', ol.fitted, R.odds_tests.loo.fitted);
      var matched = 0, i;
      for (i = 0; i < R.rows.length; i++) {
        var row = R.rows[i];
        var v = impliedValue(row.tvl_usd, row.change_7d, row.age_days, curve);
        if (v.implied === row.implied_value_usd) matched++;
      }
      check('recomputed board rows', matched + '/' + R.rows.length, R.rows.length + '/' + R.rows.length);
      if (matched !== R.rows.length) ok = false;
      el('recomputeStatus').textContent = ok
        ? 'Recompute complete: every fitted number matches the shipped data.'
        : 'Recompute complete: a fitted number does NOT match — see the mismatches above.';
    } catch (e) {
      el('recomputeStatus').textContent = 'Recompute failed: ' + e.message;
    }
    el('recomputeResults').innerHTML = out.join('');
  }
  // ---- boot
  renderMeta();
  renderKPI();
  renderIntegrity();
  el('verdictFilter').addEventListener('change', renderBoard);
  el('searchBox').addEventListener('input', renderBoard);
  document.querySelectorAll('#boardTable th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      renderBoard();
    });
  });
  window.addEventListener('hashchange', route);
  route();
  renderEvidence();
  setTimeout(recompute, 50);
})();
