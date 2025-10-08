/**
 * Utility functions for downloading files from the browser
 */

/**
 * Downloads a blob as a file with the specified filename
 * @param blob The blob to download
 * @param filename The filename for the download
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads data as a JSON file
 * @param data The data to download (will be JSON.stringify'd)
 * @param filename The filename for the download (without extension)
 */
export function downloadJson(data: any, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadBlob(blob, `${filename}.json`);
}

/**
 * Downloads text as a plain text file
 * @param text The text content to download
 * @param filename The filename for the download (without extension)
 */
export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  downloadBlob(blob, `${filename}.txt`);
}