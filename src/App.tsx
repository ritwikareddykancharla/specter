import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DEFAULT_SPEC } from './defaultSpec';
import { hauntReducer, initialHaunt, summary, type CriterionStatus } from './haunt';
import { issueBody, issueTitle, issueUrl, kiroTask, type Haunting } from './issue';
import { checkMonitor, runProbe, type Driver, type ErrorRecord } from './runner';
import { allCriteria, parseSpec, type Criterion, type Spec } from './spec';
import { activeBugs, BUGS, setBugs } from './target/bugs';

const SPEC_KEY = 'specter.spec';
const REPO_KEY = 'specter.repo';
const TARGET_URL = 'target/index.html';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadSpec(): string {
  return localStorage.getItem(SPEC_KEY) ?? DEFAULT_SPEC;
}

function requirementOf(spec: Spec, id: string): string {
  return spec.requirements.find((r) => r.criteria.some((c) => c.id === id))?.title ?? '';
}

export function App() {
  const [source, setSource] = useState(loadSpec);
  const [draft, setDraft] = useState(source);
  const [editing, setEditing] = useState(false);
  const spec = useMemo(() => parseSpec(source), [source]);
  const criteria = useMemo(() => allCriteria(spec), [spec]);
  const [state, dispatch] = useReducer(hauntReducer, criteria, initialHaunt);
  const [haunting, setHaunting] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const [bugs, setBugState] = useState<Set<string>>(activeBugs);
  const [repo, setRepo] = useState(() => localStorage.getItem(REPO_KEY) ?? 'ritwikareddykancharla/specter');
  const [cursor, setCursor] = useState<{ x: number; y: number; on: boolean; click: number }>({ x: 40, y: 40, on: false, click: 0 });
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const frame = useRef<HTMLIFrameElement>(null);
  const errors = useRef<ErrorRecord[]>([]);
  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const loadWaiters = useRef<(() => void)[]>([]);
  const monitorTimer = useRef(0);
  const criteriaRef = useRef(criteria);
  criteriaRef.current = criteria;
  const specRef = useRef(spec);
  specRef.current = spec;

  useEffect(() => {
    dispatch({ type: 'reset', criteria });
  }, [criteria]);

  const doc = useCallback(() => {
    try {
      const d = frame.current?.contentDocument;
      return d && d.documentElement.dataset.ready === '1' ? d : null;
    } catch {
      return null;
    }
  }, []);

  const runMonitors = useCallback(() => {
    const d = doc();
    const now = Date.now();
    for (const c of criteriaRef.current) {
      if (!c.monitor || c.error) continue;
      const r = checkMonitor(c.monitor, d, errors.current, now);
      if (r.ok === null) continue;
      dispatch({ type: 'result', criterion: c, requirement: requirementOf(specRef.current, c.id), kind: 'monitor', ok: r.ok, failure: r.ok ? undefined : r.failure, now });
    }
  }, [doc]);

  const scheduleMonitors = useCallback(() => {
    window.clearTimeout(monitorTimer.current);
    monitorTimer.current = window.setTimeout(runMonitors, 120);
  }, [runMonitors]);

  // Every page load inside the frame: listen for crashes and DOM changes.
  const onFrameLoad = useCallback(() => {
    const win = frame.current?.contentWindow;
    if (win) {
      win.addEventListener('error', (e) => {
        errors.current.push({ at: Date.now(), message: e.message || 'Script error' });
        scheduleMonitors();
      });
      win.addEventListener('unhandledrejection', (e) => {
        const reason = (e as PromiseRejectionEvent).reason as { message?: string } | undefined;
        errors.current.push({ at: Date.now(), message: `Unhandled rejection: ${reason?.message ?? String(reason)}` });
        scheduleMonitors();
      });
      const start = () => {
        if (!win.document.body) return;
        const Observer = (win as Window & typeof globalThis).MutationObserver;
        new Observer(scheduleMonitors).observe(win.document.body, { subtree: true, childList: true, characterData: true });
      };
      start();
    }
    const waiting = loadWaiters.current;
    loadWaiters.current = [];
    waiting.forEach((w) => w());
  }, [scheduleMonitors]);

  // Time-window monitors ("no errors in 20s") need a clock, not just DOM changes.
  useEffect(() => {
    const id = window.setInterval(runMonitors, 1000);
    return () => window.clearInterval(id);
  }, [runMonitors]);

  const driver = useMemo<Driver>(
    () => ({
      async visit() {
        const f = frame.current;
        if (!f) throw new Error('The app frame is missing');
        const loaded = new Promise<void>((resolve) => loadWaiters.current.push(resolve));
        f.src = `${TARGET_URL}?specter=${Date.now()}`;
        await Promise.race([loaded, sleep(8000)]);
        const t0 = performance.now();
        while (!doc() && performance.now() - t0 < 5000) await sleep(30);
        if (!doc()) throw new Error('The app did not finish loading within 5 s');
      },
      doc,
      async point(el) {
        // Scroll only inside the frame; scrollIntoView would also scroll the dashboard.
        const win = el.ownerDocument.defaultView;
        const before = el.getBoundingClientRect();
        if (win && (before.top < 40 || before.bottom > win.innerHeight - 40)) {
          win.scrollTo({ top: win.scrollY + before.top - win.innerHeight / 2 + before.height / 2 });
        }
        const r = el.getBoundingClientRect();
        setCursor((c) => ({ x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2, on: true, click: c.click + 1 }));
        await sleep(turboRef.current ? 20 : 380);
      },
      async pace() {
        await sleep(turboRef.current ? 20 : 260);
      },
    }),
    [doc],
  );

  // The haunting loop: replay every probe, forever, one at a time.
  useEffect(() => {
    if (!haunting) {
      setCursor((c) => ({ ...c, on: false }));
      return;
    }
    const ctrl = new AbortController();
    void (async () => {
      await sleep(300);
      while (!ctrl.signal.aborted) {
        const probes = criteriaRef.current.filter((c) => c.probe && !c.error);
        if (probes.length === 0) await sleep(1000);
        for (const c of probes) {
          if (ctrl.signal.aborted) return;
          dispatch({ type: 'running', id: c.id });
          try {
            const r = await runProbe(c.probe ?? [], driver, ctrl.signal);
            dispatch({ type: 'result', criterion: c, requirement: requirementOf(specRef.current, c.id), kind: 'probe', ok: r.ok, failure: r.ok ? undefined : r.failure, ms: r.ms, now: Date.now() });
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
          }
          dispatch({ type: 'running', id: null });
          await sleep(turboRef.current ? 50 : 500);
        }
      }
    })();
    return () => {
      ctrl.abort();
      dispatch({ type: 'running', id: null });
    };
  }, [haunting, criteria, driver]);

  function toggleBug(id: string, on: boolean) {
    const next = new Set(bugs);
    if (on) next.add(id);
    else next.delete(id);
    setBugs(next);
    setBugState(next);
    if (on) dispatch({ type: 'sabotage', now: Date.now() });
    // Re-render the live app so bugs in render code show up right away.
    frame.current?.contentWindow?.dispatchEvent(new Event('specter-sabotage'));
    scheduleMonitors();
  }

  function fixAll() {
    setBugs([]);
    setBugState(new Set());
    scheduleMonitors();
  }

  function applySpec() {
    localStorage.setItem(SPEC_KEY, draft);
    setSource(draft);
    setEditing(false);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied('Copy failed: select the text and copy it by hand');
    }
  }

  const sum = summary(state);
  const total = criteria.length;
  const appUrl = new URL(TARGET_URL, window.location.href).href;
  const open = state.hauntings.filter((h) => h.resolvedAt === undefined);
  const resolved = state.hauntings.filter((h) => h.resolvedAt !== undefined).slice(0, 6);

  return (
    <div className={`app${sum.haunted ? ' is-haunted' : ''}`}>
      <header className="bar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            👻
          </span>
          <div>
            <h1>Specter</h1>
            <p>Your spec haunts production.</p>
          </div>
        </div>
        <div className="score" role="status" aria-live="polite">
          <strong className={sum.haunted ? 'bad' : 'good'}>
            {sum.holding}/{total} holding
          </strong>
          {sum.haunted > 0 && <span className="bad"> · {sum.haunted} haunted</span>}
          {sum.unchecked > 0 && <span className="dim"> · {sum.unchecked} not yet checked</span>}
          {sum.invalid > 0 && <span className="warn"> · {sum.invalid} unreadable</span>}
        </div>
        <div className="controls">
          <label className="switch">
            <input type="checkbox" checked={haunting} onChange={(e) => setHaunting(e.target.checked)} /> Haunting
          </label>
          <label className="switch">
            <input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} /> Turbo
          </label>
        </div>
      </header>

      <main className="cols">
        <section className="panel spec" aria-labelledby="spec-title">
          <div className="panel-head">
            <h2 id="spec-title">requirements.md</h2>
            {editing ? (
              <div className="row">
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="button" className="btn primary" onClick={applySpec}>
                  Apply
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDraft(source);
                  setEditing(true);
                }}
              >
                Edit spec
              </button>
            )}
          </div>
          {editing ? (
            <>
              <textarea className="editor" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="Spec markdown" />
              <p className="hint">
                Add <code>probe:</code> or <code>monitor:</code> under any criterion. It starts haunting as soon as you press Apply.{' '}
                <button type="button" className="link" onClick={() => setDraft(DEFAULT_SPEC)}>
                  Restore the example
                </button>
              </p>
            </>
          ) : (
            <>
              <p className="spec-title"># {spec.title}</p>
              {spec.requirements.map((r) => (
                <div key={r.n} className="req">
                  <h3>
                    ## Requirement {r.n}: {r.title}
                  </h3>
                  <ol>
                    {r.criteria.map((c) => (
                      <CriterionLine key={c.id} c={c} status={state.status[c.id]} running={state.running === c.id} />
                    ))}
                  </ol>
                </div>
              ))}
            </>
          )}
        </section>

        <section className="panel live" aria-labelledby="live-title">
          <div className="panel-head">
            <h2 id="live-title">Live app</h2>
            <span className="dim small">{state.running ? `👻 checking ${state.running}…` : haunting ? 'between checks' : 'haunting paused, monitors still watching'}</span>
          </div>
          <div className="browser">
            <div className="chrome" aria-hidden="true">
              <span />
              <span />
              <span />
              <code>{appUrl.replace(/^https?:\/\//, '').split('?')[0]}</code>
            </div>
            <div className="viewport">
              <iframe ref={frame} src={TARGET_URL} title="Cauldron & Co. storefront (the app Specter is watching)" onLoad={onFrameLoad} />
              <div className={`ghost-cursor${cursor.on ? ' on' : ''}`} style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)`, transitionDuration: turbo ? '0s' : '0.35s' }} aria-hidden="true">
                <span key={cursor.click} className="ripple" />
                👻
              </div>
            </div>
          </div>

          <details className="sabotage" open>
            <summary>
              😈 Sabotage <span className="dim small">(break the live app on purpose)</span>
            </summary>
            <ul>
              {BUGS.map((b) => (
                <li key={b.id}>
                  <label>
                    <input type="checkbox" checked={bugs.has(b.id)} onChange={(e) => toggleBug(b.id, e.target.checked)} />
                    <span>
                      <strong>{b.label}</strong> <span className="dim small">breaks {b.breaks}</span>
                      <br />
                      <span className="dim small">{b.detail}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={fixAll} disabled={bugs.size === 0}>
              Exorcise everything
            </button>
          </details>
        </section>

        <section className="panel feed" aria-labelledby="feed-title">
          <div className="panel-head">
            <h2 id="feed-title">Hauntings</h2>
            <span className="dim small">{open.length} open</span>
          </div>
          {open.length === 0 && <p className="calm">All quiet. Every checked requirement holds. Try the sabotage switches.</p>}
          <ul className="cards">
            {open.map((h) => (
              <HauntingCard
                key={h.key}
                h={h}
                c={criteria.find((c) => c.id === h.criterionId)}
                appUrl={appUrl}
                repo={repo}
                expanded={openIssue === h.key}
                onToggle={() => setOpenIssue(openIssue === h.key ? null : h.key)}
                onCopy={copy}
              />
            ))}
          </ul>
          {resolved.length > 0 && (
            <>
              <h3 className="sub">Exorcised</h3>
              <ul className="cards resolved">
                {resolved.map((h) => (
                  <li key={h.key} className="card done">
                    <strong>{h.criterionId}</strong> held again after {(((h.resolvedAt ?? h.firstSeen) - h.firstSeen) / 1000).toFixed(0)} s
                  </li>
                ))}
              </ul>
            </>
          )}
          <label className="repo">
            <span className="dim small">Issues go to GitHub repo</span>
            <input
              value={repo}
              onChange={(e) => {
                setRepo(e.target.value);
                localStorage.setItem(REPO_KEY, e.target.value);
              }}
              placeholder="owner/repo"
            />
          </label>
          {copied && (
            <p className="toast" role="status">
              {copied}
            </p>
          )}
        </section>
      </main>

      <footer className="foot">
        Specter · built with Kiro for Kiroween 2026 · <a href="https://github.com/ritwikareddykancharla/specter">source</a>
      </footer>
    </div>
  );
}

function CriterionLine({ c, status, running }: { c: Criterion; status?: CriterionStatus; running: boolean }) {
  const state = status?.state ?? 'idle';
  const icon = running ? '⟳' : state === 'pass' ? '✓' : state === 'fail' ? '👻' : state === 'invalid' ? '⚠' : '·';
  const label = running ? 'checking now' : state === 'pass' ? 'holding' : state === 'fail' ? 'haunted' : state === 'invalid' ? 'unreadable check' : 'not checked yet';
  return (
    <li className={`crit ${state}${running ? ' running' : ''}`}>
      <span className="chip" title={label} aria-label={label}>
        {icon}
      </span>
      <div>
        <p>
          <span className="cid">{c.id}</span> {c.text}
        </p>
        <p className="kind">
          {c.probe ? 'probe' : c.monitor ? 'monitor' : 'no check'}
          {status?.ms !== undefined && state !== 'invalid' && ` · ${Math.round(status.ms)} ms`}
          {status && status.passes + status.fails > 0 && ` · ${status.passes} ✓ ${status.fails} ✗`}
        </p>
        {c.error && <p className="err">{c.error}</p>}
        {state === 'fail' && status?.failure && (
          <p className="err">
            expected {status.failure.expected}, got {status.failure.actual}
          </p>
        )}
      </div>
    </li>
  );
}

function HauntingCard({
  h,
  c,
  appUrl,
  repo,
  expanded,
  onToggle,
  onCopy,
}: {
  h: Haunting;
  c?: Criterion;
  appUrl: string;
  repo: string;
  expanded: boolean;
  onToggle: () => void;
  onCopy: (text: string, what: string) => void;
}) {
  const title = issueTitle(h);
  const body = issueBody(h, c, appUrl);
  const validRepo = /^[\w.-]+\/[\w.-]+$/.test(repo.trim());
  return (
    <li className="card haunted">
      <p className="card-top">
        <span className="badge">{h.criterionId}</span>
        <span className="dim small">
          {h.kind} · {new Date(h.firstSeen).toLocaleTimeString()}
        </span>
      </p>
      <p className="card-text">{h.text}</p>
      <dl>
        <dt>Check</dt>
        <dd>
          <code>{h.failure.check}</code>
        </dd>
        <dt>Expected</dt>
        <dd>{h.failure.expected}</dd>
        <dt>Actual</dt>
        <dd className="bad">{h.failure.actual}</dd>
      </dl>
      {h.detectedAfterS !== undefined && <p className="caught">Caught {h.detectedAfterS.toFixed(1)} s after the sabotage.</p>}
      <div className="row">
        <button type="button" className="btn" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? 'Hide issue' : 'Draft issue'}
        </button>
        <button type="button" className="btn" onClick={() => onCopy(kiroTask(h, c), 'Kiro task copied. Paste it into tasks.md.')}>
          Copy Kiro fix task
        </button>
      </div>
      {expanded && (
        <div className="issue">
          <p className="issue-title">{title}</p>
          <pre>{body}</pre>
          <div className="row">
            {validRepo ? (
              <a className="btn primary" href={issueUrl(repo.trim(), title, body)} target="_blank" rel="noopener noreferrer">
                Open on GitHub
              </a>
            ) : (
              <span className="warn small">Set a repo like owner/name below.</span>
            )}
            <button type="button" className="btn" onClick={() => onCopy(`## ${title}\n\n${body}`, 'Issue markdown copied.')}>
              Copy markdown
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
