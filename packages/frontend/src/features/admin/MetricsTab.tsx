import React, { useState, useEffect } from 'react';
import { Typography, Paper, Stack, Button, TextField, FormControlLabel, Switch } from '@mui/material';
import * as adminService from '../../services/adminService';

export default function MetricsTab() {
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    let t: any;
      if (auto) {
      const run = async () => {
        try {
          setLoading(true);
          setRaw(await adminService.getMetrics() ?? `# fetch error: no data`);
        } catch (e) {
        } finally {
          setLoading(false);
          t = setTimeout(run, 5000);
        }
      };
      run();
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [auto]);
  async function load() {
    try {
      setLoading(true);
      setRaw(await adminService.getMetrics() ?? `# fetch error: no data`);
    } catch (e) {
      setRaw(`# fetch error: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }
  const lines = raw.split('\n').filter((l) => !filter || l.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div>
      <Typography variant="h5" gutterBottom>
        Metrics
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button variant="contained" onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
        <TextField size="small" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <FormControlLabel
          control={<Switch checked={auto} onChange={(e) => setAuto(e.target.checked)} />}
          label="Auto-refresh"
        />
      </Stack>
      <Paper
        sx={{
          p: 1,
          maxHeight: 400,
          overflow: 'auto',
          background: '#111',
          color: '#eee',
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </Paper>
      <Typography variant="body2" sx={{ mt: 1 }}>
        Showing {lines.length} lines.
      </Typography>
    </div>
  );
}
