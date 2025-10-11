import React, { useEffect, useState } from 'react';
import { normalizeEntityId } from '../../shared/utils/alterFormUtils';
import { Paper, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { apiClient, parseRoles, type ApiAlter, type Group, type Subsystem } from '@didhub/api-client';
import { useAffiliationResolution } from '../../shared/hooks/useAffiliationResolution';
import { useGroupResolution, useSubsystemResolution } from '../../shared/hooks/useEntityResolution';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';

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
  // This is a simplified version - in a real implementation, you might want more complex logic
  const affiliationGroup = null; // Simplified for now

  // Computed normalized arrays (IDs are strings)
  const affiliationsNormalized = Array.isArray(props.alter.affiliations)
    ? props.alter.affiliations.map((id) => normalizeEntityId(id)).filter((s): s is string => !!s)
    : [];

  const affiliationsChips = affiliationsNormalized.length ? (
    affiliationsNormalized.map((af: string, idx: number) => {
      let g: Group | null = null;
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
        <strong>Job:</strong> {props.alter.job || '-'}
      </div>
      <div>
        <strong>Affiliations:</strong> {affiliationsChips}
      </div>
      <div>
        <strong>Weapon:</strong> {props.alter.weapon || '-'}
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
