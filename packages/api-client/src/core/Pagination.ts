export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function createPage<T>(input: {
  items?: T[] | null;
  total?: number | null;
  limit?: number | null;
  offset?: number | null;
}): Page<T> {
  return {
    items: Array.isArray(input.items) ? input.items : [],
    total: typeof input.total === 'number' ? input.total : Array.isArray(input.items) ? input.items.length : 0,
    limit: typeof input.limit === 'number' ? input.limit : Array.isArray(input.items) ? input.items.length : 0,
    offset: typeof input.offset === 'number' ? input.offset : 0,
  };
}
