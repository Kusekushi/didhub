import { useState, useEffect } from 'react';
import * as alterService from '../../services/alterService';
import { normalizeToArray } from '../../shared/utils/detailUtils';
import { normalizeEntityId } from '../utils/alterFormUtils';

interface AlterLink {
  name: string;
  id?: string;
}

/**
 * Hook to manage alter relationship links (partners, parents, children)
 */
export function useAlterLinks(alter: any | null) {
  const [partnerLinks, setPartnerLinks] = useState<AlterLink[]>([]);
  const [parentLinks, setParentLinks] = useState<AlterLink[]>([]);
  const [childLinks, setChildLinks] = useState<AlterLink[]>([]);
  const [alterNamesMap, setAlterNamesMap] = useState<Map<string, string> | null>(null);
  const [alterIdToNameMap, setAlterIdToNameMap] = useState<Map<string, string> | null>(null);

  // Load alter names map
  useEffect(() => {
    async function loadAlterNamesMap() {
      try {
  const namesRes = await alterService.searchAlters({ q: '' });
  const map = new Map<string, string>();
  const idMap = new Map<string, string>();
  const items = Array.isArray(namesRes?.items) ? (namesRes.items as any[]) : [];
        items.forEach((it) => {
          if (it && it.name) {
            const idVal = it.id !== undefined && it.id !== null ? normalizeEntityId(it.id) : undefined;
            map.set(String(it.name).toLowerCase(), idVal ?? String(it.name));
            if (idVal) idMap.set(idVal, it.name as string);
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
        const map = alterNamesMap ?? new Map<string, string>();
        if (!alterNamesMap) {
            try {
            const namesRes = await alterService.searchAlters({ q: '' });
            const items = Array.isArray(namesRes?.items) ? (namesRes.items as any[]) : [];
            items.forEach((it) => {
              if (it && it.name) {
                const nid = normalizeEntityId(it.id ?? it.name) ?? undefined;
                map.set(String(it.name).toLowerCase(), nid ?? String(it.name));
              }
            });
          } catch (e) {
            // Ignore fetch error and fall back to names only
          }
        }

        const links: AlterLink[] = [];
        for (const p of parts) {
          const candidate = String(p ?? '').trim();
          if (candidate) {
            const idKey = normalizeEntityId(candidate) ?? candidate.replace(/^#/u, '');
            const nameFromId = idKey ? alterIdToNameMap?.get(idKey) : undefined;
            if (nameFromId) {
              links.push({ name: nameFromId, id: idKey });
              continue;
            }
              try {
                const fetched = idKey ? await alterService.getAlterById(idKey) : null;
              if (fetched && fetched.name) {
                const newMap = new Map(alterIdToNameMap?.entries() || []);
                if (idKey) newMap.set(idKey, fetched.name);
                setAlterIdToNameMap(newMap);
                links.push({ name: fetched.name, id: idKey });
                continue;
              }
            } catch (e) {
              // Ignore fetch error
            }
          }
          links.push({ name: p, id: map.get(String(p).toLowerCase()) ?? undefined });
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
          const map = alterNamesMap ?? new Map<string, string>();
          if (!alterNamesMap) {
            try {
              const namesRes = await alterService.searchAlters({ q: '' });
              const items = Array.isArray(namesRes?.items) ? (namesRes.items as any[]) : [];
              items.forEach((it) => {
                if (it && it.name) {
                  const nid = normalizeEntityId(it.id ?? it.name) ?? undefined;
                  map.set(String(it.name).toLowerCase(), nid ?? String(it.name));
                }
              });
            } catch (e) {
              // Ignore fetch error and fall back to names only
            }
          }

          const links: AlterLink[] = [];
          for (const p of parts) {
            const candidate = String(p ?? '').trim();
            if (candidate) {
              const idKey = candidate.replace(/^#/u, '');
              const nameFromId = alterIdToNameMap?.get(idKey);
              if (nameFromId) {
                links.push({ name: nameFromId, id: idKey });
                continue;
              }
                try {
                const fetched = await alterService.getAlterById(idKey);
                if (fetched && fetched.name) {
                  const newMap = new Map(alterIdToNameMap?.entries() || []);
                  newMap.set(idKey, fetched.name);
                  setAlterIdToNameMap(newMap);
                  links.push({ name: fetched.name, id: idKey });
                  continue;
                }
              } catch (e) {
                // Ignore
              }
            }
            links.push({ name: p, id: map.get(String(p).toLowerCase()) ?? undefined });
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
