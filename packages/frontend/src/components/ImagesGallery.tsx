import React from 'react';
import { ImageList, ImageListItem, Button } from '@mui/material';
import type { Alter, User } from '@didhub/api-client';

export interface ImagesGalleryProps {
  alter: Alter;
  user: User | null;
  onRemoveImage: (url: string, alterId: number | string) => void;
}

export default function ImagesGallery(props: ImagesGalleryProps) {
  if (!props.alter.images || !Array.isArray(props.alter.images) || props.alter.images.length === 0) {
    return null;
  }

  return (
    <ImageList cols={3} sx={{ mt: 2 }}>
      {props.alter.images.map((u: string, i: number) => (
        <ImageListItem key={i} sx={{ position: 'relative' }}>
          <img src={u} alt={`image-${i}`} loading="lazy" />
          {props.user && (props.user.id === props.alter.owner_user_id || props.user.is_admin) ? (
            <Button
              size="small"
              onClick={() => props.onRemoveImage(u, props.alter.id)}
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
