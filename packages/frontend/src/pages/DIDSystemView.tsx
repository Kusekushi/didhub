import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import AlterFormDialog from '../components/AlterFormDialog';
import EditGroupDialog from '../components/system-tabs/GroupDialog';
import SystemHeader from '../components/SystemHeader';
import NotificationSnackbar, { SnackbarMessage } from '../components/NotificationSnackbar';
import AltersTab from '../components/system-tabs/AltersTab';
import GroupsTab from '../components/system-tabs/GroupsTab';
import SubsystemsTab from '../components/SubsystemsTab';
import { createShortLink, User } from '@didhub/api-client';
import { useSettings } from '../contexts/SettingsContext';

// Custom hooks
import { useAltersData } from '../hooks/useAltersData';
import { useGroupsData } from '../hooks/useGroupsData';
import { useSubsystemsData } from '../hooks/useSubsystemsData';
import { useAlterOptions } from '../hooks/useAlterOptions';
import { useDialogStates } from '../hooks/useDialogStates';
import { useGroupCreationState } from '../hooks/useGroupCreationState';
import { useGroupEditingState } from '../hooks/useGroupEditingState';
import { useSubsystemCreationState } from '../hooks/useSubsystemCreationState';
import { uploadFiles } from '../utils/fileUpload';

import {
  listSystems,
  deleteGroup,
  updateGroup,
  deleteAlter,
  createSubsystem,
  deleteSubsystem,
} from '@didhub/api-client';

