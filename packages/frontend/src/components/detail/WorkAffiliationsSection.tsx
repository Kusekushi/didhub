import React, { useEffect, useState } from 'react';
import { normalizeEntityId } from '../../shared/utils/alterFormUtils';
import { Paper, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAffiliationResolution } from '../../shared/hooks/useAffiliationResolution';
import { useGroupResolution, useSubsystemResolution } from '../../shared/hooks/useEntityResolution';
import NotificationSnackbar, { SnackbarMessage } from '../ui/NotificationSnackbar';
import { ApiAlter, ApiGroupOut } from '@didhub/api-client';

export interface WorkAffiliationsSectionProps {
  alter: ApiAlter & {
    affiliations?: unknown;
    subsystem?: unknown;
    group?: unknown;
    job?: unknown;
    weapon?: unknown;
  };
}

export default function WorkAffiliationsSection(props: WorkAffiliationsSectionProps) {
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'error' });
  const [invalidIdsQueue, setInvalidIdsQueue] = useState<string[]>([]);
  const { affiliationGroupsMap, affiliationIdMap } = useAffiliationResolution(props.alter.affiliations);
  const groupObj = useGroupResolution(props.alter.group as string | number | null | undefined);
  const subsystemObj = useSubsystemResolution(props.alter.subsystem as string | number | null | undefined);

  // For affiliationGroup, we need to determine if we should show a primary affiliation
  // This is a simplified version - we might want more complex logic
  const affiliationGroup = null;

  // Computed normalized arrays (IDs are strings)
  const affiliationsNormalized = Array.isArray(props.alter.affiliations)
    ? props.alter.affiliations.map((id) => normalizeEntityId(id)).filter((s): s is string => !!s)
    : [];

  const affiliationsChips = affiliationsNormalized.length ? (
    affiliationsNormalized.map((af: string, idx: number) => {
      let g: ApiGroupOut | null = null;
      const key = String(af);
      if (affiliationIdMap && affiliationIdMap[key]) {
        g = affiliationIdMap[key];
      }
      // fallback to name map
      if (!g) {
        if (affiliationGroupsMap && affiliationGroupsMap[key]) g = affiliationGroupsMap[key];
      }
      return g ? (
        <Chip
          key={idx}
          component={RouterLink}
          to={`/detail/affiliation/${normalizeEntityId(g.id) ?? ''}`}
          label={g.name || `#${normalizeEntityId(g.id) ?? ''}`}
          clickable
          size="small"
          sx={{ mr: 1, mb: 1 }}
        />
      ) : (
        (() => {
          setInvalidIdsQueue((q) => (q.includes(String(af)) ? q : [...q, String(af)]));
          return null;
        })()
      );
    })
  ) : groupObj ? (
    <Chip
      component={RouterLink}
      to={`/detail/affiliation/${groupObj.id}`}
      label={groupObj.name || `#${groupObj.id}`}
      clickable
      size="small"
    />
  ) : affiliationGroup ? (
    <Chip
      component={RouterLink}
      to={`/detail/affiliation/${affiliationGroup.id}`}
      label={affiliationGroup.name || `#${affiliationGroup.id}`}
      clickable
      size="small"
    />
  ) : (
    '-'
  );

  // notify once for the first invalid id queued
  useEffect(() => {
    if (invalidIdsQueue.length === 0) return;
    const id = invalidIdsQueue[0];
    setSnack({ open: true, message: `Invalid affiliation id: ${id}`, severity: 'warning' });
    setInvalidIdsQueue([]);
  }, [invalidIdsQueue]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2">Work & Affiliations</Typography>
      <div>
        <strong>Job:</strong> {String((props.alter as any).job ?? '-')}
      </div>
      <div>
        <strong>Affiliations:</strong> {affiliationsChips}
      </div>
      <div>
        <strong>Weapon:</strong> {String((props.alter as any).weapon ?? '-')}
      </div>
      <div>
        <strong>Subsystem:</strong>{' '}
        {subsystemObj ? (
          <Chip
            component={RouterLink}
            to={`/detail/subsystem/${subsystemObj.id}`}
            label={subsystemObj.name || `#${subsystemObj.id}`}
            clickable
            size="small"
          />
        ) : props.alter.subsystem ? (
          <Chip label={String(props.alter.subsystem)} size="small" sx={{ ml: 1 }} />
        ) : (
          '-'
        )}
      </div>
      <NotificationSnackbar
        open={snack.open}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        message={snack.message}
        severity={snack.severity}
      />
    </Paper>
  );
}
