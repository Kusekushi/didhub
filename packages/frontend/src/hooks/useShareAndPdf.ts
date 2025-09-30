import { useState } from 'react';
import { apiClient, getShortLinkUrl } from '@didhub/api-client';
import { useSettings } from '../contexts/SettingsContext';

interface UseShareResult {
  shareDialog: { open: boolean; url: string; error: string | null };
  handleShare: () => Promise<void>;
  closeShareDialog: () => void;
}

interface UsePdfResult {
  pdfError: string | null;
  pdfSnackOpen: boolean;
  handlePdfDownload: (id: string) => Promise<void>;
  closePdfSnack: () => void;
}

/**
 * Hook to manage sharing functionality
 */
export function useShare(alterId?: string | number): UseShareResult {
  const settings = useSettings();
  const [shareDialog, setShareDialog] = useState<{ open: boolean; url: string; error: string | null }>({
    open: false,
    url: '',
    error: null,
  });

  const handleShare = async () => {
    if (!settings.loaded) return;
    if (!settings.shortLinksEnabled) {
      setShareDialog({ open: true, url: '', error: 'Short links are disabled' });
      return;
    }

    if (alterId == null) {
      setShareDialog({ open: true, url: '', error: 'Missing alter id' });
      return;
    }

    const record = await apiClient.shortlinks.create('alter', alterId).catch(() => null);
    if (!record) {
      setShareDialog({ open: true, url: '', error: 'Failed to create share link' });
      return;
    }

    const url = getShortLinkUrl(record);
    try {
      await navigator.clipboard.writeText(url);
      setShareDialog({ open: true, url, error: null });
    } catch (e) {
      setShareDialog({ open: true, url, error: null });
    }
  };

  const closeShareDialog = () => {
    setShareDialog({ open: false, url: '', error: null });
  };

  return {
    shareDialog,
    handleShare,
    closeShareDialog,
  };
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
