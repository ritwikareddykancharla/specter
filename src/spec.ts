/**
 * Specter's spec language.
 *
 * A spec is ordinary EARS-style requirements markdown. Any acceptance
 * criterion can carry one indented line that makes it executable:
 *
 *   1.1 WHEN the shopper adds a potion THEN the cart count SHALL increase by 1.
 *       probe: visit; remember number #cart-count as before; click [data-add=toad]; expect number #cart-count == before + 1
 *   1.2 The subtotal SHALL always equal the sum of its line prices.
 *       monitor: number #cart-subtotal == sum .line-price
 *
 * Probes are scripted visits that Specter replays against the live app.
 * Monitors are invariants checked continuously while real people use it.
 */

export type Op = '==' | '!=' | '<' | '<=' | '>' | '>=';
export const OPS: readonly Op[] = ['==', '!=', '<=', '>=', '<', '>'];

export type Fn = 'round' | 'round2';
export type Expr =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Expr }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: Expr; b: Expr }
  | { k: 'call'; fn: Fn; a: Expr };

export type Step =
  | { k: 'visit' }
  | { k: 'click'; sel: string }
  | { k: 'type'; sel: string; text: string }
  | { k: 'remember'; sel: string; name: string }
  | { k: 'expect-number'; sel: string; op: Op; expr: Expr }
  | { k: 'expect-text'; sel: string; mode: 'contains' | 'equals'; text: string }
  | { k: 'expect-visible'; sel: string; within: number }
  | { k: 'expect-hidden'; sel: string; after: number }
  | { k: 'wait'; ms: number };

export type Monitor = { k: 'sum'; sel: string; op: Op; of: string } | { k: 'no-errors'; windowS: number };

export interface Criterion {
  id: string;
  text: string;
  probe?: Step[];
  monitor?: Monitor;
  /** Why the probe or monitor line could not be read. */
  error?: string;
}

export interface Requirement {
  n: string;
  title: string;
  criteria: Criterion[];
}

export interface Spec {
  title: string;
  requirements: Requirement[];
}

export class SpecError extends Error {}

export const DEFAULT_VISIBLE_MS = 1500;
export const DEFAULT_HIDDEN_MS = 300;
export const DEFAULT_ERROR_WINDOW_S = 20;
const EPSILON = 0.005;

/* ------------------------------------------------------------------ */
/* Expressions                                                         */
/* ------------------------------------------------------------------ */

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    if ('+-*/()'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new SpecError(`Unexpected "${c}" in expression "${src}"`);
  }
  return out;
}

export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek()?.v === v;
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new SpecError(`Expected "${v}" in expression "${src}"`);
    p++;
  };

  const factor = (): Expr => {
    const tok = peek();
    if (!tok) throw new SpecError(`Expression "${src}" ends too early`);
    if (tok.t === 'op' && tok.v === '-') {
      p++;
      return { k: 'neg', a: factor() };
    }
    if (tok.t === 'op' && tok.v === '(') {
      p++;
      const e = sum();
      expectOp(')');
      return e;
    }
    if (tok.t === 'num') {
      p++;
      return { k: 'num', v: tok.v };
    }
    if (tok.t === 'id') {
      p++;
      if (isOp('(')) {
        if (tok.v !== 'round' && tok.v !== 'round2') throw new SpecError(`Unknown function "${tok.v}"`);
        p++;
        const a = sum();
        expectOp(')');
        return { k: 'call', fn: tok.v, a };
      }
      return { k: 'var', name: tok.v };
    }
    throw new SpecError(`Unexpected "${tok.v}" in expression "${src}"`);
  };
  const product = (): Expr => {
    let e = factor();
    while (isOp('*') || isOp('/')) {
      const op = (toks[p++] as Token).v as '*' | '/';
      e = { k: 'bin', op, a: e, b: factor() };
    }
    return e;
  };
  const sum = (): Expr => {
    let e = product();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as Token).v as '+' | '-';
      e = { k: 'bin', op, a: e, b: product() };
    }
    return e;
  };

  const e = sum();
  if (p !== toks.length) throw new SpecError(`Unexpected "${(toks[p] as Token).v}" in expression "${src}"`);
  return e;
}

/** Like formatExpr but without the outermost parentheses, for people to read: "before + 1". Still round-trips. */
export function formatExprTop(e: Expr): string {
  const s = formatExpr(e);
  return e.k === 'bin' || e.k === 'neg' ? s.slice(1, -1) : s;
}

