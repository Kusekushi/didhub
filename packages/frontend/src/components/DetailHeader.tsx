import React from 'react';
import { Button, Typography, Tooltip, Box } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ShareIcon from '@mui/icons-material/Share';
import { IconButton } from '@mui/material';
import { Alter, User } from '@didhub/api-client';
import { useSettings } from '../contexts/SettingsContext';

interface DetailHeaderProps {
  alter: Alter;
  user: User | null;
  renaming: boolean;
  renameVal: string;
  renameError: string | null;
  onRenameValChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: () => void;
  onShare: () => void;
  onPdfDownload: () => void;
  onBack: () => void;
}

export default function DetailHeader({
  alter,
  user,
  renaming,
  renameVal,
  renameError,
  onRenameValChange,
  onStartRename,
  onCancelRename,
  onSaveRename,
  onShare,
  onPdfDownload,
  onBack,
}: DetailHeaderProps) {
  const settings = useSettings();

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button onClick={onBack}>← Back</Button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#666' }}>
            Short links older than 1 month may be removed by housekeeping.
          </div>
          {settings.shortLinksEnabled && (
            <Tooltip title="Create share link and copy to clipboard">
              <IconButton size="small" onClick={onShare}>
                <ShareIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Download PDF">
            <IconButton size="small" onClick={onPdfDownload}>
              <PictureAsPdfIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 1 }}>
        {!renaming && <Typography variant="h4">{alter.name}</Typography>}
        {renaming && (
          <input
            autoFocus
            style={{ fontSize: 28, padding: '4px 8px' }}
            value={renameVal}
            onChange={(e) => onRenameValChange(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') await onSaveRename();
              if (e.key === 'Escape') onCancelRename();
            }}
          />
        )}
        {user && alter && (user.is_admin || user.id === alter.owner_user_id) && !renaming && (
          <Tooltip title="Rename alter">
            <Button size="small" onClick={onStartRename}>
              Rename
            </Button>
          </Tooltip>
        )}
        {renaming && (
          <>
            <Button
              size="small"
              variant="contained"
              onClick={onSaveRename}
              disabled={!renameVal.trim() || renameVal.trim() === alter.name}
            >
              Save
            </Button>
            <Button size="small" onClick={onCancelRename}>
              Cancel
            </Button>
          </>
        )}
      </Box>

      {renameError && (
        <div style={{ color: 'red', marginTop: -8, marginBottom: 4, fontSize: 12 }}>
          {renameError}
        </div>
      )}

      <Typography variant="body1">{alter.description}</Typography>
    </>
  );
}