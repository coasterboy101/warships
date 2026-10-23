# warships
A web-based warship combat game

Proof of concept: top-down, built with React, PixiJS and `@pixi/react`, served by Vite on Node.js.

## Run

```
npm install
npm run dev      # http://localhost:5173
npm test         # simulation unit tests
npm run build    # typecheck + production bundle
npm start        # serve dist/ the way the droplet does, at http://127.0.0.1:3000
```

## Controls

| Input | Action |
| --- | --- |
| W / S | Throttle up / down (S past zero goes astern) |
| A / D | Rudder port / starboard |
| Mouse | Aim turrets |
| Left mouse (hold) | Fire guns |
| Space | Launch torpedo spread toward the aim point |

## Layout

- `src/game/` — pure simulation (no rendering): `types.ts` is the data contract, `constants.ts` holds every tunable, `sim.ts` advances the world.
- `src/render/` — Pixi scene, drawing functions, input hook and DOM HUD.
