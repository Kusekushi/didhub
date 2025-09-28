import { apiFetch, ApiFetchResult, ApiFetchResultError } from '../Util';
import type { ShortLink } from '../Types';

export type ShortlinkRecord = {
  target_type: string;
  target_id: string;
};

export async function createShortLink(type: string, id: string | number): Promise<ShortLink> {
  let target = '';
  if (type === 'alter') {
    target = `/detail/${id}`;
  } else {
    throw new Error(`Unknown shortlink type: ${type}`);
  }
  return apiFetch('/api/shortlink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  }).then((r: ApiFetchResult) => (r.json as any) || {});
}

export async function getShortlinkRecord(token: string): Promise<ShortlinkRecord | ApiFetchResultError> {
  return apiFetch(`/api/shortlink/${encodeURIComponent(token)}`).then(
    (r: ApiFetchResult) => (r.json as any) || ({ status: r.status } as ApiFetchResultError),
  );
}