/** Canonical text form. Fully parenthesized, so parseExpr(formatExpr(e)) rebuilds the same tree. */
export function formatExpr(e: Expr): string {
  switch (e.k) {
    case 'num':
      return String(e.v);
    case 'var':
      return e.name;
    case 'neg':
      return `(-${formatExpr(e.a)})`;
    case 'call':
      return `${e.fn}(${formatExpr(e.a)})`;
    case 'bin':
      return `(${formatExpr(e.a)} ${e.op} ${formatExpr(e.b)})`;
  }
}

export function evalExpr(e: Expr, vars: Readonly<Record<string, number>>): number {
  switch (e.k) {
    case 'num':
      return e.v;
    case 'var': {
      const v = vars[e.name];
      if (v === undefined) throw new SpecError(`"${e.name}" was never remembered`);
      return v;
    }
    case 'neg':
      return -evalExpr(e.a, vars);
    case 'call': {
      const v = evalExpr(e.a, vars);
      return e.fn === 'round' ? Math.round(v) : Math.round((v + Number.EPSILON) * 100) / 100;
    }
    case 'bin': {
      const a = evalExpr(e.a, vars);
      const b = evalExpr(e.b, vars);
      return e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '*' ? a * b : a / b;
    }
  }
}

export function compare(op: Op, a: number, b: number): boolean {
  switch (op) {
    case '==':
      return Math.abs(a - b) <= EPSILON;
    case '!=':
      return Math.abs(a - b) > EPSILON;
    case '<':
      return a < b;
    case '<=':
      return a <= b + EPSILON;
    case '>':
      return a > b;
    case '>=':
      return a >= b - EPSILON;
  }
}

