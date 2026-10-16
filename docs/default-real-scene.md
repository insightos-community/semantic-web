# Default real scene

Projects with a `real_scene` returned by the project scenes endpoint automatically
select that configuration and open Real Map from **场景与 Layout**. The sidebar shows
the robot name. **场景配置** displays the robot and existing Pilot map source selector;
**查看 Real Map** returns to the synchronized map. Real scenes do not start a
simulation runtime. Explicit simulation scene/map selections remain available.

The configuration uses the persisted project→Pilot map binding as its single
source of truth. Refreshing creates no duplicate scene. Unbound simulation
projects retain their existing scene and runtime behavior.

Validation:

- `npx vitest run tests/unit/studio-scene-workspace.test.js tests/unit/simulation-store.test.js`
- `node tests/integration/default-real-scene.mjs <base-url> <output-dir> <token-file> <project-id> [preview-root]`

The browser check reads an existing R1Pro project, verifies the default map,
configuration, refresh, and explicit Simulation Map selection, saves screenshots,
and asserts that no write request or robot action was dispatched.

For the current experimental deployment, the original map-renderer source commit
is unavailable. Preserve its deployed assets and use
`node tools/real-scene-overlay.mjs <normalized-web-root>` followed by the real
repository's `semantic/tools/version-web-assets.py`. The overlay compiles these
Vue components from source against the existing runtime, includes their styles,
and validates the matching store/sidebar anchors for all three deployed entry
graphs. It leaves the existing MapPanel calculations and twin renderer intact.
Do not replace the deployment with this checkout's full `dist` until the missing
renderer source is reconciled. Full source builds remain a compilation check.
