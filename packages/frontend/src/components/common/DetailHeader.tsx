import React from 'react';
import { Button, Typography, Tooltip, Box, IconButton } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import type { ApiAlter, ApiUser } from '@didhub/api-client';
import { useRename } from '../../shared/hooks/useRename';
import { usePdf } from '../../shared/hooks/usePdf';

export interface DetailHeaderProps {
  alter: ApiAlter;
  user: ApiUser | null;
  onAlterUpdate: () => void;
  onBack: () => void;
}

export default function DetailHeader(props: DetailHeaderProps) {
  const { renaming, renameVal, renameError, startRename, cancelRename, saveRename, setRenameVal } = useRename(
    props.alter,
    props.onAlterUpdate,
  );

  const { handlePdfDownload } = usePdf();

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button onClick={props.onBack}>← Back</Button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip title="Download PDF">
            <IconButton size="small" onClick={() => handlePdfDownload(props.alter.id!.toString())}>
              <PictureAsPdfIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 1 }}>
        {!renaming && <Typography variant="h4">{props.alter.name}</Typography>}
        {renaming && (
          <input
            autoFocus
            style={{ fontSize: 28, padding: '4px 8px' }}
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') await saveRename();
              if (e.key === 'Escape') cancelRename();
            }}
          />
        )}
        {props.user &&
          props.alter &&
          (props.user.is_admin || props.user.id === props.alter.owner_user_id) &&
          !renaming && (
            <Tooltip title="Rename alter">
              <Button size="small" onClick={startRename}>
                Rename
              </Button>
            </Tooltip>
          )}
        {renaming && (
          <>
            <Button
              size="small"
              variant="contained"
              onClick={saveRename}
              disabled={!renameVal.trim() || renameVal.trim() === props.alter.name}
            >
              Save
            </Button>
            <Button size="small" onClick={cancelRename}>
              Cancel
            </Button>
          </>
        )}
      </Box>

      {renameError && <div style={{ color: 'red', marginTop: -8, marginBottom: 4, fontSize: 12 }}>{renameError}</div>}

      <Typography variant="body1">{props.alter.description}</Typography>
    </>
  );
}
