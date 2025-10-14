import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { listUsers } from '../../services/adminService';
import { normalizeEntityId } from '../../shared/utils/alterFormUtils';

import { useAuth } from '../../shared/contexts/AuthContext';
import SystemHeader from '../../components/common/SystemHeader';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';
import AltersTab from '../../features/system/AltersTab';
import GroupsTab from '../../features/system/GroupsTab';
import SubsystemsTab from '../../features/system/SubsystemsTab';

export default function DIDSystemView(): React.ReactElement {
  const { uid } = useParams() as { uid?: string };
  const nav = useNavigate();
  const { user: me } = useAuth() as { user?: any };

  // Basic state
  const [search, setSearch] = useState('');
  const [hideDormant, setHideDormant] = useState(false);
  const [hideMerged, setHideMerged] = useState(false);
  const [tab, setTab] = useState(0);
  const [systems, setSystems] = useState<any[]>([]);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  // Load systems list
  useEffect(() => {
    (async () => {
      try {
        const users = (await listUsers({ perPage: 1000 } as any)) as any[] | null;
        const systems = (users || []).filter((u) => u.is_system);
        setSystems(systems || []);
      } catch {
        // Ignore errors when fetching systems
      }
    })();
  }, []);

  // Auto-navigation for system users
  useEffect(() => {
    if (!uid && me && me.is_system) {
      try {
        nav(`/did-system/${me.id}`);
      } catch {
        // Ignore navigation errors
      }
    }
  }, [uid, me, nav]);

  // Read initial tab from query param (supports numeric index or key)
  const location = useLocation();
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const t = params.get('tab');
      if (!t) return;
      const idx = Number(t);
      if (!Number.isNaN(idx) && idx >= 0 && idx <= 2) {
        setTab(idx);
        return;
      }

      // support keys: alters, groups, subsystems
      const keyMap: Record<string, number> = { alters: 0, groups: 1, subsystems: 2 };
      if (t && keyMap[t as string] !== undefined) setTab(keyMap[t]);
    } catch (e) {
      // ignore
    }
  }, [location.search]);

  // Computed values
  const currentSystem = systems.find((s) => normalizeEntityId(s.user_id) === normalizeEntityId(uid));
  const canManage = me && (me.is_admin || (me.is_system && normalizeEntityId(me.id) === normalizeEntityId(uid)));
  const readOnly = !!uid && !canManage;

  return (
    <div style={{ padding: 20 }}>
      <SystemHeader
        tab={tab}
        onTabChange={(e: React.SyntheticEvent, v: number) => {
          setTab(v);
          try {
            const params = new URLSearchParams(location.search);
            const keyMap = ['alters', 'groups', 'subsystems'];
            params.set('tab', keyMap[v] || String(v));
            nav({ search: params.toString() });
          } catch (e) {
            // ignore
          }
        }}
        systems={systems}
        currentSystem={currentSystem}
        onSystemChange={(_e: React.SyntheticEvent, v: any | null) => {
          if (!v) {
            nav(`/systems`);
          } else nav(`/did-system/${(v as any).user_id}`);
        }}
        search={search}
        onSearchChange={setSearch}
        loading={false}
        hideDormant={hideDormant}
        onHideDormantChange={setHideDormant}
        hideMerged={hideMerged}
        onHideMergedChange={setHideMerged}
        readOnly={readOnly}
      />
      {tab === 0 && <AltersTab routeUid={uid} />}

      {tab === 1 && <GroupsTab uid={uid} />}

      {tab === 2 && <SubsystemsTab uid={uid} />}

      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
