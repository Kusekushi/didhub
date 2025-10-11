import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '@didhub/api-client';
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
  const { user: me } = useAuth() as { user?: User };

  // Basic state
  const [search, setSearch] = useState('');
  const [hideDormant, setHideDormant] = useState(false);
  const [hideMerged, setHideMerged] = useState(false);
  const [tab, setTab] = useState(0);
  const [systems, setSystems] = useState<User[]>([]);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  // Load systems list
  useEffect(() => {
    (async () => {
      try {
        const s = await apiClient.users.systems();
        setSystems(s || []);
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

  // Computed values
  const currentSystem = systems.find((s) => normalizeEntityId(s.user_id) === normalizeEntityId(uid));
  const canManage = me && (me.is_admin || (me.is_system && normalizeEntityId(me.id) === normalizeEntityId(uid)));
  const readOnly = !!uid && !canManage;

  return (
    <div style={{ padding: 20 }}>
      <SystemHeader
        tab={tab}
        onTabChange={(e: React.SyntheticEvent, v: number) => setTab(v)}
        systems={systems}
        currentSystem={currentSystem}
        onSystemChange={(_e: React.SyntheticEvent, v: User | null) => {
          if (!v) {
            nav(`/systems`);
          } else nav(`/did-system/${(v as User).user_id}`);
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
