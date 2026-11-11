export interface ToastMessage {
  id: number;
  text: string;
  tone: 'ok' | 'bad';
}

/** Feedback after each action. Announced politely to screen readers. */
export function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 mx-auto flex w-[26rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-ink px-4 py-3 text-white shadow-lift ${toast.tone === 'ok' ? 'border-ink' : 'border-bad-line'}`}
        >
          <span aria-hidden="true" className={`mt-0.5 text-sm font-bold ${toast.tone === 'ok' ? 'text-accent' : 'text-bad-line'}`}>
            {toast.tone === 'ok' ? '✓' : '!'}
          </span>
          <p className="flex-1 text-sm">{toast.text}</p>
          <button type="button" onClick={() => onDismiss(toast.id)} className="rounded text-xs font-medium text-white/70 hover:text-white" aria-label="Dismiss message">
            Close
          </button>
        </div>
      ))}
    </div>
  );
}
