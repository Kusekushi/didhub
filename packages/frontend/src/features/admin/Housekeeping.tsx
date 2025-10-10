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
import { apiClient, type HousekeepingJob } from '@didhub/api-client';

type HousekeepingRunRecord = Awaited<ReturnType<typeof apiClient.admin.listHousekeepingRuns>>['runs'][number];

export default function Housekeeping() {
  const [jobs, setJobs] = useState<HousekeepingJob[]>([]);
  const [runs, setRuns] = useState<HousekeepingRunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmJob, setConfirmJob] = useState<string | null>(null);
  const [confirmCandidates, setConfirmCandidates] = useState<unknown[]>([]);

  async function load() {
    setLoading(true);
    try {
      const jobsResult = await apiClient.admin.get_housekeeping_jobs();
      setJobs(jobsResult.jobs);

      // Initialize dry run state for each job
      const initialDryRun: Record<string, boolean> = {};
      jobsResult.jobs.forEach(job => {
        initialDryRun[job.name] = true;
      });
      setDryRun(initialDryRun);

      const runsResult = await apiClient.admin.get_housekeeping_runs(1, 50);
      setRuns(runsResult.runs);
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
      const res = await apiClient.admin.post_housekeeping_trigger_by_name(name, { dry: opts?.dry });
      await load();
      // if dry run returned candidates and dry=true, open confirm dialog
      const candidates =
        res && typeof res === 'object'
          ? ((res as Record<string, unknown>).metadata as { result?: { result?: { candidates?: unknown[] } } } | undefined)?.result?.result?.candidates ?? null
          : null;
      if (opts && opts.dry && Array.isArray(candidates)) {
        setConfirmJob(name);
        setConfirmCandidates(candidates);
        setConfirmOpen(true);
      }
      return res ?? null;
    } catch (e) {
      await load();
      return null;
    }
  }

  async function confirmExecute() {
    if (!confirmJob) return;
    try {
      await apiClient.admin.post_housekeeping_trigger_by_name(confirmJob, { dry: false });
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
            {jobs.map((job) => {
              // Provide clearer descriptions for jobs based on their names
              let desc = job.description || '';
              switch (job.name) {
                case 'audit_retention':
                  desc = desc || 'Remove old audit log entries based on retention policy';
                  break;
                case 'birthdays_digest':
                  desc = desc || 'Generate digest of upcoming birthdays';
                  break;
                case 'uploads_gc':
                  desc = desc || 'Clean up orphaned and old upload files';
                  break;
                case 'uploads_backfill':
                  desc = desc || 'Add database entries for existing upload files';
                  break;
                case 'uploads_integrity':
                  desc = desc || 'Check consistency between database and filesystem for uploads';
                  break;
                case 'orphans_prune':
                  desc = desc || 'Remove orphaned group and subsystem memberships';
                  break;
                case 'db_vacuum':
                  desc = desc || 'Optimize database storage and performance';
                  break;
                default:
                  desc = desc || 'Housekeeping job';
                  break;
              }

              return (
                <ListItem key={job.name} sx={{ border: '1px solid #eee', mb: 1, borderRadius: 1 }}>
                  <ListItemText
                    primary={job.name}
                    secondary={
                      <div>
                        <div>{desc}</div>
                        {job.last_run && (
                          <div style={{ fontSize: '0.875rem', color: 'text.secondary', marginTop: 4 }}>
                            Last run: {new Date(job.last_run).toLocaleString()}
                          </div>
                        )}
                      </div>
                    }
                  />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FormControlLabel
                      control={<Switch checked={dryRun[job.name] ?? true} onChange={(e) => setDryRun(prev => ({ ...prev, [job.name]: Boolean(e.target.checked) }))} />}
                      label="Dry run"
                      sx={{ mr: 2 }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => onRun(job.name, { dry: dryRun[job.name] ?? true })}
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
              await apiClient.admin.clearHousekeepingRuns();
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
