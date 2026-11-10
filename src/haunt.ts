/** Pure bookkeeping for which criteria hold and which are haunted. */

import type { Failure, Haunting } from './issue';
import type { Criterion } from './spec';

export type CriterionState = 'idle' | 'pass' | 'fail' | 'invalid';

export interface CriterionStatus {
  state: CriterionState;
  failure?: Failure;
  at?: number;
  ms?: number;
  passes: number;
  fails: number;
}

export interface HauntState {
  status: Record<string, CriterionStatus>;
  hauntings: Haunting[];
  running: string | null;
  sabotageAt: number | null;
}

export type HauntAction =
  | { type: 'reset'; criteria: readonly Criterion[] }
  | { type: 'running'; id: string | null }
  | { type: 'sabotage'; now: number }
  | {
      type: 'result';
      criterion: Criterion;
      requirement: string;
      kind: 'probe' | 'monitor';
      ok: boolean;
      failure?: Failure;
      now: number;
      ms?: number;
    };

/** Detection times are only credited to a sabotage made within this window. */
export const DETECT_WINDOW_MS = 120_000;

export function initialHaunt(criteria: readonly Criterion[]): HauntState {
  return hauntReducer({ status: {}, hauntings: [], running: null, sabotageAt: null }, { type: 'reset', criteria });
}

export function hauntReducer(state: HauntState, action: HauntAction): HauntState {
  switch (action.type) {
    case 'reset': {
      const status: Record<string, CriterionStatus> = {};
      for (const c of action.criteria) status[c.id] = { state: c.error ? 'invalid' : 'idle', passes: 0, fails: 0 };
      // Keep the history; drop open hauntings, since the checks they came from may have changed.
      return { ...state, status, running: null, hauntings: state.hauntings.filter((h) => h.resolvedAt !== undefined) };
    }
    case 'running':
      return state.running === action.id ? state : { ...state, running: action.id };
    case 'sabotage':
      return { ...state, sabotageAt: action.now };
    case 'result': {
      const { criterion: c, now } = action;
      const prev = state.status[c.id];
      if (!prev || prev.state === 'invalid') return state;
      const open = state.hauntings.findIndex((h) => h.criterionId === c.id && h.resolvedAt === undefined);
      if (action.ok) {
        if (prev.state === 'pass' && open < 0 && action.kind === 'monitor') return state;
        const hauntings = open < 0 ? state.hauntings : state.hauntings.map((h, i) => (i === open ? { ...h, resolvedAt: now } : h));
        return { ...state, hauntings, status: { ...state.status, [c.id]: { ...prev, state: 'pass', failure: undefined, at: now, ms: action.ms, passes: prev.passes + 1 } } };
      }
      const failure = action.failure ?? { stepIndex: -1, check: 'unknown', expected: 'pass', actual: 'fail' };
      const status = { ...state.status, [c.id]: { ...prev, state: 'fail' as const, failure, at: now, ms: action.ms, fails: prev.fails + 1 } };
      if (open >= 0) {
        return { ...state, status, hauntings: state.hauntings.map((h, i) => (i === open ? { ...h, failure } : h)) };
      }
      const since = state.sabotageAt;
      const haunting: Haunting = {
        key: `${c.id}@${now}`,
        criterionId: c.id,
        requirement: action.requirement,
        text: c.text,
        kind: action.kind,
        failure,
        firstSeen: now,
        detectedAfterS: since !== null && now >= since && now - since <= DETECT_WINDOW_MS ? (now - since) / 1000 : undefined,
      };
      return { ...state, status, hauntings: [haunting, ...state.hauntings] };
    }
  }
}

export function summary(state: HauntState): { holding: number; haunted: number; unchecked: number; invalid: number } {
  const all = Object.values(state.status);
  return {
    holding: all.filter((s) => s.state === 'pass').length,
    haunted: all.filter((s) => s.state === 'fail').length,
    unchecked: all.filter((s) => s.state === 'idle').length,
    invalid: all.filter((s) => s.state === 'invalid').length,
  };
}
