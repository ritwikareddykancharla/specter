# Product: Specter

Specter turns a requirements doc into live checks against the running app, so the spec "haunts production": broken requirements turn red within seconds, with evidence, a drafted issue and a Kiro fix task. Kiroween 2026, **Frankenstein** category.

## Who it's for
- Teams that write specs (especially Kiro specs) and want them to stay true after launch.
- Solo builders who want a safety net without writing a separate end-to-end test suite.

## Pillars
1. **The spec is the source of truth.** Checks live next to the criterion they verify, in the same markdown.
2. **Readable by everyone.** Probe lines read like sentences; failures say expected vs. actual in plain words.
3. **Seconds, not sprints.** Detection time is measured and shown.
4. **Never cry wolf.** A check that can't run (missing element, bad selector, unreadable line) is reported as such, not as a pass.

## Tone and look
- A dark developer tool with a ghostly violet glow. Haunted lines pulse red with a 👻; fixed ones are "exorcised".
- Spooky vocabulary on top (haunting, exorcise, sabotage), precise engineering text underneath.

## Non-goals
- Replacing unit tests or load testing.
- Cross-origin targets in the prototype (same-origin iframe only).
