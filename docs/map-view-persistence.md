# Map view persistence

MapPanel remembers camera preferences in browser localStorage, like the existing
Studio layout preferences. No Server/Pilot changes or robot requests are needed.

- Each project, map slot (Real Map / Simulation Map), generation and coordinate
  frame has a separate key. Map revision updates keep the same view.
- The last selected 2D/3D mode is restored. Both modes keep their own camera
  position, target, up direction, zoom and projection parameters.
- User gestures save on end, with a debounced final save after damping settles.
  Leaving the panel or reloading the page also flushes pending preferences.
- Async mesh loading and map refresh do not auto-fit a restored view.
- Resizing preserves the orthographic vertical span and zoom.
- **回到原点** clears the current camera's navigation offset/zoom, fits the map,
  and saves that view. It does not modify the map or robot coordinate system.
- Invalid stored data is ignored. Disabled/full browser storage does not prevent
  map navigation. Preferences are local to this browser, not synchronized across
  devices. The stored schema version is `1.0.0`.

Validation:

```sh
npx vitest run tests/unit/map-view-state.test.js tests/unit/v030-map-navigation.test.js
node tests/integration/map-view-memory.mjs <url> <evidence-dir> <token-file> <project-id> [preview-web-root]
```

The browser check uses a fresh browser context, compares rendered pixels before
and after restoration, covers both modes, panel reopen, map switching, data
refresh and resetting, and rejects any HTTP mutation/robot action request.

The current production renderer has a source revision unavailable locally. Use
`tools/map-view-overlay.mjs` on a normalized deployment snapshot, followed by the
real repository's `semantic/tools/version-web-assets.py`. The overlay takes the
persistence block directly from MapPanel source and preserves the deployed
renderer geometry, map-frame rotation, picking and outline implementations.
Do not replace production with a full local `dist` until the original renderer
source is reconciled.
