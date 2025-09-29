import React, { useState } from 'react';

export interface ThumbnailWithHoverProps {
  image: string;
  alt: string;
  onClick?: () => void;
}

export default function ThumbnailWithHover(props: ThumbnailWithHoverProps) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  function handleMove(e: React.MouseEvent) {
    setPos({ x: e.clientX + 15, y: e.clientY + 15 });
  }
  return (
    <>
      <img
        src={props.image}
        alt={props.alt}
        style={{
          width: 40,
          height: 40,
          objectFit: 'cover',
          borderRadius: 4,
          cursor: 'pointer',
          border: '1px solid #ccc',
        }}
        onClick={props.onClick}
        onMouseEnter={(e) => {
          setHover(true);
          setPos({ x: e.clientX + 15, y: e.clientY + 15 });
        }}
        onMouseLeave={() => setHover(false)}
        onMouseMove={handleMove}
      />
      {hover && (
        <div
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            zIndex: 9999,
            border: '1px solid #999',
            background: '#fff',
            padding: 4,
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          <img src={props.image} alt={props.alt} style={{ maxWidth: 220, maxHeight: 220, display: 'block' }} />
        </div>
      )}
    </>
  );
}
