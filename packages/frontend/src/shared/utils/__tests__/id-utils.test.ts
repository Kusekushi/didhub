import { describe, it, expect } from 'vitest';
import { isUuid, normalizeEntityId } from '../alterFormUtils';
import { parseOwnerId } from '../owner';

describe('isUuid', () => {
  it('accepts dashed UUIDs', () => {
    // use a valid v4 UUID example
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('does not validate plain 32-hex without dashes via uuid.validate', () => {
    // plain 32-hex strings are normalized elsewhere (parseOwnerId) but
    // uuid.validate expects dashed UUIDs, so this should be false.
    expect(isUuid('550e8400e29b41d4a716446655440000')).toBe(false);
  });

  it('rejects invalid strings', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('123')).toBe(false);
  });
});

describe('normalizeEntityId', () => {
  it('trims and strips leading #', () => {
    expect(normalizeEntityId('#11111111-1111-1111-1111-111111111111')).toBe('11111111-1111-1111-1111-111111111111');
    expect(normalizeEntityId('  abc  ')).toBe('abc');
  });

  it('returns null for numbers or null-like input', () => {
    expect(normalizeEntityId(42)).toBeNull();
    expect(normalizeEntityId(null)).toBeNull();
  });
});

describe('parseOwnerId', () => {
  it('parses dashed UUIDs', () => {
    expect(parseOwnerId('11111111-1111-1111-1111-111111111111')).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('normalizes 32-hex to dashed format', () => {
    expect(parseOwnerId('11111111111111111111111111111111')).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('strips leading #', () => {
    expect(parseOwnerId('#11111111111111111111111111111111')).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('rejects numeric inputs', () => {
    // parseOwnerId explicitly rejects numbers
    expect(parseOwnerId(123 as any)).toBeUndefined();
  });

  it('returns undefined for invalid strings', () => {
    expect(parseOwnerId('not-a-uuid')).toBeUndefined();
  });
});