export default function DIDSystemView(): React.ReactElement {
  const { uid } = useParams() as { uid?: string };
  const nav = useNavigate();
  const { user: me } = useAuth() as { user?: User };
  const settings = useSettings();

  // Basic state
  const [search, setSearch] = useState('');
  const [hideDormant, setHideDormant] = useState(false);
  const [hideMerged, setHideMerged] = useState(false);
  const [tab, setTab] = useState(0);
  const [systems, setSystems] = useState<User[]>([]);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  // Custom hooks for data management
  const { items: alters, loading: altersLoading, refresh: refreshAlters } = useAltersData(uid, search);
  const { items: groups, refresh: refreshGroups } = useGroupsData(uid, search, tab);
  const { items: subsystems, refresh: refreshSubsystems } = useSubsystemsData(uid, search, tab);
  const { altersOptions } = useAlterOptions(uid, '');

  // Dialog state management
  const dialogStates = useDialogStates();

  // Group creation state
  const groupCreationState = useGroupCreationState();

  // Group editing state
  const groupEditingState = useGroupEditingState();

  // Subsystem creation state
  const subsystemCreationState = useSubsystemCreationState();

  // Load systems list
  useEffect(() => {
    (async () => {
      try {
        const s = await listSystems();
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
  const currentSystem = systems.find((s) => String(s.user_id) === String(uid));
  const canManage = me && (me.is_admin || (me.is_system && String(me.id) === String(uid)));
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
        loading={altersLoading}
        hideDormant={hideDormant}
        onHideDormantChange={setHideDormant}
        hideMerged={hideMerged}
        onHideMergedChange={setHideMerged}
        readOnly={readOnly}
      />
      {tab === 0 && (
        <AltersTab
          canManage={canManage}
          createOpen={dialogStates.createOpen}
          setCreateOpen={dialogStates.setCreateOpen}
          items={alters}
          search={search}
          hideDormant={hideDormant}
          hideMerged={hideMerged}
          editingAlter={dialogStates.editingAlter}
          setEditingAlter={dialogStates.setEditingAlter}
          editOpen={dialogStates.editOpen}
          setEditOpen={dialogStates.setEditOpen}
          onDelete={async (alterId) => {
            await deleteAlter(alterId);
            await refreshAlters();
            setSnack({ open: true, message: 'Alter deleted', severity: 'success' });
          }}
          settings={settings}
          setSnack={setSnack}
          refreshAlters={refreshAlters}
        />
      )}

      <AlterFormDialog
        mode="edit"
        open={dialogStates.editOpen}
        id={dialogStates.editingAlter}
        onClose={() => {
          dialogStates.setEditOpen(false);
          dialogStates.setEditingAlter(null);
        }}
        onSaved={async () => {
          await refreshAlters();
          dialogStates.setEditOpen(false);
          dialogStates.setEditingAlter(null);
          setSnack({ open: true, message: 'Alter updated', severity: 'success' });
        }}
      />

      {tab === 1 && (
        <GroupsTab
          canManage={canManage}
          createGroupOpen={dialogStates.createGroupOpen}
          setCreateGroupOpen={dialogStates.setCreateGroupOpen}
          newGroupName={groupCreationState.newGroupName}
          setNewGroupName={groupCreationState.setNewGroupName}
          newGroupDesc={groupCreationState.newGroupDesc}
          setNewGroupDesc={groupCreationState.setNewGroupDesc}
          newGroupLeaders={groupCreationState.newGroupLeaders}
          setNewGroupLeaders={groupCreationState.setNewGroupLeaders}
          newGroupSigilFiles={groupCreationState.newGroupSigilFiles}
          setNewGroupSigilFiles={groupCreationState.setNewGroupSigilFiles}
          newGroupSigilUrl={groupCreationState.newGroupSigilUrl}
          setNewGroupSigilUrl={groupCreationState.setNewGroupSigilUrl}
          newGroupSigilUploading={groupCreationState.newGroupSigilUploading}
          setNewGroupSigilUploading={groupCreationState.setNewGroupSigilUploading}
          newGroupSigilDrag={groupCreationState.newGroupSigilDrag}
          setNewGroupSigilDrag={groupCreationState.setNewGroupSigilDrag}
          leaderQuery={groupCreationState.leaderQuery}
          setLeaderQuery={groupCreationState.setLeaderQuery}
          altersOptions={altersOptions}
          groups={groups}
          editingGroup={dialogStates.editingGroup}
          setEditingGroup={dialogStates.setEditingGroup}
          editGroupOpen={dialogStates.editGroupOpen}
          setEditGroupOpen={dialogStates.setEditGroupOpen}
          editingGroupSigilUploading={groupEditingState.editingGroupSigilUploading}
          setEditingGroupSigilUploading={groupEditingState.setEditingGroupSigilUploading}
          editingGroupSigilDrag={groupEditingState.editingGroupSigilDrag}
          setEditingGroupSigilDrag={groupEditingState.setEditingGroupSigilDrag}
          onDelete={async (groupId) => {
            await deleteGroup(groupId);
            await refreshGroups();
            setSnack({ open: true, message: 'Group deleted', severity: 'success' });
          }}
          settings={settings}
          setSnack={setSnack}
          refreshGroups={refreshGroups}
          uploadFiles={uploadFiles}
        />
      )}

      <EditGroupDialog
        mode="edit"
        open={dialogStates.editGroupOpen}
        onClose={() => {
          dialogStates.setEditGroupOpen(false);
          dialogStates.setEditingGroup(null);
        }}
        editingGroup={dialogStates.editingGroup}
        setEditingGroup={dialogStates.setEditingGroup}
        editingGroupSigilUploading={groupEditingState.editingGroupSigilUploading}
        setEditingGroupSigilUploading={groupEditingState.setEditingGroupSigilUploading}
        editingGroupSigilDrag={groupEditingState.editingGroupSigilDrag}
        setEditingGroupSigilDrag={groupEditingState.setEditingGroupSigilDrag}
        altersOptions={altersOptions}
        leaderQuery={groupCreationState.leaderQuery}
        setLeaderQuery={groupCreationState.setLeaderQuery}
        setSnack={setSnack}
        refreshGroups={refreshGroups}
        uploadFiles={uploadFiles}
      />

      {tab === 2 && (
        <SubsystemsTab
          canManage={canManage}
          createSubsystemOpen={dialogStates.createSubsystemOpen}
          setCreateSubsystemOpen={dialogStates.setCreateSubsystemOpen}
          newSubsystemName={subsystemCreationState.newSubsystemName}
          setNewSubsystemName={subsystemCreationState.setNewSubsystemName}
          newSubsystemDesc={subsystemCreationState.newSubsystemDesc}
          setNewSubsystemDesc={subsystemCreationState.setNewSubsystemDesc}
          newSubsystemType={subsystemCreationState.newSubsystemType}
          setNewSubsystemType={subsystemCreationState.setNewSubsystemType}
          subsystems={subsystems}
          uid={uid || ''}
          onDelete={async (subsystemId) => {
            await deleteSubsystem(subsystemId);
            await refreshSubsystems();
            setSnack({ open: true, message: 'Subsystem deleted', severity: 'success' });
          }}
          settings={settings}
          setSnack={setSnack}
          refreshSubsystems={refreshSubsystems}
          createSubsystem={createSubsystem}
          createShortLink={createShortLink}
          nav={nav}
        />
      )}

      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((s: any) => ({ ...s, open: false }))}
      />
    </div>
  );
}
