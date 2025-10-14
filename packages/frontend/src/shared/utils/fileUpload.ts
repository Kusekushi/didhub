import * as fileService from '../../services/fileService';

/**
 * Utility function to upload multiple files
 */
export async function uploadFiles(files: FileList | File[] | null | undefined): Promise<string[]> {
  const urls: string[] = [];
  if (!files) return urls;
  const arr: File[] = Array.isArray(files) ? files : Array.from(files as FileList);
  for (const f of arr) {
    try {
      // Uploads expect a FormData body. Wrap single file in FormData.
      try {
        const url = await fileService.uploadFile(f);
        urls.push(url);
        continue;
      } catch {
        // ignore per-file errors
      }
    } catch {
      // ignore per-file errors
    }
  }
  return urls;
}
