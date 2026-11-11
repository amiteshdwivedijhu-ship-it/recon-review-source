import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report', 'fixtures', 'screens']);
const TEXT = /\.(ts|tsx|md|css|html|json|js|sh|txt)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name) || name === 'package-lock.json') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : TEXT.test(name) ? [path] : [];
  });
}

/** Read a hex color token from tokens.css. */
const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`).exec(tokens)![1]!;
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('copy and color rules', () => {
  it('has no long dashes in any source file or doc', () => {
    const long = new RegExp('[\\u2012-\\u2015\\u2212]');
    const offenders = files(ROOT).filter((path) => long.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('never names the company or uses its logo in the app source', () => {
    const offenders = files(join(ROOT, 'src')).filter((path) => /ember/i.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('text colors meet WCAG AA contrast (4.5 to 1) on their backgrounds', () => {
    const pairs: [string, string][] = [
      ['color-ink', '#ffffff'],
      ['color-muted', '#ffffff'],
      ['color-muted', token('color-surface-2')],
      ['color-muted', token('color-tint')],
      ['color-primary', '#ffffff'],
      ['color-primary', token('color-tint')],
      ['status-ok-fg', token('status-ok-bg')],
      ['status-warn-fg', token('status-warn-bg')],
      ['status-bad-fg', token('status-bad-bg')],
      ['status-unknown-fg', token('status-unknown-bg')],
    ];
    for (const [fg, bg] of pairs) {
      expect(contrast(token(fg), bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast('#ffffff', token('color-primary')), 'white on primary button').toBeGreaterThanOrEqual(4.5);
  });
});
