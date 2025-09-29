import React from 'react';
import { Box, Tabs, Tab, Autocomplete, TextField, CircularProgress, InputAdornment, Alert } from '@mui/material';
import { User } from '@didhub/api-client';

export interface SystemHeaderProps {
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

export default function SystemHeader(props: SystemHeaderProps) {
  return (
    <>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={props.tab} onChange={props.onTabChange}>
          <Tab label="Alters" />
          <Tab label="Groups" />
          <Tab label="Subsystems" />
        </Tabs>
      </Box>

      <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Autocomplete
          size="small"
          sx={{ minWidth: 320 }}
          options={props.systems || []}
          getOptionLabel={(s: User | string) => (s ? `${(s as User).username} (${(s as User).user_id})` : '')}
          value={props.currentSystem || null}
          onChange={props.onSystemChange}
          renderInput={(params: Parameters<typeof TextField>[0]) => <TextField {...params} label="System" />}
        />
        <TextField
          size="small"
          placeholder="Search alters"
          value={props.search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.onSearchChange(e.target.value)}
          sx={{ minWidth: 280 }}
          slotProps={{
            input: {
              endAdornment: props.loading ? (
                <InputAdornment position="end">
                  <CircularProgress size={16} />
                </InputAdornment>
              ) : null,
            },
          }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={props.hideDormant}
              onChange={(e) => props.onHideDormantChange(e.target.checked)}
            />
            Hide Dormant
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={props.hideMerged}
              onChange={(e) => props.onHideMergedChange(e.target.checked)}
            />
            Hide Merged
          </label>
        </div>
      </div>
      {props.readOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Read-only view: you can browse this system's Alters, Groups, and Subsystems but you cannot create, edit or
          delete items.
        </Alert>
      )}
    </>
  );
}
