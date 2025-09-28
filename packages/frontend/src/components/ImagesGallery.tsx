import React from 'react';
import { ImageList, ImageListItem, Button } from '@mui/material';
import { Alter, User } from '@didhub/api-client';

interface ImagesGalleryProps {
  alter: Alter;
  user: User | null;
  onRemoveImage: (url: string, alterId: number | string) => void;
}

export default function ImagesGallery({ alter, user, onRemoveImage }: ImagesGalleryProps) {
  if (!alter.images || !Array.isArray(alter.images) || alter.images.length === 0) {
    return null;
  }

  return (
    <ImageList cols={3} sx={{ mt: 2 }}>
      {alter.images.map((u: string, i: number) => (
        <ImageListItem key={i} sx={{ position: 'relative' }}>
          <img src={u} alt={`image-${i}`} loading="lazy" />
          {user && (user.id === alter.owner_user_id || user.is_admin) ? (
            <Button
              size="small"
              onClick={() => onRemoveImage(u, alter.id)}
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
