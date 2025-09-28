import React, { useEffect, useState } from 'react';
import { Container, Typography, Grid, Paper } from '@mui/material';

import { fetchMeVerified, apiFetch } from '@didhub/api-client';

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
      const me = await fetchMeVerified();
      if (!me || !me.id) return;
      const uid = me.id;
      // use API endpoints that return totals when queried via owner_user_id
      const aRes = await apiFetch(`/api/alters?user_id=${uid}&per_page=1`);
      const gRes = await apiFetch(`/api/groups?owner_user_id=${uid}&per_page=1`);
      const sRes = await apiFetch(`/api/subsystems?owner_user_id=${uid}&per_page=1`);
      const aJson = aRes && aRes.json ? (aRes.json as any) : null;
      const gJson = gRes && gRes.json ? (gRes.json as any) : null;
      const sJson = sRes && sRes.json ? (sRes.json as any) : null;
      setCounts({
        alters: aJson ? aJson.total || (aJson.items ? aJson.items.length : null) : null,
        groups: gJson ? gJson.total || (gJson.items ? gJson.items.length : null) : null,
        subsystems: sJson ? sJson.total || (sJson.items ? sJson.items.length : null) : null,
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
