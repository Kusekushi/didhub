import React from 'react';
import { apiClient } from '@didhub/api-client';
import type { RelationshipOption } from './alterFormUtils';

export interface UseAlterRelationshipsResult {
  loading: boolean;
  options: RelationshipOption[];
  idLookup: Record<string, string>;
  error?: unknown;
}

export function useAlterRelationships(alterId: number | string | null | undefined) {
  const [loading, setLoading] = React.useState(false);
  const [options, setOptions] = React.useState<RelationshipOption[]>([]);
  const [idLookup, setIdLookup] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<unknown>(undefined);

  React.useEffect(() => {
    let mounted = true;
    if (alterId == null) return;
    setLoading(true);
    setError(undefined);
    (async () => {
      try {
        const resp = await apiClient.alter.get_alters_by_id_relationships(String(alterId));
        const rels = Array.isArray(resp.data) ? resp.data : [];
        const opts: RelationshipOption[] = [];
        const lookup: Record<string, string> = {};
        for (const r of rels) {
          const aid = (r as any).alter_id ?? null;
          const uname = (r as any).username ?? null;
          if (aid != null) {
            const key = String(aid);
            const label = uname ? String(uname) : `#${key}`;
            opts.push({ id: key, label });
            lookup[key] = label;
          }
        }
        if (!mounted) return;
        setOptions(opts);
        setIdLookup(lookup);
      } catch (e) {
        if (!mounted) return;
        setError(e);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [alterId]);

  return { loading, options, idLookup, error } as UseAlterRelationshipsResult;
}
