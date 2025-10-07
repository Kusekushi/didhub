import React, { useEffect, useState } from 'react';
import {
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  Stack,
  Divider,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { HttpClient } from '@didhub/api-client';

const httpClient = new HttpClient();

export default function Housekeeping() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmJob, setConfirmJob] = useState<any | null>(null);
  const [confirmCandidates, setConfirmCandidates] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try {
      const jobsResponse = await httpClient.request<Record<string, unknown>>({
        path: '/api/housekeeping/jobs',
        throwOnError: false,
      });
      const jobItems =
        jobsResponse.data &&
        typeof jobsResponse.data === 'object' &&
        Array.isArray((jobsResponse.data as { jobs?: unknown[] }).jobs)
          ? ((jobsResponse.data as { jobs?: unknown[] }).jobs as unknown[])
          : [];
      const jobNames = jobItems
        .map((item) => (typeof item === 'string' ? item : (item as { name?: unknown }).name))
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      setJobs(jobNames);

      // Initialize dry run state for each job
      const initialDryRun: Record<string, boolean> = {};
      jobNames.forEach(name => {
        initialDryRun[name] = true;
      });
      setDryRun(initialDryRun);

      const runsResponse = await httpClient.request<Record<string, unknown>>({
        path: '/api/housekeeping/runs',
        query: { limit: 50, offset: 0 },
        throwOnError: false,
      });
      const runItems =
        runsResponse.data &&
        typeof runsResponse.data === 'object' &&
        Array.isArray((runsResponse.data as { runs?: unknown[] }).runs)
          ? ((runsResponse.data as { runs?: unknown[] }).runs as unknown[])
          : [];
      setRuns(runItems);
    } catch (e) {
      console.error('Failed to load housekeeping data:', e);
      setJobs([]);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onRun(name: string, opts?: { dry?: boolean }) {
    try {
      const res = await httpClient.request<Record<string, unknown>>({
        path: `/api/housekeeping/trigger/${encodeURIComponent(name)}`,
        method: 'POST',
        json: opts?.dry ? { dry: true } : undefined,
        throwOnError: false,
      });
      await load();
      // if dry run returned candidates and dry=true, open confirm dialog
      const candidates =
        res.data && typeof res.data === 'object'
          ? ((res.data as { result?: { result?: { candidates?: unknown[] } } }).result?.result?.candidates ?? null)
          : null;
      if (opts && opts.dry && Array.isArray(candidates)) {
        setConfirmJob(name);
        setConfirmCandidates(candidates as unknown[]);
        setConfirmOpen(true);
      }
      return res.data ?? null;
    } catch (e) {
      await load();
      return null;
    }
  }

  async function confirmExecute() {
    if (!confirmJob) return;
    try {
      await httpClient.request({
        path: `/api/housekeeping/trigger/${encodeURIComponent(confirmJob)}`,
        method: 'POST',
        json: { dry: false },
        throwOnError: false,
      });
    } catch (e) {
      // ignore
    } finally {
      setConfirmOpen(false);
      setConfirmJob(null);
      setConfirmCandidates([]);
      await load();
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <Typography variant="h5" gutterBottom>
        Housekeeping
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1">Available jobs</Typography>
        {loading ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Loading jobs...
          </Typography>
        ) : jobs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No housekeeping jobs available
          </Typography>
        ) : (
          <List>
            {jobs.map((jobName) => {
              // Provide clearer descriptions for jobs based on their names
              let desc = '';
              switch (jobName) {
                case 'audit_retention':
                  desc = 'Remove old audit log entries based on retention policy';
                  break;
                case 'birthdays_digest':
                  desc = 'Generate digest of upcoming birthdays';
                  break;
                case 'uploads_gc':
                  desc = 'Clean up orphaned and old upload files';
                  break;
                case 'uploads_backfill':
                  desc = 'Add database entries for existing upload files';
                  break;
                case 'uploads_integrity':
                  desc = 'Check consistency between database and filesystem for uploads';
                  break;
                case 'orphans_prune':
                  desc = 'Remove orphaned group and subsystem memberships';
                  break;
                case 'db_vacuum':
                  desc = 'Optimize database storage and performance';
                  break;
                default:
                  desc = 'Housekeeping job';
                  break;
              }

              return (
                <ListItem key={jobName} sx={{ border: '1px solid #eee', mb: 1, borderRadius: 1 }}>
                  <ListItemText primary={jobName} secondary={desc} />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FormControlLabel
                      control={<Switch checked={dryRun[jobName] ?? true} onChange={(e) => setDryRun(prev => ({ ...prev, [jobName]: Boolean(e.target.checked) }))} />}
                      label="Dry run"
                      sx={{ mr: 2 }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => onRun(jobName, { dry: dryRun[jobName] ?? true })}
                      disabled={loading}
                    >
                      Run now
                    </Button>
                  </Stack>
                </ListItem>
              );
            })}
          </List>
        )}
      </Paper>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ mr: 2 }}>
          Recent runs
        </Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={async () => {
            try {
              setLoading(true);
              await httpClient.request({
                path: '/api/housekeeping/runs',
                method: 'POST',
                throwOnError: false,
              });
            } catch (e) {
              // ignore
            } finally {
              await load();
              setLoading(false);
            }
          }}
        >
          Clear recent runs
        </Button>
      </Stack>
      <Paper sx={{ p: 2 }}>
        {loading ? (
          <Typography variant="body2" color="text.secondary">
            Loading recent runs...
          </Typography>
        ) : runs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No recent runs found
          </Typography>
        ) : (
          <List>
            {runs.map((r) => (
              <ListItem key={r.id} sx={{ border: '1px solid #eee', mb: 1, borderRadius: 1 }}>
                <ListItemText
                  primary={`${r.job_name} — ${r.status}`}
                  secondary={
                    <div>
                      <div>Started: {r.started_at}</div>
                      {r.finished_at && <div>Finished: {r.finished_at}</div>}
                      {r.rows_affected !== null && <div>Rows affected: {r.rows_affected}</div>}
                      {r.message && (
                        <>
                          <Divider sx={{ my: 1 }} />
                          <div>Message: {r.message}</div>
                        </>
                      )}
                    </div>
                  }
                  secondaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </div>
  );
}
