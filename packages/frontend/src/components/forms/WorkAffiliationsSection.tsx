import React from 'react';
import { Paper, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { Alter, Group, Subsystem } from '@didhub/api-client';
import { useAffiliationResolution } from '../../shared/hooks/useAffiliationResolution';
import { useGroupResolution, useSubsystemResolution } from '../../shared/hooks/useEntityResolution';

export interface WorkAffiliationsSectionProps {
  alter: Alter;
}

export default function WorkAffiliationsSection(props: WorkAffiliationsSectionProps) {
  const { affiliationGroupsMap, affiliationIdMap } = useAffiliationResolution(props.alter.affiliations);
  const groupObj = useGroupResolution(props.alter.group as string | number | null | undefined);
  const subsystemObj = useSubsystemResolution(props.alter.subsystem as string | number | null | undefined);

  // For affiliationGroup, we need to determine if we should show a primary affiliation
  // This is a simplified version - in a real implementation, you might want more complex logic
  const affiliationGroup = null; // Simplified for now

  // Computed normalized arrays
  const affiliationsNormalized = Array.isArray(props.alter.affiliations)
    ? props.alter.affiliations.filter((id): id is number => typeof id === 'number')
    : [];

  const affiliationsChips = affiliationsNormalized.length ? (
    affiliationsNormalized.map((af: number, idx: number) => {
      let g: Group | null = null;
      const maybeId = Number.isFinite(af) ? af : Number.isFinite(Number(af)) ? Number(af) : NaN;
      if (!Number.isNaN(maybeId) && affiliationIdMap && affiliationIdMap[maybeId]) {
        g = affiliationIdMap[maybeId];
      }
      // fallback to name map
      if (!g) {
        const key = String(af);
        if (affiliationGroupsMap && affiliationGroupsMap[key]) g = affiliationGroupsMap[key];
      }
      return g ? (
        <Chip
          key={idx}
          component={RouterLink}
          to={`/groups/${g.id}`}
          label={g.name || `#${g.id}`}
          clickable
          size="small"
          sx={{ mr: 1, mb: 1 }}
        />
      ) : (
        <Chip key={idx} label={String(af)} size="small" sx={{ mr: 1, mb: 1 }} />
      );
    })
  ) : groupObj ? (
    <Chip
      component={RouterLink}
      to={`/groups/${groupObj.id}`}
      label={groupObj.name || `#${groupObj.id}`}
      clickable
      size="small"
    />
  ) : affiliationGroup ? (
    <Chip
      component={RouterLink}
      to={`/groups/${affiliationGroup.id}`}
      label={affiliationGroup.name || `#${affiliationGroup.id}`}
      clickable
      size="small"
    />
  ) : (
    '-'
  );

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
            to={`/subsystems/${subsystemObj.id}`}
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
    </Paper>
  );
}
