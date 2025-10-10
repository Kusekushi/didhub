import React, { useState, useEffect } from 'react';
import { Typography, Paper, Stack, TextField, Button, FormControlLabel, Switch } from '@mui/material';
import { apiClient } from '@didhub/api-client';
import type { AlertColor } from '@mui/material';
import NotificationSnackbar from '../../components/ui/NotificationSnackbar';

function renderRedisInfo(info: Record<string, unknown> | undefined) {
  if (!info) return null;
  const map: Array<[string, string]> = [];
  const push = (label: string, key: string) => {
    if (info[key] != null) map.push([label, String(info[key])]);
  };
  push('Role', 'role');
  push('Redis version', 'redis_version');
  push('Uptime (sec)', 'uptime_in_seconds');
  push('Connected clients', 'connected_clients');
  push('Used memory', 'used_memory_human');
  push('Memory RSS', 'used_memory_rss_human');
  push('Evicted keys', 'evicted_keys');
  push('Total connections received', 'total_connections_received');
  push('Total commands processed', 'total_commands_processed');
  push('Instantaneous ops/sec', 'instantaneous_ops_per_sec');
  push('Keyspace hits', 'keyspace_hits');
  push('Keyspace misses', 'keyspace_misses');
  // include a few keyspace entries (db0, db1)
  Object.keys(info)
    .filter((k) => k.startsWith('db'))
    .slice(0, 4)
    .forEach((k) => map.push([k, String(info[k])]));

  if (map.length === 0) return <div>{JSON.stringify(info)}</div>;
  return (
    <div style={{ marginTop: 8 }}>
      {map.map(([label, val]) => (
        <div key={label} style={{ fontSize: 13 }}>
          <strong>{label}:</strong> {val}
        </div>
      ))}
    </div>
  );
}

export default function RedisTab() {
  const [redisUrl, setRedisUrl] = useState('');
  const [redisPrefixSetting, setRedisPrefixSetting] = useState('');
  const [redisTtlSecondsSetting, setRedisTtlSecondsSetting] = useState('');
  const [redisClientOptions, setRedisClientOptions] = useState('');
  const [redisSessionsEnabled, setRedisSessionsEnabled] = useState(false);
  const [redisCacheEnabled, setRedisCacheEnabled] = useState(false);
  const [redisStatus, setRedisStatusState] = useState<any | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; text: string; severity: AlertColor }>({ open: false, text: '', severity: 'info' });

  // Load Redis settings and status on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await apiClient.admin.get_settings();
        setRedisUrl(String(settings?.data.redis_url || ''));
        setRedisPrefixSetting(String(settings?.data.redis_prefix || ''));
        setRedisTtlSecondsSetting(String(settings?.data.redis_ttl_seconds || ''));
        setRedisClientOptions(String(settings?.data.redis_client_options || ''));
        setRedisSessionsEnabled(settings?.data.redis_sessions_enabled === '1' || settings?.data.redis_sessions_enabled === 'true');
        setRedisCacheEnabled(settings?.data.redis_cache_enabled === '1' || settings?.data.redis_cache_enabled === 'true');
      } catch (e) {
        setSnack({ open: true, text: `Failed to load Redis settings: ${e}`, severity: 'error' });
      }
    };

    const loadStatus = async () => {
      try {
        const rs = await apiClient.admin.get_admin_redis();
        setRedisStatusState(rs || null);
      } catch (e) {
        setRedisStatusState({ ok: false, error: String(e) });
      }
    };

    loadSettings();
    loadStatus();
  }, []);

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Redis
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Redis configuration (optional)
        </Typography>
        {redisStatus && redisStatus.ok && !redisUrl && (
          <Typography variant="body2" color="info.main" sx={{ mb: 2 }}>
            Redis is configured in the app config (config.json or environment variables).
          </Typography>
        )}
        <TextField
          fullWidth
          value={redisUrl}
          onChange={(e) => setRedisUrl(e.target.value)}
          placeholder="redis://localhost:6379"
          label="Redis URL"
          sx={{ mb: 2 }}
        />
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            value={redisPrefixSetting}
            onChange={(e) => setRedisPrefixSetting(e.target.value)}
            placeholder="sess:"
            label="Key prefix"
          />
          <TextField
            value={redisTtlSecondsSetting}
            onChange={(e) => setRedisTtlSecondsSetting(e.target.value)}
            placeholder="Session TTL (seconds)"
            label="TTL seconds"
          />
        </Stack>
        <FormControlLabel
          control={
            <Switch
              checked={redisSessionsEnabled}
              onChange={(e) => setRedisSessionsEnabled(e.target.checked)}
            />
          }
          label="Store sessions in Redis"
          sx={{ mb: 2 }}
        />
        <FormControlLabel
          control={
            <Switch checked={redisCacheEnabled} onChange={(e) => setRedisCacheEnabled(e.target.checked)} />
          }
          label="Enable Redis caching for server data"
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          multiline
          minRows={3}
          value={redisClientOptions}
          onChange={(e) => setRedisClientOptions(e.target.value)}
          placeholder='{"tls": {"rejectUnauthorized": false}}'
          label="Redis client options (JSON)"
        />
        <Button
          variant="contained"
          sx={{ mt: 2 }}
          disabled={!redisUrl}
          onClick={async () => {
            try {
              await apiClient.admin.put_settings({
                redis_url: redisUrl,
                redis_prefix: redisPrefixSetting,
                redis_ttl_seconds: redisTtlSecondsSetting,
                redis_client_options: redisClientOptions,
                redis_sessions_enabled: redisSessionsEnabled,
                redis_cache_enabled: redisCacheEnabled,
              });
              setSnack({ open: true, text: 'Redis settings saved', severity: 'success' });
            } catch (e) {
              setSnack({ open: true, text: `Failed to save: ${e}`, severity: 'error' });
            }
          }}
        >
          Save
        </Button>
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">Redis status</Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={async () => {
              try {
                const rs = await apiClient.admin.get_admin_redis();
                setRedisStatusState(rs || null);
              } catch (e) {
                setRedisStatusState({ ok: false, error: String(e) });
              }
            }}
          >
            Refresh
          </Button>
        </Stack>
        <Typography variant="body2" component="div" sx={{ mt: 1 }}>
          {redisStatus ? (
            redisStatus.ok ? (
              <>
                Connected
                {redisStatus.info ? renderRedisInfo(redisStatus.info) : <div style={{ marginTop: 8 }}>healthy</div>}
                {redisStatus.redis_config ? (
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    <strong>Redis config:</strong> prefix={redisStatus.redis_config.prefix || 'sess:'}, ttl_seconds=
                    {redisStatus.redis_config.ttl_seconds}
                  </div>
                ) : null}
              </>
            ) : (
              <>Unavailable — {redisStatus.error || 'unknown'}</>
            )
          ) : (
            'Unknown'
          )}
        </Typography>
      </Paper>
      <NotificationSnackbar
        open={snack.open}
        message={snack.text}
        severity={snack.severity}
        onClose={() => setSnack({ ...snack, open: false })}
      />
    </>
  );
}
