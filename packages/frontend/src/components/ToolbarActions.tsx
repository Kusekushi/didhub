import React from 'react';
import { IconButton } from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';

interface ToolbarActionsProps {
  mode: 'light' | 'dark';
  toggle: () => void;
}

/**
 * Toolbar actions component with theme toggle
 */
export default function ToolbarActions({ mode, toggle }: ToolbarActionsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <IconButton color="inherit" onClick={toggle} sx={{ mr: 1 }}>
        {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
      </IconButton>
      {/* Navigation is provided via AppProvider navigation and rendered in the sidebar */}
    </div>
  );
}