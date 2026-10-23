# Arcade

Small browser games by Juli Astawa, embedded in his portfolio (https://www.juliasta.my.id, repo at
`~/Developer/portofolio`) through an iframe in a popup. Each game lives in its own folder under `src/games/`
(`typing/` is the first). The portfolio's own game, **Uptime**, stays inside the portfolio as its "signature" game;
everything here is the rest of the collection.

## Working with Juli

- Reply in casual Indonesian; keep code, comments and commit-style text in English.
- **Juli handles git** (init, branches, commits, pushes, merges). Don't commit or push unless asked.
- The homelab is reachable only over Tailscale. Opening anything from it to the public (e.g. a tunnel) is a
  deliberate decision: suggest isolating it (own VM/container, no LAN access) and flag real secrets.

## Plan (agreed 2026-10-19)

- Static site, deployed to a subdomain such as `arcade.juliasta.my.id` (Vercel or Cloudflare Pages), one
  path per game: `/typing/`, ... The homelab tunnel is only for a later backend piece (e.g. a leaderboard API).
- Stack (2026-10-23): **Astro only**, like the portfolio, for every game. Pages, layouts and components are
  `.astro`; a game's interactivity is the `<script>` in its component, written in TypeScript and imported from
  files beside it (the portfolio does the same with `Uptime.astro` and `src/lib/uptime.ts`). No other build
  tool, no UI frameworks, no trackers; keep each game small.
  - Standard Astro layout: `src/pages/` for routes, `src/layouts/`, `src/styles/`, `src/lib/` (embed
    contract, storage), and one folder per game in `src/games/` (`src/games/typing/`).
  - Fonts through Astro's Fonts API, the same config as the portfolio.
  - Dev server on port 4322 (the portfolio has 4321); `npm run check` runs `astro check`.
- The portfolio side is built (2026-10-23, `src/components/Arcade.astro` in the portfolio): a popup that lists
  the games, runs Uptime in place, and loads a hosted game in an iframe
  (`sandbox="allow-scripts allow-same-origin"`) only while it's open. It focuses the iframe once `ready`
  arrives and shows a "the arcade may be down" fallback if `ready` hasn't come within 10 seconds. The
  terminal's `play` opens the list, and `play <id>` opens a game. A hosted game is added to the list from
  the portfolio session, with one entry in its `content.ts` (`arcade.games`, with a `path`), once it's deployed.

## Embed contract

- URL params: `?theme=light|dark&lang=en|id&embed=1`. Without them: follow `prefers-color-scheme`, English,
  standalone page.
- With `embed=1`: no outer chrome (the portfolio popup has its own title bar and close button); fill the
  frame; transparent-safe background using the tokens below.
- `postMessage` to the parent, `{ source: 'arcade', type: 'ready' }` once loaded and
  `{ source: 'arcade', type: 'close' }` on Esc. Esc inside an iframe never reaches the parent `<dialog>`, so
  the game must report it. The parent may send `{ source: 'portfolio', type: 'theme', theme }`. Both sides
  check `event.origin`. The game finds the parent's origin from `location.ancestorOrigins` or, in Firefox,
  `document.referrer`, so the iframe must not set `referrerpolicy="no-referrer"`; the parent should also
  focus the iframe on open, or keys stay in the parent page.
- Deploy header: `Content-Security-Policy: frame-ancestors 'self' https://www.juliasta.my.id https://juliasta.my.id http://localhost:4321`.
- `localStorage` (personal bests) wrapped in try/catch; it is per origin and can be unavailable.
- Respect `prefers-reduced-motion`.
- Mobile:
  - Text inputs at 16px or more, or iOS zooms in on focus. To look smaller, set 16px and scale down with a transform.
  - On-screen keyboards cover the page without resizing it; use `visualViewport` to keep the active area visible.

## Look: match the portfolio

Editorial and monochrome, cream and ink, hairline grids (1px gaps over a `--line` background), mono uppercase
labels with wide letter-spacing, one orange accent. Light and dark:

| token | light | dark |
|---|---|---|
| `--bg` | `#f3efe7` | `#131210` |
| `--bg-raised` | `#f8f5ef` | `#1c1b18` |
| `--ink` | `#151412` | `#f0ece3` |
| `--ink-soft` | `#3b3833` | `#c8c2b6` |
| `--muted` | `#757067` | `#8f897e` |
| `--line` | `#dcd6cb` | `#2c2a26` |
| `--line-strong` | `#b9b2a5` | `#4a463f` |
| `--accent` | `#c4532c` | `#e2774f` |

- **Fonts:**
  - Jost 500–800 for display text;
  - JetBrains Mono 400/500 for labels and code;
  - Inter 400–600 for body;
  - Instrument Serif 400, italic, for accents.
- **Easing:** `cubic-bezier(0.22, 1, 0.36, 1)`.

## First game: typing test (`src/games/typing/`)

