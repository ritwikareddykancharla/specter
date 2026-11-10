/** Sabotage switches for the demo storefront. Each one breaks exactly one requirement in the default spec. */

export interface Bug {
  id: string;
  label: string;
  breaks: string;
  detail: string;
}

export const BUGS: readonly Bug[] = [
  { id: 'double-add', label: 'Add-to-cart adds two', breaks: '1.1', detail: 'A retry loop runs the add handler twice.' },
  { id: 'subtotal-skip', label: 'Subtotal skips a line', breaks: '1.2', detail: 'An off-by-one in the subtotal loop starts at index 1.' },
  { id: 'double-discount', label: 'BOO10 takes 20% off', breaks: '2.1', detail: 'The discount is applied twice.' },
  { id: 'slow-search', label: 'Search takes 2 seconds', breaks: '3.1', detail: 'A missing index makes the search API slow.' },
  { id: 'skip-validation', label: 'Checkout accepts bad emails', breaks: '4.1', detail: 'A refactor dropped the email check.' },
  { id: 'crash', label: 'Add-to-cart throws later', breaks: '4.2', detail: 'A promo banner reads a field of undefined.' },
];

export const STORAGE_KEY = 'specter.sabotage';

export function activeBugs(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function setBugs(ids: Iterable<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export const bug = (id: string): boolean => activeBugs().has(id);
