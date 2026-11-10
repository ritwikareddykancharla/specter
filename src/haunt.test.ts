import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DETECT_WINDOW_MS, hauntReducer, initialHaunt, type HauntAction, type HauntState } from './haunt';
import type { Criterion } from './spec';

const criteria: Criterion[] = [
  { id: '1.1', text: 'count +1', probe: [{ k: 'visit' }] },
  { id: '1.2', text: 'subtotal', monitor: { k: 'sum', sel: '#s', op: '==', of: '.l' } },
  { id: '2.1', text: 'discount', probe: [{ k: 'visit' }] },
  { id: '9.9', text: 'broken', error: 'bad probe' },
];

const action: fc.Arbitrary<(now: number) => HauntAction> = fc.oneof(
  { weight: 8, arbitrary: fc.record({ c: fc.constantFrom(...criteria), ok: fc.boolean(), kind: fc.constantFrom('probe' as const, 'monitor' as const) }).map(({ c, ok, kind }) => (now: number): HauntAction => ({ type: 'result', criterion: c, requirement: 'R', kind, ok, now, failure: ok ? undefined : { stepIndex: 0, check: 'x', expected: '1', actual: '2' } })) },
  { weight: 2, arbitrary: fc.constant((now: number): HauntAction => ({ type: 'sabotage', now })) },
  { weight: 1, arbitrary: fc.constant((): HauntAction => ({ type: 'reset', criteria })) },
  { weight: 1, arbitrary: fc.constantFrom('1.1', null).map((id) => (): HauntAction => ({ type: 'running', id })) },
);

function run(steps: { a: (now: number) => HauntAction; dt: number }[]): HauntState[] {
  let s = initialHaunt(criteria);
  let now = 1_000_000;
  const states = [s];
  for (const { a, dt } of steps) {
    now += dt;
    s = hauntReducer(s, a(now));
    states.push(s);
  }
  return states;
}

const steps = fc.array(fc.record({ a: action, dt: fc.integer({ min: 0, max: 60_000 }) }), { maxLength: 60 });

describe('hauntReducer', () => {
  it('a criterion is failing exactly when it has one open haunting', () => {
    fc.assert(
      fc.property(steps, (seq) => {
        for (const s of run(seq)) {
          for (const c of criteria) {
            const open = s.hauntings.filter((h) => h.criterionId === c.id && h.resolvedAt === undefined);
            expect(open.length).toBeLessThanOrEqual(1);
            expect(s.status[c.id]?.state === 'fail').toBe(open.length === 1);
          }
        }
      }),
    );
  });

  it('invalid criteria never pass, fail or haunt', () => {
    fc.assert(
      fc.property(steps, (seq) => {
        for (const s of run(seq)) {
          expect(s.status['9.9']?.state).toBe('invalid');
          expect(s.hauntings.some((h) => h.criterionId === '9.9')).toBe(false);
        }
      }),
    );
  });

  it('resolved hauntings stay resolved, and are never resolved before they were seen', () => {
    fc.assert(
      fc.property(steps, (seq) => {
        const states = run(seq);
        for (let i = 1; i < states.length; i++) {
          const before = states[i - 1] as HauntState;
          const after = states[i] as HauntState;
          for (const h of before.hauntings) {
            if (h.resolvedAt === undefined) continue;
            expect(after.hauntings.find((x) => x.key === h.key)?.resolvedAt).toBe(h.resolvedAt);
          }
          for (const h of after.hauntings) if (h.resolvedAt !== undefined) expect(h.resolvedAt).toBeGreaterThanOrEqual(h.firstSeen);
        }
      }),
    );
  });

  it('detection time is only credited within the window after a sabotage', () => {
    fc.assert(
      fc.property(steps, (seq) => {
        const last = run(seq).at(-1) as HauntState;
        for (const h of last.hauntings) {
          if (h.detectedAfterS !== undefined) {
            expect(h.detectedAfterS).toBeGreaterThanOrEqual(0);
            expect(h.detectedAfterS * 1000).toBeLessThanOrEqual(DETECT_WINDOW_MS);
          }
        }
      }),
    );
  });

  it('a passing monitor that keeps passing does not create new state (no needless re-renders)', () => {
    const c = criteria[1] as Criterion;
    const s1 = hauntReducer(initialHaunt(criteria), { type: 'result', criterion: c, requirement: 'R', kind: 'monitor', ok: true, now: 1 });
    expect(hauntReducer(s1, { type: 'result', criterion: c, requirement: 'R', kind: 'monitor', ok: true, now: 2 })).toBe(s1);
  });

  it('times the catch from the sabotage', () => {
    const c = criteria[0] as Criterion;
    let s = initialHaunt(criteria);
    s = hauntReducer(s, { type: 'sabotage', now: 10_000 });
    s = hauntReducer(s, { type: 'result', criterion: c, requirement: 'Cart', kind: 'probe', ok: false, now: 14_200, failure: { stepIndex: 3, check: 'c', expected: '1', actual: '2' } });
    expect(s.hauntings[0]?.detectedAfterS).toBeCloseTo(4.2);
  });
});
