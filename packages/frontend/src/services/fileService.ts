import { apiClient } from '@didhub/api-client';

// Minimal upload response shape used by the UI
type UploadResp = { filename?: string } | undefined;

export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const resp = await apiClient.files.post_upload({ body: formData } as any);
  const data = (resp as any).data as UploadResp;
  if (!data || !data.filename) throw new Error('upload failed');
  return `/uploads/${data.filename}`;
}

export async function uploadFiles(files: File[]): Promise<string[]> {
  const results: string[] = [];
  for (const f of files) {
    results.push(await uploadFile(f));
  }
  return results;
}
