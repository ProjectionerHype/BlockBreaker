# Neon Arcade

A browser-based neon arcade game hub with two games and a full-screen animated homepage.

## Run & Operate

- `pnpm --filter @workspace/3d-game run dev` — start dev server (port 3000)
- `pnpm --filter @workspace/3d-game run build` — production build
- `pnpm --filter @workspace/3d-game run typecheck` — type check

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React + Vite (TypeScript)
- **Rendering**: HTML5 Canvas (game loop via requestAnimationFrame)
- **Styling**: Inline styles + Tailwind (UI overlays)
- **Node**: 24, TypeScript 5.9

## Where things live

- `artifacts/3d-game/src/App.tsx` — root navigator (home / block-breaker / balls-bricks)
- `artifacts/3d-game/src/pages/Home.tsx` — full-screen animated game selection homepage
- `artifacts/3d-game/src/game/BlockBreaker.tsx` — Block Breaker paddle game (~1878 lines)
- `artifacts/3d-game/src/game/BallsBricks.tsx` — Balls vs Bricks turn-based game
- `artifacts/3d-game/src/game/levels.ts` — 50 level definitions for Block Breaker
- `artifacts/3d-game/public/sw.js` — service worker (network-first for JS/HTML, cache-first for static)

## Architecture decisions

- All game state lives in refs (not React state) so the game loop never triggers re-renders — only UI overlays use React state.
- Canvas is fixed-resolution (GAME_W × GAME_H) and scaled via CSS width/height to fit any screen without changing internal coordinates.
- Service worker uses network-first for HTML/JS/CSS so code updates always reflect immediately; cache-first only for truly static assets (icons, images).
- Only three things persist in localStorage: `bb-hi` (best score), `bb-unlocked` (highest level reached), `bb-completed` (set of cleared levels). Streak and other transient data are in-memory only.

## Product

- **Homepage**: Animated particle background, two game cards with hover effects
- **Block Breaker**: Classic paddle game, 50 levels, power-ups, combos, portrait/landscape support
- **Balls vs Bricks**: Turn-based "Ballz"-style game — aim and shoot multiple balls, numbered bricks descend each turn, collect +1 ball power-ups, game ends when bricks reach the bottom

## User preferences

- Keep localStorage minimal: only best score + level progress (no streak, no transient game state)
- Code updates must always reflect: service worker uses network-first for game assets

## Gotchas

- Canvas pointer events use `getBoundingClientRect()` + manual scale division to map CSS pixels → game coordinates
- BlockBreaker has its own sound toggle (top-right); the ← HOME button is injected from App.tsx at top-left
- Service worker cache name must be bumped (`block-breaker-v2`, etc.) when doing breaking deployments

## Pointers

- Game loop skill: `artifacts/3d-game/src/game/BlockBreaker.tsx` patterns
- Service worker: `artifacts/3d-game/public/sw.js`
