import React from 'react';
import { Paper, Typography } from '@mui/material';
import type { Alter } from '@didhub/api-client';
import ReactMarkdown from 'react-markdown';
import { normalizeToArray } from '../../shared/utils/detailUtils';

export interface GenericSectionProps {
  alter: Alter;
}

export function ListsSection(props: GenericSectionProps) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2">Lists</Typography>
      <div>
        <strong>Soul songs:</strong>{' '}
        {(() => {
          const items = normalizeToArray(props.alter.soul_songs);
          return items.length ? items.join(', ') : '-';
        })()}
      </div>
      <div>
        <strong>Interests:</strong>{' '}
        {(() => {
          const items = normalizeToArray(props.alter.interests);
          return items.length ? items.join(', ') : '-';
        })()}
      </div>
      <div>
        <strong>Triggers:</strong> {props.alter.triggers || '-'}
      </div>
    </Paper>
  );
}

export function NotesSection(props: GenericSectionProps) {
  const notes = props.alter.notes || '';

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2">Notes</Typography>
      <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
        <ReactMarkdown>{notes}</ReactMarkdown>
      </div>
    </Paper>
  );
}
