import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Grid, Typography } from '@mui/material';
import { apiClient } from '@didhub/api-client';

const G: any = Grid;
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ImagesGallery from '../../components/common/ImagesGallery';
import BasicInfoSection from '../../components/forms/BasicInfoSection';
import WorkAffiliationsSection from '../../components/forms/WorkAffiliationsSection';
import { ListsSection, NotesSection } from '../../components/common/DetailSections';
import DetailHeader from '../../components/common/DetailHeader';
import { renderEmbeds } from '../../shared/utils/detailUtils';
import { useAlterData } from '../../shared/hooks/useAlterData';
import { useAlterLinks } from '../../shared/hooks/useAlterLinks';
import { useAuth } from '../../shared/contexts/AuthContext';
import logger from '../../shared/lib/logger';

export interface DetailProps {
  alterId?: string;
}

export default function Detail(props: DetailProps = {}): React.ReactElement {
  const params = useParams() as { id?: string };
  const id = props.alterId ?? params.id;
  const nav = useNavigate();
  const { user } = useAuth();

  // Custom hooks
  const {
    alter,
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
  user={user ?? null}
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
              await apiClient.http.request({
                path: `/api/alters/${removeImageDialog.id}/image`,
                method: 'DELETE',
                json: { url: removeImageDialog.url },
              });
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
