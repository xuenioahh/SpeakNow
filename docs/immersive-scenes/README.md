# SpeakNow immersive scenes

The scenario preview now contains twelve individually furnished 3D spaces, each with three inspectable objects linked to the existing speaking task. Open `/voice`, choose a place, and select a numbered marker or an object button below the scene. Object details provide fictional role-play context and a suggested spoken opening; discovering objects is not a speaking score.

## Interaction

- Drag horizontally on touch devices; drag horizontally or vertically with a mouse.
- Use **Overview** / **Step inside**, zoom buttons, camera reset, and daylight/evening lighting.
- **Expand scene** enlarges the world in the page without taking over keyboard focus.
- Focus the canvas and use arrow keys to rotate, `+` / `-` to zoom, and `Home` to reset.
- Every 3D hotspot also has a normal keyboard-accessible button below the canvas.
- On the live conversation page, **Step into [place]** opens the same space. Closing it keeps the conversation intact.

## Visual direction and skills

Warm architectural dioramas, restrained serif place titles, scene-specific materials and light, and minimal overlays. Cafe steam and a restaurant candle add quiet motion. All geometry and sign textures are generated locally; the 3D view needs no remote models or images. The existing scenario-gallery photographs are unchanged.

Used the local game-studio skill guidance for React-hosted 3D boundaries (`react-three-fiber-game`), playfield-preserving UI (`game-ui-frontend`), and screenshot-based browser verification (`game-playtest`). Retained the existing imperative Three.js runtime, isolated behind a renderer adapter, instead of adding a second renderer framework.

## Code

- `src/lib/immersiveScenarios.js`: place palette, atmosphere and 36 role-play cues.
- `src/components/scene/buildRoom.js`: local models, signs, lights, props and resource disposal.
- `src/components/scene/createScene.js`: camera, picking, DOM-marker projection, input and renderer lifecycle.
- `src/components/ScenarioStage.jsx`: accessible controls, discovery state, contextual details and fallback.
- `src/scenario-studio.css`: responsive scene composition and typography.
- `src/pages/VoiceChat.jsx`: lazy-loaded scene entry during a conversation.

Animation is capped at approximately 30 fps. Static scenes render on demand after camera movement settles; animated scenes pause when offscreen or the document is hidden. Reduced motion disables ambient animation and camera interpolation. Pixel ratio is capped at 1.6, shadow maps at 1024². Disposal releases GPU buffers, textures, shadow targets and WebGL contexts. Context loss preserves text interactions and offers an explicit retry.

## Verification

`npm run build` and `npm run lint` pass. `scripts/check-immersive-browser.cjs` checks all 12 scenes and 36 cues, camera controls, near view, lighting, expansion, reduced motion, keyboard navigation, 390px/320px layout, touch dragging, real WebGL context loss and retry, no-WebGL fallback, and the live-conversation integration. It captures screenshots of every scene.

Run with Playwright installed in your tooling environment:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/check-immersive-browser.cjs
```

Optional environment settings: `SPEAKNOW_TEST_URL` (defaults to `http://127.0.0.1:5173/voice`), `SPEAKNOW_TEST_ARTIFACTS` (defaults to `/tmp/speaknow-immersive`). Tests mock authentication in an isolated browser context; they do not modify real accounts. Local frontend and backend can be started with `npm run dev`.

The full repository typecheck is still blocked by errors in other modules, including `CasualVideo.jsx` and `VoiceSetup.jsx`. Added the matching `@types/three` package; the new scene modules and modified conversation page have no diagnostics in the typecheck output. This work does not certify existing speech evaluation or backend behavior.

## Screenshots

- [Cafe, near view](cafe-inside.png)
- [Cafe, evening light](cafe-evening.png)
- [Airport](airport.png)
- [Museum](museum.png)
