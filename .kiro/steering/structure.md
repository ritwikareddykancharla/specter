# Structure

```
index.html            Dashboard entry
target/index.html     Demo shop entry
src/
  main.tsx            Dashboard React entry
  App.tsx             Dashboard: spec panel, live app frame, ghost cursor, sabotage, hauntings
  spec.ts             Spec language (pure)
  haunt.ts            Status reducer (pure)
  issue.ts            Issue + Kiro task text
  runner.ts           Probe and monitor execution
  defaultSpec.ts      Demo shop requirements with probes and monitors
  spec.test.ts, haunt.test.ts
  styles.css
  target/
    main.tsx, Shop.tsx, shop.css
    bugs.ts           Sabotage switches
.kiro/
  steering/           product.md, tech.md, structure.md
  specs/specter/      requirements.md, design.md, tasks.md
  hooks/
```

## Conventions
- Components: PascalCase files, named exports. Pure modules: camelCase with tests beside them.
- Criterion ids are `<requirement>.<n>` strings, e.g. `"2.1"`, and match the markdown exactly.
