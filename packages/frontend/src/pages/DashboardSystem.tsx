import React, { useEffect, useState } from 'react';
import { Container, Typography, Grid, Paper } from '@mui/material';

import { apiClient } from '@didhub/api-client';

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
      // use API client methods to get totals
      const [aRes, gRes, sRes] = await Promise.all([
        apiClient.alters.list({ userId: uid, perPage: 1 }),
        apiClient.groups.listPaged({ owner_user_id: uid, limit: 1 }),
        apiClient.subsystems.listPaged({ owner_user_id: uid, limit: 1 }),
      ]);
      setCounts({
        alters: aRes.total ?? null,
        groups: gRes.total ?? null,
        subsystems: sRes.total ?? null,
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
