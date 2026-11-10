# Specter 👻

**Your spec haunts production.** Specter reads an EARS-style requirements doc, the kind Kiro writes in `.kiro/specs/*/requirements.md`, and turns each acceptance criterion into a live check against the running app. When the app breaks a requirement, that line of the spec turns red within seconds, Specter shows what it expected and what it got, and drafts a GitHub issue and a Kiro task to fix it.

Kiroween 2026 entry, **Frankenstein** category: a requirements document, a browser test runner, a production monitor and an issue tracker, stitched into one.

## Why

Specs are written once and then drift away from the code. Tests check the code at build time; monitoring checks servers at run time. Nothing checks that the *requirements* still hold for real users of the deployed app. With Specter, the spec itself is the thing being checked.

## Try it

Open the dashboard. It's already haunting the bundled demo shop, **Cauldron & Co.**:

1. Watch the ghost cursor replay each probe in the live app. Every criterion goes green.
2. Open **😈 Sabotage** and flip a switch, for example "Add-to-cart adds two".
3. Within a few seconds, requirement 1.1 turns red and a card appears under **Hauntings** with the failing check, expected vs. actual, and how long detection took.
4. Press **Draft issue** for a prefilled GitHub issue with reproduction steps, or **Copy Kiro fix task** for a block to paste into `tasks.md`.
5. Press **Exorcise everything**. Each requirement turns green again and the haunting moves to "Exorcised".

Press **Edit spec** to change the requirements. A new `probe:` or `monitor:` line starts running as soon as you press Apply.

## The spec language

Each acceptance criterion can carry one indented line that makes it executable:

```markdown
## Requirement 1: Cart
1.1 WHEN the shopper adds a potion THEN the cart count SHALL increase by exactly 1.
    probe: visit; remember number #cart-count as before; click [data-add=toad]; expect number #cart-count == before + 1
1.2 The cart subtotal SHALL always equal the sum of its line prices.
    monitor: number #cart-subtotal == sum .line-price
```

- **Probes** are scripted visits Specter replays over and over: `visit`, `click <selector>`, `type <selector> "text"`, `remember number <selector> as <name>`, `expect number <selector> <op> <expression>`, `expect text <selector> contains|== "text"`, `expect visible <selector> [within N ms]`, `expect hidden <selector> [after N ms]`, `wait N ms`. Expressions support `+ - * /`, parentheses, remembered names, `round()` and `round2()`.
- **Monitors** are invariants checked on every DOM change while people use the app: `number <selector> <op> sum <selector>` and `no errors [in N s]`, which catches uncaught exceptions and unhandled promise rejections.

A line Specter can't read is flagged on that criterion (⚠); the rest of the spec keeps running.

## Run it locally

Requires Node.js 22.18 or newer.

```bash
npm install
npm run dev        # http://localhost:5177 (dashboard) and /target/ (demo shop)
npm test           # property-based tests
npm run build      # static site in dist/
```

## How it works

- The dashboard loads the target app in a **same-origin iframe** and drives its DOM directly: clicks, typing in a way React notices, and reading numbers from text (`"$1,204.50"` → 1204.5).
- Probes run one at a time, forever. Each `visit` reloads the app fresh. Monitors run on a `MutationObserver` and once a second, and the iframe's `error` and `unhandledrejection` events feed `no errors`.
- A pure reducer (`src/haunt.ts`) tracks each criterion as holding, haunted, not yet checked or unreadable. It opens one haunting per broken criterion, resolves it when the check passes again, and times detection from the most recent sabotage.
- Issues use GitHub's prefilled `issues/new?title=&body=` link, so no token is needed.

**Limits of this prototype:** it can only haunt pages on the same origin as the dashboard, which is why the demo shop is bundled. A real deployment would run probes in a headless browser on a schedule and collect monitors through a small script in the app. Probe lines are written by hand or by Kiro through the hook below; Specter doesn't generate them itself.

## How it's tested

[fast-check](https://fast-check.dev/) property-based tests (`src/spec.test.ts`, `src/haunt.test.ts`):

- **Parser round trips:** `parseExpr(formatExpr(e))`, `parseProbe(formatProbe(steps))` and `parseMonitor(formatMonitor(m))` rebuild the original for any generated expression, probe or monitor, including quotes and semicolons inside typed text.
- **Expressions** evaluate exactly like the equivalent JavaScript, with the same precedence and associativity.
- **numberIn** reads back any amount formatted as money; `==` tolerates rounding to the cent and is always the exact opposite of `!=`.
- **Reducer invariants** over random sequences of results, sabotages and spec edits: a criterion is haunted exactly when it has one open haunting; unreadable criteria never pass or fail; resolved hauntings stay resolved; detection time is only credited within 2 minutes of a sabotage.
- The built-in spec parses with exactly one check on every criterion, and issue links survive the URL round trip.

End-to-end in headless Chromium: with three sabotages on (double add, slow search, crash), Specter caught each one in 3.1 s, 2.0 s and 0.5 s. After "Exorcise everything", all 7 criteria held again.

## Project layout

```
src/
  spec.ts          Spec language: parser, formatter, expressions (pure, tested)
  haunt.ts         Holding/haunted state machine (pure, tested)
  issue.ts         Issue and Kiro task drafting
  runner.ts        Runs probes and monitors against a DOM
  App.tsx          Dashboard: spec, live app, sabotage, hauntings
  defaultSpec.ts   The demo shop's requirements
  target/          Cauldron & Co., the demo shop, with sabotage switches
target/index.html  Demo shop entry
.kiro/             Steering, spec and hooks used to build this with Kiro
```

## License

[MIT](./LICENSE)
