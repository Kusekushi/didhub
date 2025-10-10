import React from 'react';
import { Container, Typography } from '@mui/material';
import { useParams, useSearchParams } from 'react-router-dom';

import Detail from './Detail';
import SubsystemDetail from './SubsystemDetail';
import GroupDetail from './GroupDetail';

function normalizeType(raw?: string | null): string {
  return (raw ?? '').toLowerCase();
}

export default function EntityDetail() {
  const params = useParams() as { entityType?: string; id?: string };
  const [searchParams] = useSearchParams();

  const entityType = normalizeType(params.entityType);
  const entityId = params.id;
  const systemUid = searchParams.get('uid') ?? undefined;

  if (!entityId) {
    return (
      <Container sx={{ mt: 4 }}>
        <Typography variant="h6">Missing entity identifier.</Typography>
      </Container>
    );
  }

  switch (entityType) {
    case 'alter':
    case 'alters':
      return <Detail alterId={entityId} />;
    case 'subsystem':
    case 'subsystems':
      return <SubsystemDetail subsystemId={entityId} systemUid={systemUid ?? undefined} />;
    case 'affiliation':
    case 'affiliations':
    case 'group':
    case 'groups':
      return <GroupDetail groupId={entityId} />;
    default:
      return (
        <Container sx={{ mt: 4 }}>
          <Typography variant="h6">Unknown entity type: {entityType || 'unspecified'}.</Typography>
        </Container>
      );
  }
}