/** First number in a piece of UI text: "$1,204.50" -> 1204.5, "Cart (3)" -> 3. */
export function numberIn(text: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(text.replace(/(\d),(?=\d{3})/g, '$1'));
  return m ? Number(m[0]) : null;
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

/** Split on ";" outside double quotes. */
export function splitSteps(src: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (quoted && c === '\\' && i + 1 < src.length) {
      cur += c + (src[++i] as string);
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (c === ';' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (quoted) throw new SpecError('A quoted text is never closed');
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
function unquote(s: string): string {
  if (!/^"(?:[^"\\]|\\.)*"$/s.test(s)) throw new SpecError(`Expected quoted text, got ${s}`);
  return s.slice(1, -1).replace(/\\(.)/gs, (_, c: string) => (c === 'n' ? '\n' : c));
}

const SEL = '([^\\s;"]+|\\S*"[^"]*"\\S*)';
const ms = (s: string) => Number(s);

export function parseStep(src: string): Step {
  const s = src.trim();
  let m: RegExpExecArray | null;
  if (s === 'visit') return { k: 'visit' };
  if ((m = new RegExp(`^click\\s+${SEL}$`).exec(s))) return { k: 'click', sel: m[1] as string };
  if ((m = new RegExp(`^type\\s+${SEL}\\s+("(?:[^"\\\\]|\\\\.)*")$`, 's').exec(s))) return { k: 'type', sel: m[1] as string, text: unquote(m[2] as string) };
  if ((m = new RegExp(`^remember\\s+number\\s+${SEL}\\s+as\\s+([A-Za-z_][A-Za-z0-9_]*)$`).exec(s))) return { k: 'remember', sel: m[1] as string, name: m[2] as string };
  if ((m = new RegExp(`^expect\\s+number\\s+${SEL}\\s+(==|!=|<=|>=|<|>)\\s+(.+)$`).exec(s)))
    return { k: 'expect-number', sel: m[1] as string, op: m[2] as Op, expr: parseExpr(m[3] as string) };
  if ((m = new RegExp(`^expect\\s+text\\s+${SEL}\\s+(contains|==)\\s+("(?:[^"\\\\]|\\\\.)*")$`, 's').exec(s)))
    return { k: 'expect-text', sel: m[1] as string, mode: m[2] === 'contains' ? 'contains' : 'equals', text: unquote(m[3] as string) };
  if ((m = new RegExp(`^expect\\s+visible\\s+${SEL}(?:\\s+within\\s+(\\d+)ms)?$`).exec(s))) return { k: 'expect-visible', sel: m[1] as string, within: m[2] ? ms(m[2]) : DEFAULT_VISIBLE_MS };
  if ((m = new RegExp(`^expect\\s+hidden\\s+${SEL}(?:\\s+after\\s+(\\d+)ms)?$`).exec(s))) return { k: 'expect-hidden', sel: m[1] as string, after: m[2] ? ms(m[2]) : DEFAULT_HIDDEN_MS };
  if ((m = /^wait\s+(\d+)ms$/.exec(s))) return { k: 'wait', ms: ms(m[1] as string) };
  throw new SpecError(`Specter doesn't understand "${s}"`);
}

export function formatStep(step: Step): string {
  switch (step.k) {
    case 'visit':
      return 'visit';
    case 'click':
      return `click ${step.sel}`;
    case 'type':
      return `type ${step.sel} ${quote(step.text)}`;
    case 'remember':
      return `remember number ${step.sel} as ${step.name}`;
    case 'expect-number':
      return `expect number ${step.sel} ${step.op} ${formatExprTop(step.expr)}`;
    case 'expect-text':
      return `expect text ${step.sel} ${step.mode === 'contains' ? 'contains' : '=='} ${quote(step.text)}`;
    case 'expect-visible':
      return `expect visible ${step.sel} within ${step.within}ms`;
    case 'expect-hidden':
      return `expect hidden ${step.sel} after ${step.after}ms`;
    case 'wait':
      return `wait ${step.ms}ms`;
  }
}

export const parseProbe = (src: string): Step[] => splitSteps(src).map(parseStep);
export const formatProbe = (steps: readonly Step[]): string => steps.map(formatStep).join('; ');

export function parseMonitor(src: string): Monitor {
  const s = src.trim();
  let m: RegExpExecArray | null;
  if ((m = /^no\s+errors(?:\s+in\s+(\d+)s)?$/.exec(s))) return { k: 'no-errors', windowS: m[1] ? Number(m[1]) : DEFAULT_ERROR_WINDOW_S };
  if ((m = new RegExp(`^number\\s+${SEL}\\s+(==|!=|<=|>=|<|>)\\s+sum\\s+${SEL}$`).exec(s))) return { k: 'sum', sel: m[1] as string, op: m[2] as Op, of: m[3] as string };
  throw new SpecError(`Specter doesn't understand the monitor "${s}"`);
}

export function formatMonitor(m: Monitor): string {
  return m.k === 'no-errors' ? `no errors in ${m.windowS}s` : `number ${m.sel} ${m.op} sum ${m.of}`;
}

/* ------------------------------------------------------------------ */
/* Spec documents                                                      */
/* ------------------------------------------------------------------ */

export function parseSpec(md: string): Spec {
  const spec: Spec = { title: 'Untitled spec', requirements: [] };
  let req: Requirement | null = null;
  let last: Criterion | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    let m: RegExpExecArray | null;
    if ((m = /^#\s+(.+)$/.exec(line))) {
      spec.title = (m[1] as string).trim();
    } else if ((m = /^##\s+Requirement\s+(\d+)\s*[:.-]\s*(.+)$/i.exec(line))) {
      req = { n: m[1] as string, title: (m[2] as string).trim(), criteria: [] };
      spec.requirements.push(req);
      last = null;
    } else if ((m = /^\s*(?:[-*]\s+)?(\d+\.\d+)\.?\s+(.+)$/.exec(line)) && req) {
      last = { id: m[1] as string, text: (m[2] as string).trim() };
      req.criteria.push(last);
    } else if ((m = /^\s+(probe|monitor)\s*:\s*(.+)$/i.exec(line)) && last) {
      try {
        if ((m[1] as string).toLowerCase() === 'probe') last.probe = parseProbe(m[2] as string);
        else last.monitor = parseMonitor(m[2] as string);
      } catch (err) {
        last.error = err instanceof Error ? err.message : String(err);
      }
    }
  }
  return spec;
}

export function allCriteria(spec: Spec): Criterion[] {
  return spec.requirements.flatMap((r) => r.criteria);
}

/** Plain-English description of a step, for issue reproduction steps. */
export function describeStep(step: Step): string {
  switch (step.k) {
    case 'visit':
      return 'Open the app fresh';
    case 'click':
      return `Click \`${step.sel}\``;
    case 'type':
      return `Type ${quote(step.text)} into \`${step.sel}\``;
    case 'remember':
      return `Note the number shown in \`${step.sel}\` (call it \`${step.name}\`)`;
    case 'expect-number':
      return `Check that \`${step.sel}\` ${step.op} ${formatExprTop(step.expr)}`;
    case 'expect-text':
      return `Check that \`${step.sel}\` ${step.mode === 'contains' ? 'contains' : 'reads'} ${quote(step.text)}`;
    case 'expect-visible':
      return `Check that \`${step.sel}\` appears within ${step.within} ms`;
    case 'expect-hidden':
      return `Check that \`${step.sel}\` is not shown after ${step.after} ms`;
    case 'wait':
      return `Wait ${step.ms} ms`;
  }
}
