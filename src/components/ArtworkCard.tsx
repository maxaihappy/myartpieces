import React, { useEffect, useState } from 'react';
import { Check, Heart, Loader2, MessageSquare, RotateCcw, RotateCw, X } from 'lucide-react';
import { useGallery } from '../contexts/GalleryContext';
import { rotateAndSaveArtwork } from '../lib/galleryService';
import type { Artwork } from '../types/gallery';
import { ProtectedArtworkImage } from './ProtectedArtworkImage';

interface ArtworkCardProps {
  artwork: Artwork;
  onSelect: (artwork: Artwork) => void;
  featuredSpan?: boolean;
  canRotate?: boolean;
  onArtworkUpdated?: (updated: Artwork) => void;
}

const ASPECT_CLASS: Record<Artwork['aspectRatio'], string> = {
  '16:9': 'aspect-[16/9]',
  '4:3': 'aspect-[4/3]',
  '3:4': 'aspect-[3/4]',
  '1:1': 'aspect-square',
  auto: 'aspect-[4/3]',
};

type RotationDegrees = 0 | 90 | 180 | 270;

export function ArtworkCard({
  artwork,
  onSelect,
  featuredSpan = false,
  canRotate = false,
  onArtworkUpdated,
}: ArtworkCardProps) {
  const { showToast } = useGallery();
  const [pendingRotation, setPendingRotation] = useState<RotationDegrees>(0);
  const [savingRotation, setSavingRotation] = useState(false);

  useEffect(() => {
    setPendingRotation(0);
  }, [artwork.id, artwork.imageUrl]);

  const handleRotateLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (savingRotation) return;
    setPendingRotation((prev) => (((prev + 270) % 360) as RotationDegrees));
  };

  const handleRotateRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (savingRotation) return;
    setPendingRotation((prev) => (((prev + 90) % 360) as RotationDegrees));
  };

  const handleCancelRotation = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (savingRotation) return;
    setPendingRotation(0);
  };

  const handleSaveRotation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingRotation === 0 || savingRotation) return;
    setSavingRotation(true);
    try {
      const updated = await rotateAndSaveArtwork(artwork, pendingRotation);
      onArtworkUpdated?.({
        ...artwork,
        imageUrl: updated.imageUrl,
        dimensions: updated.dimensions,
        aspectRatio: updated.aspectRatio,
      });
      setPendingRotation(0);
      showToast(`Saved rotation for "${artwork.title}".`);
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Could not save rotated photo.');
    } finally {
      setSavingRotation(false);
    }
  };

  const previewTransform =
    pendingRotation === 0
      ? undefined
      : `rotate(${pendingRotation}deg)${
          pendingRotation === 90 || pendingRotation === 270 ? ' scale(0.75)' : ''
        }`;

  return (
    <article
      className={`group flex flex-col bg-[#0B0B0D] border border-zinc-800/80 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:border-zinc-700/90 ${
        featuredSpan ? 'md:col-span-2' : ''
      }`}
    >
      <div
        className={`relative w-full overflow-hidden bg-zinc-950 ${
          ASPECT_CLASS[artwork.aspectRatio] || 'aspect-[4/3]'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(artwork)}
          className="block h-full w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B84B] focus-visible:ring-inset"
        >
          <ProtectedArtworkImage
            src={artwork.imageUrl}
            alt={artwork.title}
            title={artwork.title}
            className="h-full w-full"
            imgClassName={`h-full w-full transition-transform duration-300 ease-out ${
              pendingRotation === 90 || pendingRotation === 270
                ? 'object-contain'
                : 'object-cover group-hover:scale-[1.02]'
            }`}
            style={previewTransform ? { transform: previewTransform } : undefined}
          />
        </button>

        {canRotate && (
          <div
            className={`absolute top-3 right-3 z-20 flex items-center gap-1 rounded-lg border border-zinc-800/90 bg-[#0B0B0D]/90 p-1 backdrop-blur-sm transition-opacity ${
              pendingRotation !== 0
                ? 'opacity-100'
                : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
            }`}
          >
            <button
              type="button"
              onClick={handleRotateLeft}
              disabled={savingRotation}
              title="Rotate 90° left"
              aria-label="Rotate 90° left"
              className="rounded-md p-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-[#E5B84B] disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRotateRight}
              disabled={savingRotation}
              title="Rotate 90° right"
              aria-label="Rotate 90° right"
              className="rounded-md p-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-[#E5B84B] disabled:opacity-40"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {canRotate && pendingRotation !== 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-[#121216] px-4 py-2 text-xs">
          <span className="text-zinc-300 tabular-nums">Rotated {pendingRotation}°</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCancelRotation}
              disabled={savingRotation}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
            >
              <X className="h-3 w-3" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={handleSaveRotation}
              disabled={savingRotation}
              className="inline-flex items-center gap-1 rounded-lg bg-[#E5B84B] px-3 py-1 text-[11px] font-semibold text-[#050505] hover:bg-[#f0c761] disabled:opacity-60"
            >
              {savingRotation ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              <span>{savingRotation ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onSelect(artwork)}
        className="flex flex-col gap-1.5 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B84B] focus-visible:ring-inset"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-display text-xl font-medium leading-snug text-zinc-100 group-hover:text-[#E5B84B] transition-colors">
            {artwork.title}
          </h3>
          <div className="flex items-center gap-3 pt-1 text-xs text-zinc-500 tabular-nums shrink-0">
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" strokeWidth={1.5} />
              {artwork.likesCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
              {artwork.commentsCount}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span>{artwork.ownerName}</span>
          <span aria-hidden="true">·</span>
          <span>{artwork.medium}</span>
          {artwork.year && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{artwork.year}</span>
            </>
          )}
        </div>
      </button>
    </article>
  );
}
