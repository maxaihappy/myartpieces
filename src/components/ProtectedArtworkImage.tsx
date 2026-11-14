import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface ProtectedArtworkImageProps {
  src: string;
  alt: string;
  title?: string;
  className?: string;
  imgClassName?: string;
  style?: React.CSSProperties;
}

export function ProtectedArtworkImage({
  src,
  alt,
  title,
  className = '',
  imgClassName = '',
  style,
}: ProtectedArtworkImageProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`protected-artwork-surface relative flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-[#0d0d10] to-zinc-950 p-6 text-center select-none ${className}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <ImageOff className="h-7 w-7 text-zinc-600 mb-3" strokeWidth={1.25} />
        <p className="font-display text-lg text-zinc-400 max-w-xs text-balance">
          {title || alt || 'Artwork Preview Unavailable'}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`protected-artwork-surface relative overflow-hidden select-none ${className}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        draggable={false}
        decoding="async"
        onError={() => setHasError(true)}
        style={style}
        className={`pointer-events-none select-none ${imgClassName}`}
      />
      {/* Transparent protective shield blocks direct right-click Save Image As and drag-to-desktop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 bg-transparent"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      />
    </div>
  );
}
