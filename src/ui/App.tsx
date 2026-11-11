import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyze } from '../domain/findings';
import { loadDataset } from '../domain/load';
import { type Action, type Dispatch, type ReviewState, applyActionSequence, initialReviewState } from '../domain/workflow';
import { CaseView } from './CaseView';
import { DemoBanner } from './DemoBanner';
import { type DocId, DocPage } from './DocPage';
import { type ToastMessage, ToastStack } from './Toast';
import { Worklist } from './Worklist';
import { demoToday, formatShortDate } from './format';

const readHash = () => (typeof window === 'undefined' ? '' : window.location.hash);

const DOC_ROUTES: Record<string, DocId> = { '#/prd': 'prd', '#/qa': 'qa', '#/handoff': 'handoff' };

function parseRoute(hash: string): { page: 'worklist' } | { page: 'doc'; doc: DocId } | { page: 'case'; caseId: string } {
  const doc = DOC_ROUTES[hash];
  if (doc) return { page: 'doc', doc };
  const match = /^#\/case\/([^/]+)$/.exec(hash);
  return match ? { page: 'case', caseId: decodeURIComponent(match[1]!) } : { page: 'worklist' };
}

type ViewId = 'prototype' | DocId;
const VIEWS: { id: ViewId; label: string; href: string }[] = [
  { id: 'prototype', label: 'Prototype', href: '#/' },
  { id: 'prd', label: 'Product requirements', href: '#/prd' },
  { id: 'qa', label: 'QA record', href: '#/qa' },
  { id: 'handoff', label: 'Handoff notes', href: '#/handoff' },
];

/** Everything in the submission, side by side, so a visitor always sees both and knows which one is open. */
function ViewSwitch({ current }: { current: ViewId }) {
  return (
    <nav aria-label="Views" className="flex flex-wrap rounded-lg border border-line bg-surface-2 p-0.5">
      {VIEWS.map((view) => {
        const active = view.id === current;
        return (
          <a
            key={view.id}
            href={view.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3.5 py-1.5 text-sm font-semibold ${active ? 'bg-white text-ink shadow-soft' : 'text-muted hover:text-ink'}`}
          >
            {view.label}
          </a>
        );
      })}
    </nav>
  );
}

function Shell({
  onReset,
  clockNote,
  view = 'prototype',
  children,
}: {
  onReset: (() => void) | null;
  clockNote?: string;
  view?: ViewId;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <DemoBanner onReset={onReset ?? (() => window.location.reload())} clockNote={clockNote} />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="#/" className="text-base font-semibold tracking-tight text-ink">
              Payment reconciliation review
            </a>
            <ViewSwitch current={view} />
          </div>
          <span className="text-xs text-muted">Signed in as Demo reviewer (no sign-in in this demo)</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6">{children}</main>
    </div>
  );
}

export function App({ rawData }: { rawData: unknown }) {
  const loaded = useMemo(() => loadDataset(rawData), [rawData]);
  if (!loaded.ok) {
    return (
      <Shell onReset={null}>
        <div role="alert" className="rounded-2xl border border-bad-line bg-bad-bg p-6">
          <h1 className="text-xl font-semibold text-bad-fg">The data file could not be loaded</h1>
          <p className="mt-1 text-sm">Nothing was matched or calculated. Fix these problems in the file and reload.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {loaded.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      </Shell>
    );
  }
  return <Review ds={loaded.dataset} />;
}

function Review({ ds }: { ds: import('../domain/types').Dataset }) {
  const analysis = useMemo(() => analyze(ds), [ds]);
  const [review, setReview] = useState<ReviewState>(() => initialReviewState(analysis));
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);
  const clockStart = useRef(Date.now());
  const [hash, setHash] = useState(readHash);
  const route = parseRoute(hash);

  useEffect(() => {
    const onChange = () => setHash(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // Move focus to the page heading on navigation so keyboard users land in the right place.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus();
  }, [hash]);

  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const pushToast = useCallback(
    (text: string, tone: ToastMessage['tone']) => {
      const id = ++toastId.current;
      // One message at a time: the newest replaces the last, so feedback never piles up over the page.
      setToasts([{ id, text, tone }]);
      window.setTimeout(() => dismissToast(id), 6000);
    },
    [dismissToast],
  );

  /** Every reviewer action goes through the domain state machine. A refusal changes nothing. */
  const dispatch = useCallback<Dispatch>(
    (action, options) => {
      // The demo clock starts at the data snapshot and runs forward, so actions and data share one timeline.
      const now = new Date(Date.parse(analysis.snapshotAt) + (Date.now() - clockStart.current)).toISOString();
      const confirmFirst = options?.confirmFirst === true && action.type !== 'posting_decision';
      const actions: Action[] = confirmFirst ? [{ type: 'confirm', findingId: action.findingId }, action] : [action];
      const result = applyActionSequence(reviewRef.current, analysis, actions, { now, today: now.slice(0, 10) });
      if (result.ok) {
        reviewRef.current = result.state;
        setReview(result.state);
        pushToast(confirmFirst ? `Confirmed. ${result.toast}` : result.toast, 'ok');
      }
      return result;
    },
    [analysis, pushToast],
  );

  const reset = useCallback(() => {
    const fresh = initialReviewState(analysis);
    clockStart.current = Date.now();
    reviewRef.current = fresh;
    setReview(fresh);
    pushToast('Demo reset. All decisions and history are cleared.', 'ok');
  }, [analysis, pushToast]);

  const openCase = useCallback((caseId: string) => {
    window.location.hash = `#/case/${caseId}`;
  }, []);

  const current = route.page === 'case' ? analysis.cases.find((c) => c.caseId === route.caseId) : undefined;

  return (
    <Shell onReset={reset} view={route.page === 'doc' ? route.doc : 'prototype'} clockNote={`Demo clock starts at the data snapshot, ${formatShortDate(demoToday(analysis.snapshotAt))}.`}>
      {route.page === 'worklist' ? (
        <Worklist analysis={analysis} review={review} onOpen={openCase} />
      ) : route.page === 'doc' ? (
        <DocPage key={route.doc} id={route.doc} />
      ) : current ? (
        <CaseView key={current.caseId} ds={ds} analysis={analysis} c={current} review={review} dispatch={dispatch} />
      ) : (
        <div className="rounded-2xl border border-line bg-white p-6">
          <h1 tabIndex={-1} className="text-xl font-semibold outline-none">
            Case not found
          </h1>
          <p className="mt-1 text-muted">There is no live case with that id. Case D is covered in the spec only.</p>
          <a href="#/" className="mt-3 inline-block font-medium text-primary underline-offset-2 hover:underline">
            Back to worklist
          </a>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </Shell>
  );
}
