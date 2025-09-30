import React from 'react';
import { Paper, Typography } from '@mui/material';
import type { Alter } from '@didhub/api-client';
import ReactMarkdown from 'react-markdown';

function normalizeToArray(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw))
    return (raw as any[]).map((s) => (typeof s === 'string' ? s.trim() : String(s))).filter((s) => s.length > 0);
  if (typeof raw === 'string') {
    const s = raw as string;
    if (s.trim() === '') return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed))
        return (parsed as any[]).map((x) => (typeof x === 'string' ? x.trim() : String(x))).filter((x) => x.length > 0);
    } catch (e) {
      // not JSON, fallthrough to comma-split
    }
    if (s.indexOf(',') !== -1)
      return s
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    return [s];
  }
  return [String(raw)];
}

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
