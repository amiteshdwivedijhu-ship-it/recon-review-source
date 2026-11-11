export function DemoBanner({ onReset, clockNote }: { onReset: () => void; clockNote?: string }) {
  return (
    <div role="region" aria-label="Demo notice" className="border-b border-warn-line bg-warn-bg">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2 sm:px-6">
        <p className="text-sm text-warn-fg">
          <strong className="font-semibold">Demo data.</strong> Your decisions reset when you refresh. Nothing is sent or posted to any system.{clockNote ? ` ${clockNote}` : ''}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-warn-line bg-white px-3 py-1 text-xs font-semibold text-warn-fg hover:bg-warn-bg"
        >
          Reset demo
        </button>
      </div>
    </div>
  );
}
