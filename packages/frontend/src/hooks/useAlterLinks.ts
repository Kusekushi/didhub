import { useState, useEffect } from 'react';
import { fetchAlterNames, getAlter, Alter } from '@didhub/api-client';
import { normalizeToArray } from '../utils/detailUtils';

interface AlterLink {
  name: string;
  id?: number | string;
}

/**
 * Hook to manage alter relationship links (partners, parents, children)
 */
export function useAlterLinks(alter: Alter | null) {
  const [partnerLinks, setPartnerLinks] = useState<AlterLink[]>([]);
  const [parentLinks, setParentLinks] = useState<AlterLink[]>([]);
  const [childLinks, setChildLinks] = useState<AlterLink[]>([]);
  const [alterNamesMap, setAlterNamesMap] = useState<Map<string, number | string> | null>(null);
  const [alterIdToNameMap, setAlterIdToNameMap] = useState<Map<number | string, string> | null>(null);

  // Load alter names map
  useEffect(() => {
    async function loadAlterNamesMap() {
      try {
        const namesRes = (await fetchAlterNames()) as { items?: Array<{ id?: number | string; name?: string }> };
        const map = new Map<string, number | string>();
        const idMap = new Map<number | string, string>();
        (namesRes.items || []).forEach((it) => {
          if (it && it.name) {
            map.set(String(it.name).toLowerCase(), it.id as number | string);
            if (it.id !== undefined && it.id !== null) idMap.set(it.id as number | string, it.name as string);
          }
        });
        setAlterNamesMap(map);
        setAlterIdToNameMap(idMap);
      } catch (e) {
        setAlterNamesMap(null);
        setAlterIdToNameMap(null);
      }
    }
    loadAlterNamesMap();
  }, []);

  // Load partner links
  useEffect(() => {
    async function loadPartnerLinks() {
      if (!alter) return setPartnerLinks([]);

      const raw = (alter as any).partners;
      const parts = normalizeToArray(raw);
      if (!parts.length) return setPartnerLinks([]);

      try {
        const map = alterNamesMap ?? new Map<string, number | string>();
        if (!alterNamesMap) {
          try {
            const namesRes = (await fetchAlterNames()) as { items?: Array<{ id?: number | string; name?: string }> };
            (namesRes.items || []).forEach((it) => {
              if (it && it.name) map.set(String(it.name).toLowerCase(), it.id as number | string);
            });
          } catch (e) {
            // Ignore fetch error and fall back to names only
          }
        }

        const links: AlterLink[] = [];
        for (const p of parts) {
          const maybeNum = !Number.isNaN(Number(p)) && String(p).trim() !== '' ? Number(p) : null;
          if (maybeNum !== null) {
            const nameFromId = alterIdToNameMap?.get(maybeNum);
            if (nameFromId) {
              links.push({ name: nameFromId, id: maybeNum });
              continue;
            }
            try {
              const fetched = (await getAlter(maybeNum)) as Alter | null;
              if (fetched && fetched.name) {
                const newMap = new Map(alterIdToNameMap?.entries() || []);
                newMap.set(maybeNum, fetched.name);
                setAlterIdToNameMap(newMap);
                links.push({ name: fetched.name, id: maybeNum });
                continue;
              }
            } catch (e) {
              // Ignore fetch error
            }
          }
          links.push({ name: p, id: map.get(String(p).toLowerCase()) });
        }
        setPartnerLinks(links);
      } catch (e) {
        setPartnerLinks(parts.map((p) => ({ name: p })));
      }
    }
    loadPartnerLinks();
  }, [alter, alterNamesMap, alterIdToNameMap]);

  // Load parent and child links
  useEffect(() => {
    async function loadParentChildLinks() {
      if (!alter) {
        setParentLinks([]);
        setChildLinks([]);
        return;
      }

      const collectLinks = async (raw: any): Promise<AlterLink[]> => {
        const parts = normalizeToArray(raw);
        if (!parts.length) return [];

        try {
          const map = alterNamesMap ?? new Map<string, number | string>();
          if (!alterNamesMap) {
            try {
              const namesRes = (await fetchAlterNames()) as { items?: Array<{ id?: number | string; name?: string }> };
              (namesRes.items || []).forEach((it) => {
                if (it && it.name) map.set(String(it.name).toLowerCase(), it.id as number | string);
              });
            } catch (e) {
              // Ignore fetch error and fall back to names only
            }
          }

          const links: AlterLink[] = [];
          for (const p of parts) {
            const maybeNum = !Number.isNaN(Number(p)) && String(p).trim() !== '' ? Number(p) : null;
            if (maybeNum !== null) {
              const nameFromId = alterIdToNameMap?.get(maybeNum);
              if (nameFromId) {
                links.push({ name: nameFromId, id: maybeNum });
                continue;
              }
              try {
                const fetched = (await getAlter(maybeNum)) as Alter | null;
                if (fetched && fetched.name) {
                  const newMap = new Map(alterIdToNameMap?.entries() || []);
                  newMap.set(maybeNum, fetched.name);
                  setAlterIdToNameMap(newMap);
                  links.push({ name: fetched.name, id: maybeNum });
                  continue;
                }
              } catch (e) {
                // Ignore
              }
            }
            links.push({ name: p, id: map.get(String(p).toLowerCase()) });
          }
          return links;
        } catch (e) {
          return parts.map((p) => ({ name: p }));
        }
      };

      const [pLinks, cLinks] = await Promise.all([
        collectLinks((alter as any).parents),
        collectLinks((alter as any).children),
      ]);

      setParentLinks(pLinks);
      setChildLinks(cLinks);
    }
    loadParentChildLinks();
  }, [alter, alterNamesMap, alterIdToNameMap]);

  return {
    partnerLinks,
    parentLinks,
    childLinks,
  };
}