A typing test with a developer's flavour.

- **Modes:**
  - `words`: common words, EN or ID, picked with a switch in the game (not the site's language; `lang` only
    sets the first default, then the choice is remembered);
  - `code`: realistic Go, Python and SQL snippets from Juli's stack, with indentation and newlines handled sensibly;
  - `shell`: real commands, e.g. docker, git, systemctl, tailscale, Proxmox `qm`.
- **Results:** WPM ((correct chars / 5) / minutes), raw WPM, accuracy, the most-missed keys, and a personal best per mode.
- **Interface:** bilingual (EN/ID, following `lang`), keyboard-first, but usable on a phone. Every key shows:
  letters typed where a space or line break is due appear as extras until backspaced.
- **Agreed 2026-10-23:** all three modes ship; `words` is timed (15/30/60s, default 30), `code` and `shell`
  run to the end of the snippet (six commands per `shell` round).

## Third game: Pipeline (`src/games/pipeline/`, route `/pipeline/`)

Agreed with Juli on 2026-10-23: build it straight away, with the decisions below. Difficulty, timings and
copy get tuned with him afterwards. It's a calm, thinking game, as the arcade's third genre: Uptime is
reflexes and the typing test is speed.

**Concept:** a *Pipe Mania* style rotation puzzle with a CI/CD flavour. Rotate the pipe tiles so the line
runs from `PUSH` to `PROD`, through every stage, in order (`BUILD`, then `TEST`, then `DEPLOY`), before the
CI timer runs out.

**Board**
- A square grid of tiles:
  - pipe pieces: straight, corner, tee and cross; some cells empty;
  - fixed stage tiles: `PUSH` (source, one opening), `BUILD`, `TEST` and `DEPLOY` (straight pieces with a
    mono label), `PROD` (sink, one opening).
- Stage tiles, plus a few "locked" pipes from level 4, can't rotate.
- **Generation:**
  - Use a seeded PRNG (e.g. mulberry32) so a level can be replayed; show the seed small, e.g. `run #a3f9`.
  - Carve a self-avoiding path from `PUSH` to `PROD` and place the stages along it in order.
  - Give each path cell the piece its two openings need, then fill the other cells with decoys: dead ends,
    tees that branch away, crosses.
  - Scramble the rotations of every rotatable tile, and re-scramble if the board starts out solved.
  - This guarantees each level can be solved.
- **Connection:** tiles connected to `PUSH` light up live as they're joined (unconnected tiles in
  `--line-strong`, connected ones in `--ink`).
- **Win:** the line from `PUSH` reaches `PROD` and passes the stages in order. If it reaches `PROD` with a
  stage missing or out of order, show a short hint instead of a win, e.g. "test ran before build" or "no
  tests? not shipping that".

**Levels:** a run is consecutive levels until a timeout.

| Level | Grid | Stages | Notes |
|---|---|---|---|
| 1 | 4×4 | `BUILD` | |
| 2 | 5×5 | `BUILD`, `TEST` | |
| 3 | 5×5 | `BUILD`, `TEST`, `DEPLOY` | |
| 4–5 | 6×6 | all three | locked tiles and more decoys |
| 6+ | 7×7 | all three | |

- Each level has a CI budget: 60 seconds at first, about 3 seconds less per level, never under 30.
- Clearing a level adds what's left of its time to the run's score.
- A timeout ends the run: "build timed out", with the levels cleared, the score, and a personal best (the
  highest level) in `localStorage`.
- Restarting a level (`R`) is allowed and keeps the clock running.

**Controls**
- Click or tap rotates a tile clockwise; Shift+click or right-click rotates it back.
- Arrow keys move a cursor; Space or Enter rotates, Shift+Space rotates back.
- `R` restarts the level; Esc sends `close` (embed contract).
- Tiles are at least 44px and the grid fits a phone's width. There's no text input, so the on-screen
  keyboard doesn't matter here.

**Look**
- **Board and HUD:**
  - tiles are `<button>`s in a hairline CSS grid, each pipe drawn as inline SVG;
  - a HUD row like the typing test's: level, CI time, moves, best;
  - a footer of key hints, as in the typing test.
- **Clearing a level:**
  - a short run along the path in `--accent`;
  - CI log lines tick in (`✓ build`, `✓ test`, `✓ deploy`, `shipped to prod`), then the next level.
- **Rotation:** eased with the portfolio's easing; instant under `prefers-reduced-motion`.

**Text:** bilingual EN/ID by `lang`, covering the rules, statuses, fail hints and results. Keep the stage names
(`PUSH`, `BUILD`, `TEST`, `DEPLOY`, `PROD`) in English.

**When it's done:**
- Add Pipeline to the arcade's index page.
- Check it embedded at about 900×620 (the portfolio's popup) and at a phone's width.
- Tell Juli it's ready to deploy. The portfolio session then adds it to the arcade list.
