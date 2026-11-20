import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();

  for (const key of keys) {
    const propValue = (value as Record<string, unknown>)[key];
    if (propValue !== undefined) {
      sorted[key] = canonicalize(propValue);
    }
  }

  return sorted;
}

export function computePayloadHash(payload: Record<string, unknown>): string {
  const canonicalJson = JSON.stringify(canonicalize(payload));
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}