import React from 'react';
import { Paper, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Alter, Group, Subsystem } from '@didhub/api-client';

export interface WorkAffiliationsSectionProps {
  alter: Alter;
  affiliationsNormalized: (string | number)[];
  affiliationGroupsMap: Record<string, Group>;
  affiliationIdMap: Record<number | string, Group>;
  groupObj: Group | null;
  affiliationGroup: Group | null;
  subsystemObj: Subsystem | null;
}

export default function WorkAffiliationsSection(props: WorkAffiliationsSectionProps) {
  const affiliationsNormalized = props.affiliationsNormalized.length ? (
    props.affiliationsNormalized.map((af: any, idx: number) => {
      let g: Group | null = null;
      // number or numeric string -> check id map first
      if (typeof af === 'number' || (!Number.isNaN(Number(af)) && String(af).trim() !== '')) {
        const maybeId = typeof af === 'number' ? af : Number(af);
        if (!Number.isNaN(maybeId) && props.affiliationIdMap && props.affiliationIdMap[maybeId]) {
          g = props.affiliationIdMap[maybeId];
        }
      }
      // fallback to name map
      if (!g) {
        const key = String(af);
        if (props.affiliationGroupsMap && props.affiliationGroupsMap[key]) g = props.affiliationGroupsMap[key];
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
  ) : props.groupObj ? (
    <Chip
      component={RouterLink}
      to={`/groups/${props.groupObj.id}`}
      label={props.groupObj.name || `#${props.groupObj.id}`}
      clickable
      size="small"
    />
  ) : props.affiliationGroup ? (
    <Chip
      component={RouterLink}
      to={`/groups/${props.affiliationGroup.id}`}
      label={props.affiliationGroup.name || `#${props.affiliationGroup.id}`}
      clickable
      size="small"
    />
  ) : props.alter.affiliation ? (
    String(props.alter.affiliation)
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
        <strong>Affiliation:</strong> {affiliationsNormalized}
      </div>
      <div>
        <strong>Weapon:</strong> {props.alter.weapon || '-'}
      </div>
      <div>
        <strong>Subsystem:</strong>{' '}
        {props.subsystemObj ? (
          <Chip
            component={RouterLink}
            to={`/subsystems/${props.subsystemObj.id}`}
            label={props.subsystemObj.name || `#${props.subsystemObj.id}`}
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
