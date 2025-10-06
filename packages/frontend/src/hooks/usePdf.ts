import { useState } from 'react';

interface UsePdfResult {
  pdfError: string | null;
  pdfSnackOpen: boolean;
  handlePdfDownload: (id: string) => Promise<void>;
  closePdfSnack: () => void;
}

/**
 * Hook to manage PDF download functionality
 */
export function usePdf(): UsePdfResult {
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSnackOpen, setPdfSnackOpen] = useState(false);

  const handlePdfDownload = async (id: string) => {
    try {
      const token = localStorage.getItem('didhub_jwt');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const resp = await fetch(`/api/pdf/alter/${id}`, {
        credentials: 'include',
        headers,
      });

      if (!resp.ok) {
        setPdfError(`Failed (${resp.status})`);
        setPdfSnackOpen(true);
        return;
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `detail-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setPdfError(message);
      setPdfSnackOpen(true);
    }
  };

  const closePdfSnack = () => {
    setPdfSnackOpen(false);
  };

  return {
    pdfError,
    pdfSnackOpen,
    handlePdfDownload,
    closePdfSnack,
  };
}
