import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Grid, Typography } from '@mui/material';

const G: any = Grid;
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';
import InputPromptDialog from '../components/InputPromptDialog';
import ImagesGallery from '../components/ImagesGallery';
import BasicInfoSection from '../components/BasicInfoSection';
import WorkAffiliationsSection from '../components/WorkAffiliationsSection';
import { ListsSection, NotesSection } from '../components/DetailSections';
import DetailHeader from '../components/DetailHeader';
import NotificationSnackbar from '../components/NotificationSnackbar';
import logger from '../logger';
import { deleteAlterImage } from '@didhub/api-client';
import { renderEmbeds } from '../utils/detailUtils';
import { useAlterData } from '../hooks/useAlterData';
import { useAlterLinks } from '../hooks/useAlterLinks';
import { useRename } from '../hooks/useRename';
import { useShare, usePdf } from '../hooks/useShareAndPdf';

export default function Detail(): React.ReactElement {
  const { id } = useParams() as { id?: string };
  const nav = useNavigate();

  // Custom hooks
  const {
    alter,
    user,
    groupObj,
    affiliationGroup,
    affiliationGroupsMap,
    affiliationIdMap,
    subsystemObj,
    loading,
    error,
    refetch,
  } = useAlterData(id);

  const { partnerLinks, parentLinks, childLinks } = useAlterLinks(alter);

  const {
    renaming,
    renameVal,
    renameError,
    startRename,
    cancelRename,
    saveRename,
    setRenameVal,
  } = useRename(alter, (updatedAlter) => {
    // Update the alter in the hook's state
    refetch();
  });

  const { shareDialog, handleShare, closeShareDialog } = useShare(alter?.id);
  const { pdfError, pdfSnackOpen, handlePdfDownload, closePdfSnack } = usePdf();

  // Dialog states
  const [removeImageDialog, setRemoveImageDialog] = React.useState<{
    open: boolean;
    url: string;
    id: number | string | null;
  }>({ open: false, url: '', id: null });

  if (loading) return <Container sx={{ mt: 4 }}>Loading...</Container>;
  if (error) return <Container sx={{ mt: 4 }}>Error: {error}</Container>;
  if (!alter) return <Container sx={{ mt: 4 }}>Alter not found</Container>;

  // Computed normalized arrays
  const affiliationsNormalized = (() => {
    const raw = alter.affiliation || alter.affiliations;
    if (!raw && raw !== '') return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed))
          return parsed
            .map((s: string) => (typeof s === 'string' ? s.trim() : String(s)))
            .filter((s: string) => s.length > 0);
      } catch (e) {
        // not JSON
      }
      // comma-separated fallback
      if (raw.indexOf(',') !== -1)
        return raw
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      if (raw.trim() === '') return [];
      return [raw];
    }
    return [String(raw)];
  })();

  const partnersNormalized = (() => {
    const raw = (alter as any).partners;
    if (!raw && raw !== '') return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed))
          return parsed
            .map((s: string) => (typeof s === 'string' ? s.trim() : String(s)))
            .filter((s: string) => s.length > 0);
      } catch (e) {
        // not JSON
      }
      if (raw.indexOf(',') !== -1)
        return raw
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      if (raw.trim() === '') return [];
      return [raw];
    }
    return [String(raw)];
  })();

  return (
    <Container sx={{ mt: 4 }}>
      <DetailHeader
        alter={alter}
        user={user}
        renaming={renaming}
        renameVal={renameVal}
        renameError={renameError}
        onRenameValChange={setRenameVal}
        onStartRename={startRename}
        onCancelRename={cancelRename}
        onSaveRename={saveRename}
        onShare={handleShare}
        onPdfDownload={() => handlePdfDownload(id!)}
        onBack={() => nav(-1)}
      />

      <G container spacing={2} sx={{ mt: 2 }}>
        <G item xs={12} md={6}>
          <BasicInfoSection alter={alter} partnerLinks={partnerLinks} parentLinks={parentLinks} childLinks={childLinks} userRelationships={alter.user_relationships || []} />
        </G>
        <G item xs={12} md={6}>
          <WorkAffiliationsSection
            alter={alter}
            affiliationsNormalized={affiliationsNormalized}
            affiliationGroupsMap={affiliationGroupsMap}
            affiliationIdMap={affiliationIdMap}
            groupObj={groupObj}
            affiliationGroup={affiliationGroup}
            subsystemObj={subsystemObj}
          />
        </G>
        <G item xs={12}>
          <ListsSection alter={alter} />
        </G>
        <G item xs={12}>
          <NotesSection alter={alter} />
        </G>
      </G>

      <ImagesGallery
        alter={alter}
        user={user}
        onRemoveImage={(url, alterId) => setRemoveImageDialog({ open: true, url, id: alterId })}
      />

      <Typography variant="h6" sx={{ mt: 2 }}>
        Soul songs
      </Typography>
      {renderEmbeds(alter.soul_songs)}

      <InputPromptDialog
        open={shareDialog.open}
        title={shareDialog.url ? 'Share link copied' : 'Share link'}
        label={shareDialog.url || ''}
        defaultValue={shareDialog.url || ''}
        onCancel={closeShareDialog}
        onSubmit={closeShareDialog}
      />

      <DeleteConfirmDialog
        open={removeImageDialog.open}
        label={removeImageDialog.url}
        onCancel={() => setRemoveImageDialog({ open: false, url: '', id: null })}
        onConfirm={async () => {
          try {
            const resp = await deleteAlterImage(removeImageDialog.id, removeImageDialog.url).catch(() => null);
            if (!resp || resp.error) {
              logger.warn('Failed to delete image', resp);
            } else {
              refetch();
            }
          } catch (e) {
            logger.warn('delete image error', e);
          } finally {
            setRemoveImageDialog({ open: false, url: '', id: null });
          }
        }}
      />

      <NotificationSnackbar
        open={pdfSnackOpen}
        onClose={closePdfSnack}
        message={pdfError}
        severity={"error"}
      />
    </Container>
  );
}
