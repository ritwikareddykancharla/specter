import { describeStep, formatMonitor, formatStep, type Criterion } from './spec';

export interface Failure {
  /** Index of the failing probe step, or -1 for a monitor. */
  stepIndex: number;
  check: string;
  expected: string;
  actual: string;
}

export interface Haunting {
  key: string;
  criterionId: string;
  requirement: string;
  text: string;
  kind: 'probe' | 'monitor';
  failure: Failure;
  firstSeen: number;
  /** Seconds between the most recent sabotage and this detection. */
  detectedAfterS?: number;
  resolvedAt?: number;
}

export function issueTitle(h: Haunting): string {
  return `Spec violation ${h.criterionId}: ${h.text.replace(/\s+/g, ' ').slice(0, 90)}`;
}

export function issueBody(h: Haunting, c: Criterion | undefined, appUrl: string): string {
  const repro =
    h.kind === 'probe' && c?.probe
      ? c.probe
          .slice(0, h.failure.stepIndex + 1)
          .map((s, i) => `${i + 1}. ${describeStep(s)}`)
          .join('\n')
      : `This is a continuous monitor: \`${c?.monitor ? formatMonitor(c.monitor) : h.failure.check}\` stopped holding while the app was in use.`;
  return [
    `**Requirement ${h.criterionId}** (${h.requirement})`,
    `> ${h.text}`,
    '',
    `**Failed check:** \`${h.failure.check}\``,
    `**Expected:** ${h.failure.expected}`,
    `**Actual:** ${h.failure.actual}`,
    '',
    '**Steps to reproduce**',
    repro,
    '',
    `**First seen:** ${new Date(h.firstSeen).toISOString()}${h.detectedAfterS !== undefined ? ` (${h.detectedAfterS.toFixed(1)} s after the change that broke it)` : ''}`,
    `**App:** ${appUrl}`,
    '',
    '_Filed by Specter, which runs this spec against the live app._',
  ].join('\n');
}

/** Prefilled "new issue" link; no token needed. GitHub caps URLs, so long bodies are trimmed. */
export function issueUrl(repo: string, title: string, body: string): string {
  const max = 6000;
  const b = body.length > max ? `${body.slice(0, max)}\n…` : body;
  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(b)}`;
}

/** A task block to paste into .kiro/specs/<feature>/tasks.md so Kiro can fix it. */
export function kiroTask(h: Haunting, c: Criterion | undefined): string {
  const check = h.kind === 'probe' && c?.probe ? c.probe.map(formatStep).join('; ') : c?.monitor ? formatMonitor(c.monitor) : h.failure.check;
  return [
    `- [ ] Fix spec violation ${h.criterionId} (found by Specter)`,
    `  - ${h.text}`,
    `  - Failing check: \`${h.failure.check}\`: expected ${h.failure.expected}, got ${h.failure.actual}`,
    `  - Full ${h.kind}: \`${check}\``,
    `  - Done when Specter shows ${h.criterionId} holding again`,
    `  - _Requirements: ${h.criterionId}_`,
  ].join('\n');
}
