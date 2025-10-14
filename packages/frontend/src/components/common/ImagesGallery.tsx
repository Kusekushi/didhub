import React from 'react';
import { ImageList, ImageListItem, Button } from '@mui/material';
import type { ApiAlter } from '../../types/ui';
import { useAuth } from '../../shared/contexts/AuthContext';

export interface ImagesGalleryProps {
  alter: ApiAlter;
  onRemoveImage: (url: string, alterId: string) => void;
}

export default function ImagesGallery(props: ImagesGalleryProps) {
  const { user } = useAuth();

  if (!props.alter.images || !Array.isArray(props.alter.images) || props.alter.images.length === 0) {
    return null;
  }

  return (
    <ImageList cols={3} sx={{ mt: 2 }}>
      {props.alter.images.map((u: string, i: number) => (
        <ImageListItem key={i} sx={{ position: 'relative' }}>
          <img src={u} alt={`image-${i}`} loading="lazy" />
          {user && (user.id === props.alter.owner_user_id || user.is_admin) ? (
            <Button
              size="small"
              onClick={() => props.onRemoveImage(u, String(props.alter.id))}
              sx={{ position: 'absolute', top: 6, right: 6, zIndex: 10 }}
            >
              Remove
            </Button>
          ) : null}
        </ImageListItem>
      ))}
    </ImageList>
  );
}
