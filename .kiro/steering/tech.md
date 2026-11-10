# Tech

## Stack
- React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite 8 multi-page build (`index.html` dashboard, `target/index.html` demo shop), plain CSS.
- Vitest + fast-check.

## Commands
- `npm test`: run all tests once. Never use watch mode from the agent.
- `npm run typecheck`, `npm run build`.
- `npm run dev` serves on port 5177. Ask the user to run it.

## Spec language rules
- The grammar lives in `src/spec.ts` and nowhere else. Every new step or monitor needs a parser, a formatter and a `describeStep` sentence.
- `parse(format(x)) == x` must hold for every step, monitor and expression. Add the new form to the arbitraries in `src/spec.test.ts`.
- A line that can't be parsed becomes `criterion.error`. Never throw out of `parseSpec`.
- Numbers on screen are read with `numberIn`; equality tolerates half a cent.

## Runner rules
- `src/runner.ts` talks to the page only through the `Driver` interface and the DOM.
- Type into inputs with the native value setter plus `input`/`change` events, so React sees the change.
- A failure always says what was expected and what was found. Missing elements are failures, not passes.
- Monitors that can't find their target yet (`ok: null`) report nothing rather than a pass.

## State rules
- All holding/haunted bookkeeping goes through `hauntReducer` (pure). Keep its invariants tested: one open haunting per failing criterion, invalid criteria never pass or fail, resolved stays resolved.

## Demo shop rules
- Each sabotage switch in `src/target/bugs.ts` breaks exactly one criterion in `src/defaultSpec.ts`, named in `breaks`.
- Bugs are read at call or render time from localStorage, so switches take effect without a reload.
