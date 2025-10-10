import {
  convertLabelsToIdentifiers,
  mapSelectionsToTagValues,
  RelationshipOption,
} from '../alterFormUtils';

describe('alterFormUtils', () => {
  test('convertLabelsToIdentifiers resolves objects and strings correctly', () => {
    const primary = { Alice: 1, bob: 2 };
    const idLookup = { '3': 'Charlie' };
    const input = ['Alice', { id: 2, label: 'Bob' }, '#3', 'unknown'];
    const result = convertLabelsToIdentifiers(input as any, primary as any, idLookup as any);
    expect(result).toEqual([1, 2, 3, 'unknown']);
  });

  test('mapSelectionsToTagValues maps ids and constructs synthetic options using idLookup', () => {
    const options: RelationshipOption[] = [{ id: 1, label: 'Alice' }, { id: 2, label: 'Bob' }];
    const idLookup = { '3': 'Charlie' };
    const input = [1, '#2', 3, 'Unknown'];
    const mapped = mapSelectionsToTagValues(input as any, options, idLookup);
    // Expect first two to be resolved to option objects
    expect(mapped[0]).toHaveProperty('id', 1);
    expect((mapped[1] as any).id).toBe(2);
    // Third should be constructed from idLookup
    expect((mapped[2] as any).label).toBe('Charlie');
    // Unknown string should be returned as string
    expect(mapped[3]).toBe('Unknown');
  });
});
