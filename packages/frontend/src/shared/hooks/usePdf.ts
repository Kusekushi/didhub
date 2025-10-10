import { useState } from 'react';
import { apiClient } from '@didhub/api-client';

type PdfType = 'alter' | 'group' | 'subsystem';

interface UsePdfResult {
  pdfError: string | null;
  pdfSnackOpen: boolean;
  handlePdfDownload: (id: string, type?: PdfType) => Promise<void>;
  closePdfSnack: () => void;
}

/**
 * Hook to manage PDF download functionality
 */
export function usePdf(): UsePdfResult {
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSnackOpen, setPdfSnackOpen] = useState(false);

  const handlePdfDownload = async (id: string, type: PdfType = 'alter') => {
    try {
      let response: Response;

      switch (type) {
        case 'group':
          response = await apiClient.report.get_pdf_group_by_id(id);
          break;
        case 'subsystem':
          response = await apiClient.report.get_pdf_subsystem_by_id(id);
          break;
        case 'alter':
        default:
          response = await apiClient.report.get_pdf_alter_by_id(id);
          break;
      }

      if (!response.ok) {
        setPdfError(`Failed (${response.status})`);
        setPdfSnackOpen(true);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-${id}.pdf`;
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
