import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Grid, Typography } from '@mui/material';

const G: any = Grid;
import ConfirmDialog from '../components/ConfirmDialog';
import ImagesGallery from '../components/ImagesGallery';
import BasicInfoSection from '../components/BasicInfoSection';
import WorkAffiliationsSection from '../components/WorkAffiliationsSection';
import { ListsSection, NotesSection } from '../components/DetailSections';
import DetailHeader from '../components/DetailHeader';
import logger from '../logger';
import { apiClient } from '@didhub/api-client';
import { renderEmbeds } from '../utils/detailUtils';
import { useAlterData } from '../hooks/useAlterData';
import { useAlterLinks } from '../hooks/useAlterLinks';

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

  // Dialog states
  const [removeImageDialog, setRemoveImageDialog] = React.useState<{
    open: boolean;
    url: string;
    id: number | string | null;
  }>({ open: false, url: '', id: null });

  if (loading) return <Container sx={{ mt: 4 }}>Loading...</Container>;
  if (error) return <Container sx={{ mt: 4 }}>Error: {error}</Container>;
  if (!alter) return <Container sx={{ mt: 4 }}>Alter not found</Container>;

  return (
    <Container sx={{ mt: 4 }}>
      <DetailHeader
        alter={alter}
        user={user}
        onAlterUpdate={refetch}
        onBack={() => nav(-1)}
      />

      <G container spacing={2} sx={{ mt: 2 }}>
        <G item xs={12} md={6}>
          <BasicInfoSection
            alter={alter}
          />
        </G>
        <G item xs={12} md={6}>
          <WorkAffiliationsSection
            alter={alter}
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
        onRemoveImage={(url, alterId) => setRemoveImageDialog({ open: true, url, id: alterId })}
      />

      <Typography variant="h6" sx={{ mt: 2 }}>
        Soul songs
      </Typography>
      {renderEmbeds(alter.soul_songs)}

      <ConfirmDialog
        open={removeImageDialog.open}
        label={removeImageDialog.url}
        onClose={() => setRemoveImageDialog({ open: false, url: '', id: null })}
        onConfirm={async () => {
          try {
            if (removeImageDialog.id == null) return;
            await apiClient.alters.removeImage(removeImageDialog.id, removeImageDialog.url);
            await refetch();
          } catch (e) {
            logger.warn('delete image error', e);
          } finally {
            setRemoveImageDialog({ open: false, url: '', id: null });
          }
        }}
      />
    </Container>
  );
}
