import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../../src/domain/load';
import type { Dataset } from '../../src/domain/types';

export const FIXTURE_PATH = fileURLToPath(new URL('../../fixtures/sample_data.json', import.meta.url));

export function rawFixture(): any {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

export function fixture(): Dataset {
  const result = loadDataset(rawFixture());
  if (!result.ok) throw new Error('fixture failed to load: ' + result.errors.join('; '));
  return result.dataset;
}

/** Load a broken copy. The original file is never touched. */
export function brokenFixture(mutate: (raw: any) => void): Dataset {
  const raw = rawFixture();
  mutate(raw);
  const result = loadDataset(raw);
  if (!result.ok) throw new Error('broken copy failed to load: ' + result.errors.join('; '));
  return result.dataset;
}
