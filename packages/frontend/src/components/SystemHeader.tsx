import React from 'react';
import { Box, Tabs, Tab, Autocomplete, TextField, CircularProgress, InputAdornment, Alert } from '@mui/material';
import { User } from '@didhub/api-client';

interface SystemHeaderProps {
  tab: number;
  onTabChange: (event: React.SyntheticEvent, newValue: number) => void;
  systems: User[];
  currentSystem: User | null;
  onSystemChange: (event: React.SyntheticEvent, value: User | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  hideDormant: boolean;
  onHideDormantChange: (checked: boolean) => void;
  hideMerged: boolean;
  onHideMergedChange: (checked: boolean) => void;
  readOnly: boolean;
}

export default function SystemHeader({
  tab,
  onTabChange,
  systems,
  currentSystem,
  onSystemChange,
  search,
  onSearchChange,
  loading,
  hideDormant,
  onHideDormantChange,
  hideMerged,
  onHideMergedChange,
  readOnly,
}: SystemHeaderProps) {
  return (
    <>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={onTabChange}>
          <Tab label="Alters" />
          <Tab label="Groups" />
          <Tab label="Subsystems" />
        </Tabs>
      </Box>

      <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Autocomplete
          size="small"
          sx={{ minWidth: 320 }}
          options={systems || []}
          getOptionLabel={(s: User | string) => (s ? `${(s as User).username} (${(s as User).user_id})` : '')}
          value={currentSystem || null}
          onChange={onSystemChange}
          renderInput={(params: Parameters<typeof TextField>[0]) => <TextField {...params} label="System" />}
        />
        <TextField
          size="small"
          placeholder="Search alters"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
          sx={{ minWidth: 280 }}
          InputProps={{
            endAdornment: loading ? (
              <InputAdornment position="end">
                <CircularProgress size={16} />
              </InputAdornment>
            ) : null,
          }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input type="checkbox" checked={hideDormant} onChange={(e) => onHideDormantChange(e.target.checked)} />
            Hide Dormant
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input type="checkbox" checked={hideMerged} onChange={(e) => onHideMergedChange(e.target.checked)} />
            Hide Merged
          </label>
        </div>
      </div>
      {readOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Read-only view: you can browse this system's Alters, Groups, and Subsystems but you cannot create, edit or
          delete items.
        </Alert>
      )}
    </>
  );
}
