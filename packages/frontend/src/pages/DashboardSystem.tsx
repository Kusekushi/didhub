import React, { useEffect, useState } from 'react';
import { Container, Typography, Grid, Paper } from '@mui/material';

import { apiClient, HttpClient } from '@didhub/api-client';

const httpClient = new HttpClient();

function extractTotal(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { total?: unknown; items?: unknown };
  if (typeof record.total === 'number' && Number.isFinite(record.total)) return record.total;
  if (Array.isArray(record.items)) return record.items.length;
  return null;
}

export default function DashboardSystem(): React.ReactElement {
  const [counts, setCounts] = useState<{ alters: number | null; groups: number | null; subsystems: number | null }>({
    alters: null,
    groups: null,
    subsystems: null,
  });
  useEffect(() => {
    fetchOverview();
  }, []);
  async function fetchOverview() {
    try {
      const me = await apiClient.users.sessionIfAuthenticated();
      if (!me || !me.id) return;
      const uid = me.id;
      // use API endpoints that return totals when queried via owner_user_id
      const aRes = await httpClient.request<Record<string, unknown>>({
        path: '/api/alters',
        query: { user_id: uid, per_page: 1 },
        throwOnError: false,
      });
      const gRes = await httpClient.request<Record<string, unknown>>({
        path: '/api/groups',
        query: { owner_user_id: uid, per_page: 1 },
        throwOnError: false,
      });
      const sRes = await httpClient.request<Record<string, unknown>>({
        path: '/api/subsystems',
        query: { owner_user_id: uid, per_page: 1 },
        throwOnError: false,
      });
      const aJson = aRes?.data ?? null;
      const gJson = gRes?.data ?? null;
      const sJson = sRes?.data ?? null;
      setCounts({
        alters: extractTotal(aJson),
        groups: extractTotal(gJson),
        subsystems: extractTotal(sJson),
      });
    } catch (e) {}
  }
  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        System overview
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Alters</Typography>
            <Typography variant="h4">{counts.alters ?? '-'}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Groups</Typography>
            <Typography variant="h4">{counts.groups ?? '-'}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Subsystems</Typography>
            <Typography variant="h4">{counts.subsystems ?? '-'}</Typography>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
