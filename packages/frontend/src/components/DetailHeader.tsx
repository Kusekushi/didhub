import React from 'react';
import { Button, Typography, Tooltip, Box } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ShareIcon from '@mui/icons-material/Share';
import { IconButton } from '@mui/material';
import { Alter, User } from '@didhub/api-client';
import { useSettings } from '../contexts/SettingsContext';

export interface DetailHeaderProps {
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

export default function DetailHeader(props: DetailHeaderProps) {
  const settings = useSettings();

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button onClick={props.onBack}>← Back</Button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#666' }}>
            Short links older than 1 month may be removed by housekeeping.
          </div>
          {settings.shortLinksEnabled && (
            <Tooltip title="Create share link and copy to clipboard">
              <IconButton size="small" onClick={props.onShare}>
                <ShareIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Download PDF">
            <IconButton size="small" onClick={props.onPdfDownload}>
              <PictureAsPdfIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 1 }}>
        {!props.renaming && <Typography variant="h4">{props.alter.name}</Typography>}
        {props.renaming && (
          <input
            autoFocus
            style={{ fontSize: 28, padding: '4px 8px' }}
            value={props.renameVal}
            onChange={(e) => props.onRenameValChange(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') await props.onSaveRename();
              if (e.key === 'Escape') props.onCancelRename();
            }}
          />
        )}
        {props.user && props.alter && (props.user.is_admin || props.user.id === props.alter.owner_user_id) && !props.renaming && (
          <Tooltip title="Rename alter">
            <Button size="small" onClick={props.onStartRename}>
              Rename
            </Button>
          </Tooltip>
        )}
        {props.renaming && (
          <>
            <Button
              size="small"
              variant="contained"
              onClick={props.onSaveRename}
              disabled={!props.renameVal.trim() || props.renameVal.trim() === props.alter.name}
            >
              Save
            </Button>
            <Button size="small" onClick={props.onCancelRename}>
              Cancel
            </Button>
          </>
        )}
      </Box>

      {props.renameError && (
        <div style={{ color: 'red', marginTop: -8, marginBottom: 4, fontSize: 12 }}>
          {props.renameError}
        </div>
      )}

      <Typography variant="body1">{props.alter.description}</Typography>
    </>
  );
}