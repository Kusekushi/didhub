import { Button, IconButton, Tooltip } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';

export interface ActionButtonsProps {
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  canManage?: boolean;
  canShare?: boolean;
}

export default function ActionButtons(props: ActionButtonsProps) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Button variant="outlined" size="small" onClick={props.onView}>
        View
      </Button>
      {props.canManage && (
        <Button variant="outlined" size="small" onClick={props.onEdit}>
          Edit
        </Button>
      )}
      {props.canManage && (
        <Button variant="outlined" color="error" size="small" onClick={props.onDelete}>
          Delete
        </Button>
      )}
      <Tooltip title="Create share link and copy to clipboard">
        {props.canShare && (
          <IconButton size="small" onClick={props.onShare}>
            <ShareIcon fontSize="small" />
          </IconButton>
        )}
      </Tooltip>
    </div>
  );
}
