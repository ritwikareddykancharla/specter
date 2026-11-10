# Requirements: Specter

## Introduction
Specter runs the acceptance criteria of a requirements document as live checks against a running web app and shows, line by line, which requirements hold.

## Requirement 1: Read the spec
**User story:** As a developer, I want my existing requirements markdown to drive the checks.

### Acceptance criteria
1. The system SHALL read requirements as `## Requirement N: Title` headings with criteria numbered `N.M`.
2. WHEN a criterion has an indented `probe:` or `monitor:` line THEN the system SHALL parse it into an executable check.
3. IF a check line can't be parsed THEN the system SHALL mark that criterion unreadable with the reason and SHALL keep running the others.
4. WHEN the user edits and applies the spec THEN the system SHALL start checking the new version immediately and remember it across reloads.

## Requirement 2: Probes
**User story:** As a developer, I want scripted visits replayed against the live app.

### Acceptance criteria
1. WHILE haunting is on, the system SHALL run every probe in turn, repeatedly.
2. The system SHALL support visit, click, type, remember number, expect number with arithmetic, expect text, expect visible within a time, expect hidden after a time, and wait.
3. WHILE a probe runs, the system SHALL show a ghost cursor on the element each step acts on and mark the criterion as running.
4. WHEN a step fails THEN the system SHALL record which step, the check, the expected value and the actual value.
5. WHERE turbo is on, the system SHALL skip the visual pacing.

## Requirement 3: Monitors
**User story:** As a developer, I want invariants watched while real people use the app.

### Acceptance criteria
1. The system SHALL check "number X == sum of Y" monitors on every DOM change of the app.
2. The system SHALL record uncaught errors and unhandled promise rejections in the app and fail "no errors in N s" while any occurred in the last N seconds.
3. Monitors SHALL keep running while probes are paused.
4. IF a monitor's element isn't on the page THEN the system SHALL report nothing for it rather than a pass.

## Requirement 4: Hauntings
**User story:** As a developer, I want broken requirements to be impossible to miss and easy to fix.

### Acceptance criteria
1. WHEN a check fails THEN the criterion SHALL turn red and the system SHALL open exactly one haunting for it, with evidence.
2. WHEN that check passes again THEN the system SHALL resolve the haunting and show how long it lasted.
3. WHEN a failure follows a sabotage within 2 minutes THEN the system SHALL show the detection time.
4. The system SHALL draft a GitHub issue (title, requirement, failed check, expected, actual, reproduction steps, first seen, app URL) and open it as a prefilled link for a configurable repo.
5. The system SHALL copy a Kiro task block that references the criterion id.
6. The header SHALL show how many criteria hold, are haunted, are unchecked and are unreadable.

## Requirement 5: Demo
1. The system SHALL include a demo shop and a sabotage panel where each switch breaks exactly one criterion of the default spec.
2. "Exorcise everything" SHALL turn every switch off.
