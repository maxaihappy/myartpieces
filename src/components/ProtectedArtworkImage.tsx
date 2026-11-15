import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { resolveCloudMedia } from '../lib/galleryService';

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
  const isCloudRef = src.startsWith('cloud://media/');
  const [resolvedSrc, setResolvedSrc] = useState<string>(isCloudRef ? '' : src);
  const [loadingCloud, setLoadingCloud] = useState<boolean>(isCloudRef);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    setHasError(false);

    if (!src) {
      setResolvedSrc('');
      setLoadingCloud(false);
      return;
    }

    if (!src.startsWith('cloud://media/')) {
      setResolvedSrc(src);
      setLoadingCloud(false);
      return;
    }

    setLoadingCloud(true);
    resolveCloudMedia(src)
      .then((res) => {
        if (!active) return;
        if (res?.objectUrl) {
          setResolvedSrc(res.objectUrl);
        } else {
          setHasError(true);
        }
      })
      .catch(() => {
        if (active) setHasError(true);
      })
      .finally(() => {
        if (active) setLoadingCloud(false);
      });

    return () => {
      active = false;
    };
  }, [src]);

  if (loadingCloud) {
    return (
      <div
        className={`protected-artwork-surface relative animate-pulse bg-zinc-900/90 ${className}`}
        onContextMenu={(e) => e.preventDefault()}
      />
    );
  }

  if (!resolvedSrc || hasError) {
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
        src={resolvedSrc}
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
