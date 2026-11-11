import { marked } from 'marked';
import { useMemo } from 'react';
import prd from '../../PRD.md?raw';
import qa from '../../QA.md?raw';
import readme from '../../README.md?raw';

export type DocId = 'prd' | 'qa' | 'handoff';

/** Each written deliverable is rendered from its own file, so the page and the file never drift apart. */
const DOCS: Record<DocId, { source: string; wide: boolean }> = {
  prd: { source: prd, wide: false },
  qa: { source: qa, wide: true },
  handoff: { source: readme, wide: false },
};

/** Links between the written files become links between the pages. */
const FILE_ROUTES: Record<string, string> = { 'PRD.md': '#/prd', 'QA.md': '#/qa', 'README.md': '#/handoff' };

const slug = (text: string) => `section-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

function render(markdown: string): { html: string; sections: { id: string; title: string }[] } {
  const sections = [...markdown.matchAll(/^## (.+)$/gm)].map((m) => ({ id: slug(m[1]!), title: m[1]! }));
  const html = marked
    .parse(markdown, { async: false, gfm: true })
    .replace(/<a href="([^"#:]+\.md)">/g, (whole, file: string) => (FILE_ROUTES[file] ? `<a href="${FILE_ROUTES[file]}">` : whole))
    // Any other repo file is not part of the hosted page, so its link becomes plain text.
    .replace(/<a href="(?!https?:|#\/)[^"]*">(.*?)<\/a>/g, '$1')
    .replace(/<a href="(https?:[^"]*)">/g, '<a href="$1" target="_blank" rel="noreferrer">')
    .replace(/<table>/g, '<div class="prd-table"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace('<h1>', '<h1 tabindex="-1">')
    .replace(/<h2>(.*?)<\/h2>/g, (_, title: string) => `<h2 id="${slug(title.replace(/&#39;/g, "'").replace(/&amp;/g, '&'))}" tabindex="-1">${title}</h2>`);
  return { html, sections };
}

/** Section links scroll in place. They are buttons, not anchors, because the address hash is the page route. */
function jumpTo(id: string) {
  const heading = document.getElementById(id);
  if (!heading) return;
  heading.scrollIntoView({ block: 'start' });
  heading.focus({ preventScroll: true });
}

export function DocPage({ id }: { id: DocId }) {
  const doc = DOCS[id];
  const { html, sections } = useMemo(() => render(doc.source), [doc.source]);
  const hasContents = sections.length >= 4;
  return (
    <div className={`mx-auto grid gap-6 ${doc.wide ? 'max-w-[1400px]' : 'max-w-[68rem]'} ${hasContents ? 'lg:grid-cols-[14rem_minmax(0,1fr)]' : ''}`}>
      {hasContents ? (
        <nav aria-label="Sections" data-testid="doc-contents" className="hidden lg:block">
          <div className="sticky top-6">
            <p className="text-xs font-semibold text-ink">On this page</p>
            <ol className="mt-2 space-y-0.5 border-l border-line">
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(section.id)}
                    className="-ml-px block w-full border-l border-transparent py-1 pl-3 text-left text-[13px] leading-snug text-muted hover:border-primary hover:text-ink"
                  >
                    {section.title}
                  </button>
                </li>
              ))}
            </ol>
            <a href="#/" className="mt-5 inline-block rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-hover">
              Try the prototype
            </a>
          </div>
        </nav>
      ) : null}
      <article
        data-testid={id}
        className={`prd min-w-0 rounded-2xl border border-line bg-white px-5 py-6 shadow-soft sm:px-10 sm:py-9 ${doc.wide ? 'prd-wide' : ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
