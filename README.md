# token-radar-01-s9

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bayyubenjamin/token-radar-01-s9/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bayyubenjamin/token-radar-01-s9/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar S9: a pre-token launch radar. It ranks 198 pre-token protocols by what their launch would be worth — a fitted comps curve, 7-day growth, maturity, and launch odds — each with a 7-step costed farm plan. Board: 159 FARM / 29 THIN / 10 SKIP; top implied value $34,111,493 (sentora-curator). The fitted comps curve and the fitted Weibull odds are each tested held-out, walk-forward, and leave-one-out, and the page recomputes every fitted number on load. All 758 protocols are accounted for: 198 on the board, 416 live-token, 144 smaller pre-token.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
