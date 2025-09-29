import React from 'react';
import {
  CircularProgress,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export interface SigilUploadProps {
  sigilUrl: string | null;
  uploading: boolean;
  drag: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

export default function SigilUpload(props: SigilUploadProps) {
  return (
    <div
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      style={{
        border: '1px dashed ' + (props.drag ? '#1976d2' : '#999'),
        padding: 8,
        borderRadius: 6,
        position: 'relative',
        minWidth: 140,
        minHeight: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <label
        style={{
          cursor: 'pointer',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 4,
          fontSize: 11,
        }}
      >
        {props.uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <CircularProgress size={26} />
            <span>Uploading…</span>
          </div>
        ) : props.sigilUrl ? (
          <div style={{ position: 'relative' }}>
            <img
              src={props.sigilUrl}
              alt="sigil"
              style={{
                maxWidth: 120,
                maxHeight: 70,
                objectFit: 'cover',
                borderRadius: 4,
                border: '1px solid #ccc',
              }}
            />
            <IconButton
              size="small"
              sx={{ position: 'absolute', top: -10, right: -10, background: '#fff' }}
              onClick={(e) => {
                e.preventDefault();
                props.onRemove();
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </div>
        ) : (
          <>
            <span style={{ opacity: 0.8 }}>Drag & drop sigil</span>
            <span style={{ opacity: 0.6 }}>or click to select</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={props.onFileSelect}
        />
      </label>
    </div>
  );
}