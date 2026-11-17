# Ball Speed Detector

Measures the speed of a bowled ball with the phone camera and calls "No ball" aloud when it is faster than a limit you set.

## Use it

1. Stand the phone side-on to the pitch and keep it still (a tripod helps). Landscape gives the widest view.
2. Allow camera access.
3. Drag the yellow lines **A** and **B** onto two marks on the pitch, and enter the real distance between them in metres.
4. Enter the maximum allowed speed.
5. Bowl. The speed appears with **Legal** or **NO BALL**; over the limit the phone says "No ball".

Tap **Test sound** once after opening so the phone is allowed to speak, and to check the volume.

The reading is the ball's average speed between the two lines. Accuracy depends on the camera frame rate (shown on screen), how carefully the lines are placed, and the light.

## Two ways to run

- **Web version** (`docs/index.html`, served by GitHub Pages): open the page in Safari or Chrome on the phone. On iPhone, Share → Add to Home Screen gives it an app icon.
- **Expo app** (Android and iOS): `npx expo start`, then open it in Expo Go.

## Develop

```bash
npm install
node scripts/test-detector.mjs   # detector tests on synthetic frames
node scripts/build-web.mjs       # rebuild docs/index.html after changing src/page.ts or src/detector.ts
npx tsc --noEmit
```

The ball tracking is in `src/detector.ts`, the camera screen in `src/page.ts`, and the app shell in `App.tsx`.
