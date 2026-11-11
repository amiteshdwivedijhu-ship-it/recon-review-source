import type { ReactNode } from 'react';

export const INPUT_CLASS =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-accent';

export const BUTTON_PRIMARY = 'rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-hover';
export const BUTTON_SECONDARY = 'rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface-2';

/** A labeled field with its error tied to the input for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined; className: string }) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, className: `${INPUT_CLASS} ${error ? 'border-bad-fg' : 'border-line'}` })}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} data-testid={`error-${id}`} className="mt-1 text-xs font-medium text-bad-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" data-testid="form-alert" className="rounded-lg border border-bad-line bg-bad-bg px-3 py-2 text-sm font-medium text-bad-fg">
      {message}
    </p>
  );
}

export function SimulatedNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-muted">
      <span className="mr-1.5 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Simulated</span>
      {children}
    </p>
  );
}
