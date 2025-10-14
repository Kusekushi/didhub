import { useState } from 'react';
import * as adminService from '../../services/adminService';

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
      let response: any;

      switch (type) {
        case 'group':
          response = await adminService.getPdfGroupById(id);
          break;
        case 'subsystem':
          response = await adminService.getPdfSubsystemById(id);
          break;
        case 'alter':
        default:
          response = await adminService.getPdfAlterById(id);
          break;
      }

      // Adapter returns a Response-like object; be defensive
      if (!response || (typeof (response.ok) !== 'undefined' && !response.ok)) {
        setPdfError(`Failed`);
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
