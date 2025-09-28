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
import {
  listHousekeepingJobs,
  runHousekeepingJob,
  listHousekeepingRuns,
  clearHousekeepingRuns,
} from '@didhub/api-client';

export default function Housekeeping() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmJob, setConfirmJob] = useState<any | null>(null);
  const [confirmCandidates, setConfirmCandidates] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try {
      const j = await listHousekeepingJobs();
      setJobs((j && j.jobs) || []);
      const r = await listHousekeepingRuns(1, 50);
      setRuns((r && r.runs) || []);
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
      const res = await runHousekeepingJob(name, opts && opts.dry ? { dry: true } : {});
      await load();
      // if dry run returned candidates and dry=true, open confirm dialog
      if (opts && opts.dry && res && res.result && res.result.result && res.result.result.candidates) {
        setConfirmJob(name);
        setConfirmCandidates(res.result.result.candidates || []);
        setConfirmOpen(true);
      }
      return res;
    } catch (e) {
      await load();
      return null;
    }
  }

  async function confirmExecute() {
    if (!confirmJob) return;
    try {
      await runHousekeepingJob(confirmJob, { dry: false });
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
                case 'shortlinks_prune':
                  desc = 'Remove expired shortlinks';
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
                      control={<Switch checked={dryRun} onChange={(e) => setDryRun(Boolean(e.target.checked))} />}
                      label="Dry run"
                      sx={{ mr: 2 }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => onRun(jobName, { dry: dryRun })}
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
              await clearHousekeepingRuns();
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
