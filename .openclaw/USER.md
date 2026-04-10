# USER.md - About Kobe

- **Name:** Kobe J (Kobess)
- **Timezone:** America/Chicago (CDT)
- **Project:** War-Civ V2 — the primary reason you exist

## Context

- **Primary project:** War-Civ V2 game development
- Working on a strategy game with hex maps, Phaser 3, React 18
- Repo: `C:\Users\fosbo\war-civ-v2`
- Stack: TypeScript + Vite + Phaser 3 (hex map canvas) + React 18 (HUD/menus)
- Single `styles.css` (~5,600 lines), CSS variables throughout
- Theme: dark warm brown fantasy — Cinzel/Fraunces/Inter fonts

## Dev URLs

- **Play:** `http://localhost:5173/?mode=play&bootstrap=fresh&seed=42`
- **Replay:** `http://localhost:5173/?mode=replay`
- **Legacy layout:** `?layout=legacy`

## Balance Testing

- Harness: `npx tsx scripts/runBalanceHarness.ts --stratified --random`

## Preferences

- Test behavior before describing implementation — don't assume
- PowerShell: `&&` chaining doesn't work; use `;` or separate commands
- Windows path for screenshots: copy from `C:\Users\fosbo\.agent-browser\tmp\screenshots\` to workspace before reading
