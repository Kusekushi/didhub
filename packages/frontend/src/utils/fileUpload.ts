import { uploadFile } from '@didhub/api-client';

/**
 * Utility function to upload multiple files
 */
export async function uploadFiles(files: FileList | File[] | null | undefined): Promise<string[]> {
  const urls: string[] = [];
  if (!files) return urls;
  const arr: File[] = Array.isArray(files) ? files : Array.from(files as FileList);
  for (const f of arr) {
    try {
      const file = f as File;
      const res = await uploadFile(file);
      const up = res as any;
      if (up && up.json && up.json.url) urls.push(up.json.url as string);
      else if (up && up.url) urls.push(up.url as string);
    } catch {
      // ignore
    }
  }
  return urls;
}
