# Default real scene

Projects with a `real_scene` returned by the project scenes endpoint automatically
select that configuration and open Real Map from **场景与 Layout**. The sidebar shows
the robot name. **接入实机** displays the robot and existing Pilot map source selector;
**查看 Real Map** returns to the synchronized map. Real scenes do not start a
simulation runtime. Explicit simulation scene/map selections remain available.

The configuration uses the persisted project→Pilot map binding as its single
source of truth. Refreshing creates no duplicate scene. Unbound simulation
projects retain their existing scene and runtime behavior.

Validation:

```sh
npx vitest run tests/unit/studio-scene-workspace.test.js tests/unit/simulation-store.test.js tests/unit/pilot-map-source.test.js
```

The integration branch builds the source renderer and preserves explicit
simulation selection. Historical deployment-overlay/browser scripts are kept in
the private operational archive; they are not repository acceptance commands.
A fresh deployment still needs visual verification against its selected map and
robot. See [integration acceptance](r1pro-integration-acceptance.md).
