# Ball Speed Detector

Measures the speed of a bowled ball with the phone camera and calls "No ball" aloud when it is faster than a limit you set.

## Use it

1. Allow camera access.
2. Stand the phone side-on to the ball's path, 2 to 4 m away, and keep it still (a tripod helps). Landscape gives the widest view.
3. Enter the maximum allowed speed and pick the ball type.
4. Bowl. The speed appears with **Legal** or **NO BALL**; over the limit the phone says "No ball".

Tap **Test sound** once after opening so the phone is allowed to speak, and to check the volume.

### How the speed is worked out

A camera sees movement in pixels, so it needs a scale to turn that into km/h. There are two ways to get it, chosen under **Scale**:

- **Automatic** (default): nothing to set up. The ball is a known size (a cricket ball is 7.2 cm across), so its width in the picture gives the scale. The ball must look big enough to size, which is why the phone has to be within a few metres of its path; if it is too far the app says so instead of guessing.
- **Crease lines**: drag two lines onto the bowler's and batsman's creases (17.68 m apart on a standard pitch, or enter another distance). The phone can stand further back and see the whole pitch. This is the more accurate method when the lines are placed carefully.

The reading is the ball's average speed while it crosses the picture. Accuracy depends on the camera frame rate (shown on screen), the light, and in automatic mode on how large and sharp the ball appears.

## History

Choose the bowler before each spell (**Add** creates a new one). Every delivery is saved on the phone with the bowler, speed, time, the limit in force and the verdict. **Full history** lists them, filtered by bowler, with the fastest and average speed and the number of no balls. History stays on that phone; it is not shared between devices.

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
