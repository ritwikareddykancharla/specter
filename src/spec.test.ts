import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEC } from './defaultSpec';
import { issueBody, issueTitle, issueUrl, kiroTask, type Haunting } from './issue';
import {
  allCriteria,
  compare,
  evalExpr,
  formatExpr,
  formatExprTop,
  formatMonitor,
  formatProbe,
  numberIn,
  OPS,
  parseExpr,
  parseMonitor,
  parseProbe,
  parseSpec,
  splitSteps,
  type Expr,
  type Monitor,
  type Step,
} from './spec';

const name = fc.constantFrom('before', 'sub', 't', 'total', 'x_1', 'count');
const literal = fc.oneof(fc.nat(10000), fc.integer({ min: 0, max: 99999 }).map((n) => n / 100));

const expr: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => ({
  e: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    literal.map((v): Expr => ({ k: 'num', v })),
    name.map((n): Expr => ({ k: 'var', name: n })),
    tie('e').map((a): Expr => ({ k: 'neg', a })),
    fc.record({ fn: fc.constantFrom('round' as const, 'round2' as const), a: tie('e') }).map((r): Expr => ({ k: 'call', ...r })),
    fc.record({ op: fc.constantFrom('+' as const, '-' as const, '*' as const, '/' as const), a: tie('e'), b: tie('e') }).map((r): Expr => ({ k: 'bin', ...r })),
  ),
})).e;

const sel = fc.constantFrom('#cart-count', '#cart-total', '[data-add=toad]', '.result', '.line-price', '#email', 'li:nth-child(2)', '[data-x="a b"]');
const text = fc.string({ maxLength: 20 });
const op = fc.constantFrom(...OPS);

const step: fc.Arbitrary<Step> = fc.oneof(
  fc.constant<Step>({ k: 'visit' }),
  sel.map((s): Step => ({ k: 'click', sel: s })),
  fc.record({ sel, text }).map((r): Step => ({ k: 'type', ...r })),
  fc.record({ sel, name }).map((r): Step => ({ k: 'remember', ...r })),
  fc.record({ sel, op, expr }).map((r): Step => ({ k: 'expect-number', ...r })),
  fc.record({ sel, mode: fc.constantFrom('contains' as const, 'equals' as const), text }).map((r): Step => ({ k: 'expect-text', ...r })),
  fc.record({ sel, within: fc.nat(5000) }).map((r): Step => ({ k: 'expect-visible', ...r })),
  fc.record({ sel, after: fc.nat(5000) }).map((r): Step => ({ k: 'expect-hidden', ...r })),
  fc.nat(5000).map((ms): Step => ({ k: 'wait', ms })),
);

const monitor: fc.Arbitrary<Monitor> = fc.oneof(
  fc.integer({ min: 1, max: 600 }).map((windowS): Monitor => ({ k: 'no-errors', windowS })),
  fc.record({ sel, op, of: sel }).map((r): Monitor => ({ k: 'sum', ...r })),
);

const vars = fc.record({ before: literal, sub: literal, t: literal, total: literal, x_1: literal, count: literal });

describe('expressions', () => {
  it('parseExpr(formatExpr(e)) rebuilds the same tree', () => {
    fc.assert(fc.property(expr, (e) => {
      expect(parseExpr(formatExpr(e))).toEqual(e);
    }));
  });

  it('respects precedence and associativity like JavaScript', () => {
    expect(evalExpr(parseExpr('1 + 2 * 3'), {})).toBe(7);
    expect(evalExpr(parseExpr('10 - 4 - 3'), {})).toBe(3);
    expect(evalExpr(parseExpr('round2(sub * 0.9)'), { sub: 7.25 })).toBe(6.53);
    expect(evalExpr(parseExpr('-(2 + 3) * 2'), {})).toBe(-10);
  });

  it('evaluates to the same number as the equivalent JavaScript', () => {
    const toJs = (e: Expr): string =>
      e.k === 'num' ? String(e.v) : e.k === 'var' ? `v.${e.name}` : e.k === 'neg' ? `(-${toJs(e.a)})` : e.k === 'call' ? `${e.fn}(${toJs(e.a)})` : `(${toJs(e.a)} ${e.op} ${toJs(e.b)})`;
    const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
    fc.assert(
      fc.property(expr, vars, (e, v) => {
        const js = new Function('v', 'round', 'round2', `return ${toJs(e)};`)(v, Math.round, round2) as number;
        expect(Object.is(evalExpr(e, v), js) || evalExpr(e, v) === js).toBe(true);
      }),
    );
  });

  it('reports a variable that was never remembered', () => {
    expect(() => evalExpr(parseExpr('ghost + 1'), {})).toThrow(/never remembered/);
  });
});

