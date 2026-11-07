# Dit-Dah Command

A one-button Morse code rhythm game with a light real-time tactics layer, built from the
*DIT-DAH COMMAND — Game Design Plan*. You are a field commander cut off from your troops with
nothing but a telegraph key: every order is tapped in Morse, on the beat, and your units only
obey a clean signal.

**Free web edition — not for sale.** Plain HTML/CSS/JavaScript, no build step, no external
assets except a Google Font. All music and sound is synthesised live with the Web Audio API.

## Play

Open `index.html` through any static web server (ES modules don't load from `file://`):

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

### Controls

| Input | Straight key | Iambic paddles (unlocked in Paddle School) |
|---|---|---|
| Keyboard | Space or any key | Z / ← = dit, X / → = dah |
| Touch / mouse | Big KEY button (or tap the map / tape) | DIT and DAH buttons |
| Gamepad | Any button | LB / X / D-pad ← = dit, RB / B / D-pad → = dah |
| Pause | Esc / ❚❚ / Start | |

Tap = dit (·, one unit). Hold three times as long = dah (—). Every order is
**call sign + order + K** (e.g. `·· ——· —·—` = Infantry, advance, over).

## Publish on GitHub Pages

1. Push this branch (or merge it into `main`).
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Pick the branch and the `/ (root)` folder, then save.
4. The game appears at `https://<user>.github.io/<repo>/` after a minute.

## What's in it

- **Campaign** — 23 missions over 4 acts plus a finale. One new letter per mission, each with a
  30-second "listen, then repeat" drill. Every act ends with a decode mission.
- **The 8-bar loop** — report (bars 1–2), choose (bar 3), transmit (bars 4–7), resolve (bar 8).
- **Judging** — both key-down and key-up are judged against the beat grid
  (Crisp ±35 ms / Clear ±70 ms / Static ±120 ms / Garbled). Static orders arrive half a phrase
  late; the decoder reads exactly what you keyed, so a short dah can turn `·—·` (Retreat) into
  `···` (Scouts).
- **Tactics** — 3 lanes × 6 zones, fog of war, five unit types (T I S M A), six orders
  (G H F R D C), plus CQ (all units), SOS (reinforcements) and AR (sign-off bonus).
- **Guidance fades** — Acts 1–2 show the suggested code on the tape with a ghost tone, Act 3 only
  helps if you hesitate, Act 4 is from memory. Act 4 adds 16th-note units, tempo shifts, swing
  and spoofed orders with sloppy rhythm.
- **Paddle School** — five iambic lessons; finishing it unlocks paddles everywhere.
- **Extra modes** — Free Key (live decoder / trainer), Long Watch (endless, rising tempo,
  three strikes), Daily Dispatch (seeded daily decode; scores stay on this device), Codebook,
  Encore charts after the finale.
- **Accessibility** — latency calibration, input/visual offsets, Easy/Normal/Hard windows,
  Copilot and Strategist modes, 50–150% speed, no-fail, visual-only mode (screen-edge pulse,
  full subtitles), haptic beat on Android, shape + colour judgement markers.

Progress is saved in the browser (`localStorage`).

## Code map

| File | What it does |
|---|---|
| `js/morse.js` | Alphabet, prosigns, timing layout |
| `js/keyer.js` | Edge judging, decoder state machine, iambic keyer |
| `js/audio.js` | Audio clock mapping, key tone, procedural music |
| `js/battle.js` | Tactics simulation and Ada's order suggestions |
| `js/missions.js` | Campaign data, Paddle School, Codebook, story text |
| `js/mission.js` | The 8-bar mission loop |
| `js/drill.js` | Drills, Free Key, calibration |
| `js/tape.js`, `js/mapview.js` | Canvas renderers |
| `js/main.js` | Screens, saves, settings, input, HUD |

Not included from the plan: online leaderboards, Versus, the chart editor, the epilogue and
veteran campaigns (they need a server or a lot more content).
