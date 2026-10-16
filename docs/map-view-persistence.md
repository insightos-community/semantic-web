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
```

Unit tests cover camera capture/restore, invalid storage, map identity and
orthographic resizing. Pixel-level live-scene validation is a separate deployment
check; historical private overlay scripts are not included in this branch.
See [integration acceptance](r1pro-integration-acceptance.md).
