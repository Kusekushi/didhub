import { apiClient } from '@didhub/api-client';

/**
 * Utility function to upload multiple files
 */
export async function uploadFiles(files: FileList | File[] | null | undefined): Promise<string[]> {
  const urls: string[] = [];
  if (!files) return urls;
  const arr: File[] = Array.isArray(files) ? files : Array.from(files as FileList);
  for (const f of arr) {
    try {
      const res = await apiClient.files.upload(f);
      if (typeof res.url === 'string' && res.url) {
        urls.push(res.url);
        continue;
      }
      if (res.payload && typeof res.payload === 'object') {
        const record = res.payload as Record<string, unknown>;
        const directUrl = typeof record.url === 'string' ? record.url : undefined;
        if (directUrl) {
          urls.push(directUrl);
          continue;
        }
        const filename = typeof record.filename === 'string' ? record.filename : undefined;
        if (filename) {
          urls.push(filename);
        }
      }
    } catch {
      // ignore
    }
  }
  return urls;
}
