/** Executes probes and monitors against the live app in a same-origin iframe. */

import type { Failure } from './issue';
import { compare, evalExpr, formatExprTop, formatMonitor, formatStep, numberIn, type Monitor, type Step } from './spec';

export interface Driver {
  /** Reload the app fresh and wait until it says it's ready. */
  visit(): Promise<void>;
  doc(): Document | null;
  /** Move the ghost cursor to an element (and scroll it into view). */
  point(el: Element): Promise<void>;
  /** Pause between steps so people can follow along. */
  pace(): Promise<void>;
}

export type ProbeResult = { ok: true; ms: number } | { ok: false; failure: Failure; ms: number };
export type MonitorResult = { ok: true } | { ok: false; failure: Failure } | { ok: null };

export interface ErrorRecord {
  at: number;
  message: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const show = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function find(doc: Document, sel: string): Element | null {
  try {
    return doc.querySelector(sel);
  } catch {
    throw new Error(`"${sel}" is not a valid CSS selector`);
  }
}

function findAll(doc: Document, sel: string): Element[] {
  try {
    return Array.from(doc.querySelectorAll(sel));
  } catch {
    throw new Error(`"${sel}" is not a valid CSS selector`);
  }
}

export function isVisible(el: Element | null): boolean {
  if (!el || !el.isConnected) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return el.getClientRects().length > 0 && style?.visibility !== 'hidden' && style?.display !== 'none';
}

/** Set an input's value so React (or any framework) sees it, then fire input and change. */
function typeInto(el: Element, text: string): void {
  const win = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  if (!win) return;
  const proto = el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, text);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}

/** Let the app re-render after an action. */
const settle = () => sleep(60);

export async function runProbe(steps: readonly Step[], driver: Driver, signal: AbortSignal): Promise<ProbeResult> {
  const vars: Record<string, number> = {};
  const t0 = performance.now();
  for (let i = 0; i < steps.length; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const step = steps[i] as Step;
    const fail = (expected: string, actual: string): ProbeResult => ({
      ok: false,
      ms: performance.now() - t0,
      failure: { stepIndex: i, check: formatStep(step), expected, actual },
    });
    try {
      if (step.k === 'visit') {
        await driver.visit();
        continue;
      }
      if (step.k === 'wait') {
        await sleep(step.ms);
        continue;
      }
      const doc = driver.doc();
      if (!doc) return fail('the app to be loaded', 'no page (add a visit step first)');

      switch (step.k) {
        case 'click': {
          const el = find(doc, step.sel);
          if (!el) return fail(`an element matching ${step.sel}`, 'nothing on the page');
          await driver.point(el);
          (el as HTMLElement).click();
          await settle();
          break;
        }
        case 'type': {
          const el = find(doc, step.sel);
          if (!el) return fail(`an input matching ${step.sel}`, 'nothing on the page');
          await driver.point(el);
          typeInto(el, step.text);
          await settle();
          break;
        }
        case 'remember': {
          const el = find(doc, step.sel);
          const n = el ? numberIn(el.textContent ?? '') : null;
          if (n === null) return fail(`a number in ${step.sel}`, el ? `"${el.textContent?.trim()}"` : 'nothing on the page');
          vars[step.name] = n;
          break;
        }
        case 'expect-number': {
          const el = find(doc, step.sel);
          if (el) await driver.point(el);
          const actual = el ? numberIn(el.textContent ?? '') : null;
          const expected = evalExpr(step.expr, vars);
          if (actual === null) return fail(`${step.op} ${show(expected)}`, el ? `"${el.textContent?.trim()}"` : 'nothing on the page');
          if (!compare(step.op, actual, expected)) return fail(`${step.op} ${show(expected)} (${formatExprTop(step.expr)})`, show(actual));
          break;
        }
        case 'expect-text': {
          const el = find(doc, step.sel);
          if (el) await driver.point(el);
          const actual = el?.textContent?.trim() ?? null;
          const ok = actual !== null && (step.mode === 'contains' ? actual.includes(step.text) : actual === step.text);
          if (!ok) return fail(`${step.mode === 'contains' ? 'text containing' : 'exactly'} "${step.text}"`, actual === null ? 'nothing on the page' : `"${actual}"`);
          break;
        }
        case 'expect-visible': {
          const start = performance.now();
          let el = find(doc, step.sel);
          while (!isVisible(el) && performance.now() - start < step.within) {
            await sleep(40);
            el = find(driver.doc() ?? doc, step.sel);
          }
          if (!isVisible(el)) return fail(`${step.sel} visible within ${step.within} ms`, `not visible after ${Math.round(performance.now() - start)} ms`);
          await driver.point(el as Element);
          break;
        }
        case 'expect-hidden': {
          await sleep(step.after);
          const el = find(driver.doc() ?? doc, step.sel);
          if (isVisible(el)) {
            await driver.point(el as Element);
            return fail(`${step.sel} not shown`, `shown: "${el?.textContent?.trim().slice(0, 80)}"`);
          }
          break;
        }
      }
      await driver.pace();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      return fail('the step to run', err instanceof Error ? err.message : String(err));
    }
  }
  return { ok: true, ms: performance.now() - t0 };
}

export function checkMonitor(m: Monitor, doc: Document | null, errors: readonly ErrorRecord[], now: number): MonitorResult {
  const check = formatMonitor(m);
  if (m.k === 'no-errors') {
    const recent = errors.filter((e) => now - e.at <= m.windowS * 1000);
    if (recent.length === 0) return { ok: true };
    const last = recent[recent.length - 1] as ErrorRecord;
    return { ok: false, failure: { stepIndex: -1, check, expected: `no uncaught errors in the last ${m.windowS} s`, actual: `${recent.length} × ${last.message}` } };
  }
  if (!doc) return { ok: null };
  try {
    const target = find(doc, m.sel);
    const value = target ? numberIn(target.textContent ?? '') : null;
    if (value === null) return { ok: null };
    let sum = 0;
    for (const el of findAll(doc, m.of)) sum += numberIn(el.textContent ?? '') ?? 0;
    sum = Math.round(sum * 100) / 100;
    if (compare(m.op, value, sum)) return { ok: true };
    return { ok: false, failure: { stepIndex: -1, check, expected: `${m.op} ${show(sum)} (sum of ${findAll(doc, m.of).length} × ${m.of})`, actual: show(value) } };
  } catch (err) {
    return { ok: false, failure: { stepIndex: -1, check, expected: 'a valid monitor', actual: err instanceof Error ? err.message : String(err) } };
  }
}
