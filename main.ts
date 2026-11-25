// Token Radar S9 — the entrypoint. Node 22, standard library only.
//
// Reads the sealed snapshot, builds the ranked board and the dashboard's data,
// copies the dashboard and the screenshots into the output, and writes the
// dossier from the kit's vendor library. Deterministic: two runs on the same
// snapshot write the same bytes. Independent of the working directory: every
// path is resolved relative to this file, so the program exits 0 and writes
// byte-identical output from any directory.
//
// There is no fatal runtime check on the fitted values. The program always
// writes board.json, the dashboard data, the dashboard, the screenshots and
// the dossier; a fit that looks odd is reported on stdout, never thrown. The
// one guard is structural: a board that misses a watchlist slug, or whose
// ranks or farm steps are malformed, is not a board the gate will take, so the
// program says so on stderr and exits 1 instead of writing it.

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, canonicalJson, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The command line's --name value, or null when the flag is absent. */
function flagValue(argv: string[], name: string): string | null {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && i + 1 < argv.length) return argv[i + 1]!;
    if (argv[i]!.startsWith(`${name}=`)) return argv[i]!.slice(name.length + 1);
  }
  return null;
}

function main(): number {
  const argv = process.argv.slice(2);
  const inputPath = flagValue(argv, '--input') ?? '/input/snapshot.json';
  const outputDir = resolve(flagValue(argv, '--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? './output');
  const snapshot = parseSnapshot(readFileSync(inputPath, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`token-radar-s9: board issue: ${issue}\n`);
    return 1;
  }
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  writeFileSync(join(outputDir, 'board.json'), `${canonicalJson({ rows: board })}\n`, 'utf8');
  // The dashboard's data lives beside the dashboard, not inside it: the page
  // loads it with a relative script tag, and keeping it out of dashboard/
  // keeps the dossier's text the page's own source, whole and readable.
  writeFileSync(join(outputDir, 'data.js'), dataScript(radar), 'utf8');
  cpSync(join(HERE, 'dashboard'), join(outputDir, 'dashboard'), { recursive: true });
  const shotsDir = join(HERE, 'screenshots');
  if (existsSync(shotsDir)) cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
  const dossier = buildDossier(outputDir, { text_max_bytes: 65536 });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  const dossierDoc = JSON.parse(Buffer.from(dossier).toString('utf8')) as { text: string };
  process.stdout.write(
    [
      `token-radar-s9: board ${board.length} rows (${radar.verdicts.FARM} FARM / ${radar.verdicts.THIN} THIN / ${radar.verdicts.SKIP} SKIP)`,
      `token-radar-s9: top-1 ${board[0]!.slug} $${board[0]!.implied_value_usd.toLocaleString('en-US')}`,
      `token-radar-s9: curve a=${radar.curve.a.toFixed(4)} b=${radar.curve.b.toFixed(4)} R2=${radar.curve.r2.toFixed(4)} n=${radar.curve.n}`,
      `token-radar-s9: held-out fitted ${radar.held_out.fitted_mean} vs flat ${radar.held_out.flat_mean} (${radar.held_out.fitted_wins}/5)`,
      `token-radar-s9: walk-forward fitted ${radar.walk_forward.fitted_mean} vs flat ${radar.walk_forward.flat_mean} (${radar.walk_forward.fitted_wins}/4)`,
      `token-radar-s9: loo fitted ${radar.loo.fitted_mean} vs flat ${radar.loo.flat_mean} (${radar.loo.fitted_wins}/${radar.loo.n})`,
      `token-radar-s9: weibull lambda=${radar.weibull.lambda} k=${radar.weibull.k} n=${radar.weibull.n}`,
      `token-radar-s9: odds held-out fitted ${radar.odds_tests.held_out.fitted} vs assumed ${radar.odds_tests.held_out.assumed} vs base ${radar.odds_tests.held_out.base}`,
      `token-radar-s9: odds walk-forward fitted ${radar.odds_tests.walk_forward.fitted} vs assumed ${radar.odds_tests.walk_forward.assumed} vs base ${radar.odds_tests.walk_forward.base}`,
      `token-radar-s9: odds loo fitted ${radar.odds_tests.loo.fitted} vs assumed ${radar.odds_tests.loo.assumed} vs base ${radar.odds_tests.loo.base}`,
      `token-radar-s9: fitted-odds board ${radar.fitted_odds_board.counts.FARM}/${radar.fitted_odds_board.counts.THIN}/${radar.fitted_odds_board.counts.SKIP} top-10 overlap ${radar.fitted_odds_board.top10_overlap}/10 flips ${radar.fitted_odds_board.flips.total}`,
      `token-radar-s9: odds-reversal top-10 overlap ${radar.odds_reversal.top10_overlap}/10`,
      `token-radar-s9: accounting ${radar.counts.total} = ${radar.counts.ranked} board + ${radar.live_size} live + ${radar.small_size} smaller pre-token`,
      `token-radar-s9: dossier ${dossier.length} bytes, text ${Buffer.byteLength(dossierDoc.text, 'utf8')} bytes`,
      `token-radar-s9: wrote ${outputDir}`,
      '',
    ].join('\n'),
  );
  return 0;
}

process.exit(main());
