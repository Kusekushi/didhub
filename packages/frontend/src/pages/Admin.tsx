import { Tabs, Tab, Snackbar, Alert, type AlertColor } from '@mui/material';
import React from 'react';
import { useEffect, useState } from 'react';
import {
  getAdminSettings,
  getAdminPosts,
  listSystemRequests,
  repostAdminPost,
  updateAdminSettings,
  setSystemRequestStatus,
  fetchMeVerified,
  listUsers,
  SETTINGS as SETTINGS_KEYS,
} from '@didhub/api-client';
import Housekeeping from './Housekeeping';
import AdminUploads from '../components/AdminUploads';
import SystemUpdates from '../components/SystemUpdates';
import {
  DashboardTab,
  UsersTab,
  PendingTab,
  SystemRequestsTab,
  SettingsTab,
  OidcProvidersTab,
  RedisTab,
  MessagesTab,
  AuditTab,
  MetricsTab,
} from '../components/admin';
import TabPanel from '../components/TabPanel';

export default function Admin() {
  const [tab, setTab] = useState(0);
  const handleTabChange = (_e, v) => setTab(v);
  const [settings, setSettings] = useState({}); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [webhook, setWebhook] = useState('');
  const [oidcProviders, setOidcProviders] = useState([]);
  const [discordDigestEnabled, setDiscordDigestEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(true);
  const [shortLinksEnabled, setShortLinksEnabled] = useState(true);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [redisUrl, setRedisUrl] = useState('');
  const [redisPrefixSetting, setRedisPrefixSetting] = useState('');
  const [redisTtlSecondsSetting, setRedisTtlSecondsSetting] = useState('');
  const [redisClientOptions, setRedisClientOptions] = useState('');
  const [redisSessionsEnabled, setRedisSessionsEnabled] = useState(false);
  const [redisCacheEnabled, setRedisCacheEnabled] = useState(false);
  const [uploadDirTtlSecs, setUploadDirTtlSecs] = useState('3600');
  const [status, setStatus] = useState('');
  const [me, setMe] = useState(null);
  const [posts, setPosts] = useState([]);
  const [sysRequests, setSysRequests] = useState([]);
  const [pendingRegsCount, setPendingRegsCount] = useState(0);
  const [pendingRegs, setPendingRegs] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [adminMsg, setAdminMsg] = useState<{ open: boolean; text: string; severity: AlertColor }>({
    open: false,
    text: '',
    severity: 'info',
  });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);

  // Map common Redis INFO keys to friendly labels for display
  useEffect(() => {
    (async () => {
      const m = await fetchMeVerified();
      setMe(m);
      const s = await getAdminSettings();
      setSettings(s || {});
      setWebhook(s && s[SETTINGS_KEYS.DISCORD_WEBHOOK_URL] ? s[SETTINGS_KEYS.DISCORD_WEBHOOK_URL] : '');
      setRedisUrl(s && s[SETTINGS_KEYS.REDIS_URL] ? s[SETTINGS_KEYS.REDIS_URL] : '');
      setRedisPrefixSetting(s && s[SETTINGS_KEYS.REDIS_PREFIX] ? s[SETTINGS_KEYS.REDIS_PREFIX] : '');
      setRedisTtlSecondsSetting(
        s && s[SETTINGS_KEYS.REDIS_TTL_SECONDS] ? String(s[SETTINGS_KEYS.REDIS_TTL_SECONDS]) : '',
      );
      setRedisClientOptions(
        s && s[SETTINGS_KEYS.REDIS_CLIENT_OPTIONS] ? String(s[SETTINGS_KEYS.REDIS_CLIENT_OPTIONS]) : '',
      );
      setUploadDirTtlSecs(
        s && s['uploads.upload_dir_cache.ttl_secs'] ? String(s['uploads.upload_dir_cache.ttl_secs']) : '3600',
      );
      const rsEnabledRaw =
        s && s[SETTINGS_KEYS.REDIS_SESSIONS_ENABLED] ? String(s[SETTINGS_KEYS.REDIS_SESSIONS_ENABLED]) : null;
      setRedisSessionsEnabled(rsEnabledRaw === '1' || rsEnabledRaw === 'true');
      const rcEnabledRaw =
        s && s[SETTINGS_KEYS.REDIS_CACHE_ENABLED] ? String(s[SETTINGS_KEYS.REDIS_CACHE_ENABLED]) : null;
      setRedisCacheEnabled(rcEnabledRaw === '1' || rcEnabledRaw === 'true');
      const parseBool = (v) => {
        if (v === null || typeof v === 'undefined') return false;
        const sv = String(v).toLowerCase();
        return sv === '1' || sv === 'true' || sv === 'yes';
      };
      setDiscordDigestEnabled(parseBool(s && s[SETTINGS_KEYS.DISCORD_DIGEST_ENABLED]));
      setEmailEnabled(parseBool(s && s[SETTINGS_KEYS.EMAIL_ENABLED]));
      // default to true to preserve existing behavior unless explicitly disabled
      setOidcEnabled(parseBool(s && s[SETTINGS_KEYS.OIDC_ENABLED]) || true);
      setShortLinksEnabled(parseBool(s && s[SETTINGS_KEYS.SHORT_LINKS_ENABLED]) || true);
      setAutoUpdateEnabled(parseBool(s && s['auto_update_enabled']));
      await loadPendingRegistrations();
    })();
  }, []);

  async function loadPendingRegistrations() {
    setLoadingPending(true);
    try {
      const r = await listUsers('', 1, 100, { is_approved: false });
      const items = (r && r.items) || [];
      setPendingRegs(items);
      setPendingRegsCount(r && r.total ? r.total : items.length);
    } catch {
      setPendingRegs([]);
      setPendingRegsCount(0);
    } finally {
      setLoadingPending(false);
    }
  }
  useEffect(() => {
    (async () => {
      const p = await getAdminPosts(page, perPage);
      setPosts((p && p.items) || []);
      try {
        const sr = await listSystemRequests();
        setSysRequests(sr || []);
      } catch {
        // Ignore errors when fetching system requests
      }
    })();
  }, [page]);

  // Early return after all hooks to avoid hook ordering issues
  if (!me || !me.is_admin) return <div style={{ padding: 20 }}>Admin only</div>;

  async function doRepost(id) {
    setStatus('Reposting...');
    const r = await repostAdminPost(id);
    if (r && r.reposted) setStatus('Reposted');
    else setStatus(r && r.error ? String(r.error) : 'Failed');
    setTimeout(() => setStatus(''), 2000);
  }

  async function save() {
    setStatus('Saving...');
    const r = await updateAdminSettings({
      [SETTINGS_KEYS.DISCORD_WEBHOOK_URL]: webhook || null,
      [SETTINGS_KEYS.OIDC_PROVIDERS]: JSON.stringify(oidcProviders || []),
      [SETTINGS_KEYS.DISCORD_DIGEST_ENABLED]: discordDigestEnabled ? '1' : '0',
      [SETTINGS_KEYS.EMAIL_ENABLED]: emailEnabled ? '1' : '0',
      [SETTINGS_KEYS.OIDC_ENABLED]: oidcEnabled ? '1' : '0',
      [SETTINGS_KEYS.SHORT_LINKS_ENABLED]: shortLinksEnabled ? '1' : '0',
      ['auto_update_enabled']: autoUpdateEnabled ? '1' : '0',
      // redis settings
      [SETTINGS_KEYS.REDIS_URL]: redisUrl || null,
      [SETTINGS_KEYS.REDIS_PREFIX]: redisPrefixSetting || null,
      [SETTINGS_KEYS.REDIS_TTL_SECONDS]: redisTtlSecondsSetting || null,
      [SETTINGS_KEYS.REDIS_CLIENT_OPTIONS]: redisClientOptions || null,
      [SETTINGS_KEYS.REDIS_SESSIONS_ENABLED]: redisSessionsEnabled ? '1' : '0',
      [SETTINGS_KEYS.REDIS_CACHE_ENABLED]: redisCacheEnabled ? '1' : '0',
      ['uploads.upload_dir_cache.ttl_secs']: uploadDirTtlSecs ? parseInt(uploadDirTtlSecs, 10) : 3600,
    });
    setSettings(r || {});
    setStatus('Saved');
    setTimeout(() => setStatus(''), 2000);
  }

  async function refreshSystemRequests() {
    try {
      const sr = await listSystemRequests();
      setSysRequests(sr || []);
    } catch {
      // ignore
    }
  }

  async function doSetRequestStatus(id, status) {
    try {
      const r = await setSystemRequestStatus(id, status);
      if (r && r.request) {
        setAdminMsg({ open: true, text: `Request ${status}`, severity: 'success' });
        await refreshSystemRequests();
      } else {
        setAdminMsg({ open: true, text: String((r && r.error) || 'Failed'), severity: 'error' });
      }
    } catch (e) {
      setAdminMsg({ open: true, text: String(e || 'Failed'), severity: 'error' });
    }
  }

  const tabsDef = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      render: () => <DashboardTab pendingRegsCount={pendingRegsCount} posts={posts} onRepost={doRepost} />,
    },
    { key: 'uploads', label: 'Uploads', render: () => <AdminUploads /> },
    { key: 'users', label: 'Users', render: () => <UsersTab /> },
    {
      key: 'pending',
      label: 'Pending',
      render: () => (
        <PendingTab
          pendingRegs={pendingRegs}
          loadingPending={loadingPending}
          onUserUpdate={loadPendingRegistrations}
          onSystemRequestsUpdate={setSysRequests}
          onMessage={setAdminMsg}
        />
      ),
    },
    {
      key: 'system',
      label: 'System Requests',
      render: () => <SystemRequestsTab sysRequests={sysRequests} onSetRequestStatus={doSetRequestStatus} />,
    },
    {
      key: 'settings',
      label: 'Settings',
      render: () => (
        <SettingsTab
          webhook={webhook}
          uploadDirTtlSecs={uploadDirTtlSecs}
          discordDigestEnabled={discordDigestEnabled}
          emailEnabled={emailEnabled}
          shortLinksEnabled={shortLinksEnabled}
          autoUpdateEnabled={autoUpdateEnabled}
          status={status}
          onWebhookChange={setWebhook}
          onUploadDirTtlChange={setUploadDirTtlSecs}
          onDiscordDigestChange={setDiscordDigestEnabled}
          onEmailEnabledChange={setEmailEnabled}
          onShortLinksChange={setShortLinksEnabled}
          onAutoUpdateChange={setAutoUpdateEnabled}
          onSave={save}
          onStatusChange={setStatus}
          onMessage={setAdminMsg}
        />
      ),
    },
    {
      key: 'oidc',
      label: 'OIDC Providers',
      render: () => (
        <OidcProvidersTab
          oidcProviders={oidcProviders}
          oidcEnabled={oidcEnabled}
          status={status}
          setOidcProviders={setOidcProviders}
          setStatus={setStatus}
          setSettings={setSettings}
          setAdminMsg={setAdminMsg}
        />
      ),
    },
    {
      key: 'redis',
      label: 'Redis',
      render: () => (
        <RedisTab
          redisUrl={redisUrl}
          redisPrefixSetting={redisPrefixSetting}
          redisTtlSecondsSetting={redisTtlSecondsSetting}
          redisClientOptions={redisClientOptions}
          redisSessionsEnabled={redisSessionsEnabled}
          redisCacheEnabled={redisCacheEnabled}
          status={status}
          setRedisUrl={setRedisUrl}
          setRedisPrefixSetting={setRedisPrefixSetting}
          setRedisTtlSecondsSetting={setRedisTtlSecondsSetting}
          setRedisClientOptions={setRedisClientOptions}
          setRedisSessionsEnabled={setRedisSessionsEnabled}
          setRedisCacheEnabled={setRedisCacheEnabled}
          setStatus={setStatus}
          setSettings={setSettings}
          setAdminMsg={setAdminMsg}
        />
      ),
    },
    {
      key: 'updates',
      label: 'System Updates',
      render: () => (
        <SystemUpdates
          onMessage={(message, severity) => setAdminMsg({ open: true, text: message, severity: severity || 'info' })}
        />
      ),
    },
    {
      key: 'messages',
      label: 'Messages',
      render: () => (
        <MessagesTab
          posts={posts}
          query={query}
          page={page}
          status={status}
          setQuery={setQuery}
          setPage={setPage}
          setStatus={setStatus}
          setAdminMsg={setAdminMsg}
        />
      ),
    },
    { key: 'audit', label: 'Audit Logs', render: () => <AuditTab setAdminMsg={setAdminMsg} /> },
    { key: 'housekeeping', label: 'Housekeeping', render: () => <Housekeeping /> },
    { key: 'metrics', label: 'Metrics', render: () => <MetricsTab /> },
  ];
  // Helper renderers for each panel — keeps the JSX organized and allows easy reordering.

  const panels = tabsDef.map((tdef) => tdef.render || (() => null));

  return (
    <div style={{ padding: 20 }}>
      <Tabs
        value={tab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ marginBottom: 2 }}
      >
        {tabsDef.map((tdef, i) => (
          <Tab key={tdef.key} label={tdef.label} id={`admin-tab-${i}`} aria-controls={`admin-tabpanel-${i}`} />
        ))}
      </Tabs>

      {tabsDef.map((tdef, i) => (
        <TabPanel key={tdef.key} value={tab} index={i} labelledBy={`admin-tab-${i}`}>
          {panels[i] ? panels[i]() : null}
        </TabPanel>
      ))}

      <Snackbar open={adminMsg.open} autoHideDuration={4000} onClose={() => setAdminMsg({ ...adminMsg, open: false })}>
        <Alert severity={adminMsg.severity} onClose={() => setAdminMsg({ ...adminMsg, open: false })}>
          {adminMsg.text}
        </Alert>
      </Snackbar>
    </div>
  );
}
