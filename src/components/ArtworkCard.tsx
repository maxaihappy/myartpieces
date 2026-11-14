import React from 'react';
import { Heart, MessageSquare } from 'lucide-react';
import type { Artwork } from '../types/gallery';
import { ProtectedArtworkImage } from './ProtectedArtworkImage';

interface ArtworkCardProps {
  artwork: Artwork;
  onSelect: (artwork: Artwork) => void;
  featuredSpan?: boolean;
}

const ASPECT_CLASS: Record<Artwork['aspectRatio'], string> = {
  '16:9': 'aspect-[16/9]',
  '4:3': 'aspect-[4/3]',
  '3:4': 'aspect-[3/4]',
  '1:1': 'aspect-square',
  auto: 'aspect-[4/3]',
};

export function ArtworkCard({ artwork, onSelect, featuredSpan = false }: ArtworkCardProps) {
  return (
    <article
      className={`group flex flex-col bg-[#0B0B0D] border border-zinc-800/80 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:border-zinc-700/90 ${
        featuredSpan ? 'md:col-span-2' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(artwork)}
        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B84B] focus-visible:ring-inset"
      >
        <div className={`w-full overflow-hidden bg-zinc-950 ${ASPECT_CLASS[artwork.aspectRatio] || 'aspect-[4/3]'}`}>
          <ProtectedArtworkImage
            src={artwork.imageUrl}
            alt={artwork.title}
            title={artwork.title}
            className="h-full w-full"
            imgClassName="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
          />
        </div>

        <div className="flex flex-col gap-1.5 p-5">
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
        </div>
      </button>
    </article>
  );
}
