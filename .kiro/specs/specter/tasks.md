# Implementation Plan: Specter

- [x] 1. Scaffold (Vite multi-page, React, TypeScript strict, Vitest, fast-check), MIT license, steering docs

- [x] 2. Spec language in `src/spec.ts`: criteria, probes, monitors, expressions; properties P1–P6
  - _Requirements: 1.1–1.3, 2.2_

- [x] 3. Status reducer in `src/haunt.ts`; properties P7–P10
  - _Requirements: 4.1–4.3, 4.6_

- [x] 4. Runner: Driver interface, probe steps, monitors, error capture
  - _Requirements: 2.1, 2.4, 3.1–3.4_

- [x] 5. Demo shop (Cauldron & Co.) with six sabotage switches, one per criterion
  - _Requirements: 5.1, 5.2_

- [x] 6. Dashboard: rendered spec with live status, spec editor, iframe with ghost cursor, turbo, hauntings feed
  - _Requirements: 1.4, 2.3, 2.5, 4.6_

- [x] 7. Issue drafting, GitHub link, Kiro task copy; property P11
  - _Requirements: 4.4, 4.5_

- [x] 8. Headless browser run: three sabotages caught in 0.5–3.1 s, all resolved after exorcising

- [ ] 9. Deploy to GitHub Pages and add the live URL to the README

- [ ] 10. Toward a real product
  - [ ] 10.1 Headless runner (Playwright) so probes can haunt any URL on a schedule
  - [ ] 10.2 A tiny monitor script apps can include to report invariants and errors
  - [ ] 10.3 MCP server exposing open hauntings to Kiro, so Kiro can pick up and fix them
  - [ ] 10.4 Read `.kiro/specs/*/requirements.md` straight from a GitHub repo
  - [ ] 10.5 Slack / Discord alerts when a requirement breaks
