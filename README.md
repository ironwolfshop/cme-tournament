# MLBB OBS Overlays

React + Tailwind OBS Browser Source overlays styled like MPL broadcasts. Operator control panels drive everything in real time (MLBB has no public live API).

## Quick start

```bash
npm install
npm run dev
```

| Page | URL |
|------|-----|
| Draft control | http://localhost:5173/control |
| Draft overlay | http://localhost:5173/overlay |
| Gameplay control | http://localhost:5173/control/game |
| Gameplay overlay | http://localhost:5173/overlay/game |

## OBS setup

Add a **Browser Source** for each overlay you need:

### Draft (pick/ban)
- URL: `http://localhost:5173/overlay`
- Size: **1920 × 1080**

### Gameplay (in-game HUD)
- URL: `http://localhost:5173/overlay/game`
- Size: **1920 × 1080**

Optional Custom CSS for transparency:

```css
body { background-color: rgba(0, 0, 0, 0); margin: 0; overflow: hidden; }
```

Keep `npm run dev` running while you stream. Place browser sources above your game capture.

## Draft overlay

1. Open `/control`
2. Set teams, phase, active slot
3. Click heroes to ban/pick — overlay updates instantly
4. Timer, BPM, AI predictor editable from control

## Gameplay overlay

Includes:
- Top scoreboard (clock, series score, kills, towers, gold lead)
- Left/right player sidebars (hero, level, KDA, gold)
- Bottom featured cam frames + item builds + BPM
- Animated event banners (Turtle / Lord / First Blood / Maniac / etc.)

1. Open `/control/game`
2. Edit player stats, items, featured cams
3. Start the game clock
4. Click an event button (e.g. **TURTLE SLAIN**) to fire the banner

For real player cams in OBS: crop/place webcam sources into the bottom corner **CAM SLOT** regions, or set player photo URLs in control.

State syncs across tabs via `localStorage` + `BroadcastChannel` (same PC, no server).

## Production build

```bash
npm run build
npm run preview
```

## Notes

- Hero portraits load from Moonton’s public CDN (name fallback if blocked).
- Items use colored abbreviation tiles.
- This does **not** read data from the MLBB client — an operator mirrors the match.
