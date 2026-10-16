# R1Pro real-robot integration acceptance

Integration target: `integration/r1pro-real-robot`. The existing `main` is not a
merge target for this batch. A later main PR requires administrator review.
Nothing in this branch publishes a release, deploys to a robot, or starts motion.

## Classification and traceability

| Type | Issue | Branch | Result |
|---|---|---|---|
| feature | [#10](https://github.com/insightos-community/semantic-web/issues/10) | `feature/r1pro-real-map-workspace` | Render real robot maps, models and project onboarding |
| bugfix | [#11](https://github.com/insightos-community/semantic-web/issues/11) | `bugfix/installed-robot-skill-catalog` | Show installed Robot Skills and typed completion states |
| bugfix | [#12](https://github.com/insightos-community/semantic-web/issues/12) | `bugfix/navigation-tolerance-form-units` | Accept decimal navigation tolerances with correct unit conversion |
| bugfix | [#13](https://github.com/insightos-community/semantic-web/issues/13) | `bugfix/workflow-recovery-actions` | Expose recovery actions for paused and exhausted tasks |
| bugfix | [#14](https://github.com/insightos-community/semantic-web/issues/14) | `bugfix/device-stream-epoch-and-idle-traffic` | Recover device streams and stop repeated terminal trace downloads |
| bugfix | [#15](https://github.com/insightos-community/semantic-web/issues/15) | `bugfix/deepseek-flash-provider-preset` | Correct the DeepSeek Flash provider preset |
| bugfix | [#16](https://github.com/insightos-community/semantic-web/issues/16) | `bugfix/real-robot-upstream-compatibility` | Preserve upstream compatibility and expose supported robot recovery actions |
| chore | [#17](https://github.com/insightos-community/semantic-web/issues/17) | `chore/r1pro-integration-acceptance` | Document integration acceptance, issue traceability and review coverage |

Each issue records cause, purpose, outcome and acceptance commands. Branches are
stacked in the table order so shared API and UI dependencies are retained. PRs
merge into the integration branch in that order; use merge commits to preserve
ancestry and avoid duplicating earlier changes in subsequent PRs.

## Automated acceptance

Run from a clean checkout with the repository toolchain installed:

```sh
bash tools/verify-real-robot-integration.sh
```

The existing PR CI remains authoritative for release packaging. This portable
entry point exercises source tests/builds without credentials or live hardware.
It does not replace physical acceptance. Validation at the reviewed code head:

- Vitest: 85 files, 578 tests passed, 6 intentionally skipped.
- Production build: passed; existing large-chunk warnings remain.
- ESLint reports no errors; formatting is normalized in this chore. Existing style warnings remain.
- Coverage includes navigation SI/display conversion, instance/Ability compatibility, recovery controls, epoch reset, terminal-trace caching, scene selection and twin transforms.

## Review evidence and limits

[OCR receipt](reviews/2026-10-16-r1pro.json) records the exact product base/head,
per-file decisions, exclusions, findings and fixes. Open-code-review 1.13.0 was
used in delegate mode: the CLI selected files/rules and the host developer agent
reviewed the diffs and reachable context. This is not an independent external
model approval. Default test/documentation exclusions are counted as skipped,
not as reviewed; production reviewable-file coverage is 100%.

Private operational overlays, live-scene scripts, raw conversation archives,
credentials and local deployment assets were not copied into this repository.
They remain in the original workspace snapshot. The separate robot-adapter
checkout has no configured remote and is outside this Framework/Web submission.
Browser rendering and physical task behavior still require a separate deployment
verification; this batch only integrates reviewed source changes.

Provider-name reference: [DeepSeek V4.1 Flash API announcement](https://api-docs.deepseek.com/news/news260910/). The canonical Flash ID is `deepseek-flash`; no provider credential was used by this acceptance run.