describe('probes and monitors', () => {
  it('parseProbe(formatProbe(steps)) round-trips any probe, including quotes and semicolons in typed text', () => {
    fc.assert(fc.property(fc.array(step, { minLength: 1, maxLength: 8 }), (steps) => {
      expect(parseProbe(formatProbe(steps))).toEqual(steps);
    }));
  });

  it('parseMonitor(formatMonitor(m)) round-trips any monitor', () => {
    fc.assert(fc.property(monitor, (m) => {
      expect(parseMonitor(formatMonitor(m))).toEqual(m);
    }));
  });

  it('splits only on semicolons outside quotes', () => {
    expect(splitSteps('type #q "a;b"; click #go')).toEqual(['type #q "a;b"', 'click #go']);
    expect(() => splitSteps('type #q "oops')).toThrow();
  });
});

describe('numbers and comparisons', () => {
  it('numberIn reads the number a UI shows', () => {
    expect(numberIn('$1,204.50')).toBe(1204.5);
    expect(numberIn('Cart (3)')).toBe(3);
    expect(numberIn('Total: -2.25')).toBe(-2.25);
    expect(numberIn('empty')).toBeNull();
  });

  it('numberIn recovers any amount formatted as money', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (cents) => {
        const v = cents / 100;
        const shown = `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        expect(numberIn(shown)).toBeCloseTo(v, 2);
      }),
    );
  });

  it('== tolerates rounding to the cent, and != is its exact opposite', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.double({ min: -1e6, max: 1e6, noNaN: true }), (a, b) => {
        expect(compare('==', a, b)).toBe(!compare('!=', a, b));
        expect(compare('==', a, a + 0.004)).toBe(true);
      }),
    );
  });
});

describe('spec documents', () => {
  it('the built-in spec parses with an executable check on every criterion', () => {
    const spec = parseSpec(DEFAULT_SPEC);
    const criteria = allCriteria(spec);
    expect(spec.requirements.length).toBeGreaterThanOrEqual(4);
    for (const c of criteria) {
      expect(c.error).toBeUndefined();
      expect(Boolean(c.probe) !== Boolean(c.monitor)).toBe(true);
    }
  });

  it('keeps a bad probe line as an error on its criterion instead of failing the whole spec', () => {
    const spec = parseSpec('# S\n## Requirement 1: X\n1.1 WHEN a THEN b SHALL c.\n    probe: summon the ghost\n1.2 The app SHALL d.\n    monitor: no errors');
    const [a, b] = allCriteria(spec);
    expect(a?.error).toMatch(/doesn't understand/);
    expect(b?.monitor).toEqual({ k: 'no-errors', windowS: 20 });
  });
});

describe('issues', () => {
  const spec = parseSpec(DEFAULT_SPEC);
  const c = allCriteria(spec)[0];
  const h: Haunting = {
    key: 'k',
    criterionId: c?.id ?? '1.1',
    requirement: 'Cart',
    text: c?.text ?? '',
    kind: 'probe',
    failure: { stepIndex: 3, check: 'expect number #cart-count == (before + 1)', expected: '1', actual: '2' },
    firstSeen: Date.UTC(2026, 10, 9),
    detectedAfterS: 4.2,
  };

  it('issue links survive the round trip through the URL', () => {
    const url = new URL(issueUrl('owner/repo', issueTitle(h), issueBody(h, c, 'https://example.com')));
    expect(url.pathname).toBe('/owner/repo/issues/new');
    expect(url.searchParams.get('title')).toBe(issueTitle(h));
    expect(url.searchParams.get('body')).toContain('**Expected:** 1');
    expect(url.searchParams.get('body')).toContain('4.2 s after');
  });

  it('readable top-level expressions still round-trip', () => {
    fc.assert(
      fc.property(expr, (e) => {
        expect(parseExpr(formatExprTop(e))).toEqual(e);
      }),
    );
    expect(formatExprTop(parseExpr('before + 1'))).toBe('before + 1');
  });

  it('the Kiro task points back at the requirement', () => {
    expect(kiroTask(h, c)).toMatch(/^- \[ \] Fix spec violation 1\.1/);
    expect(kiroTask(h, c)).toContain('_Requirements: 1.1_');
  });
});
