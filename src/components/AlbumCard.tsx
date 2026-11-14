import React from 'react';
import { FolderOpen } from 'lucide-react';
import type { Album, AlbumVisibility } from '../types/gallery';
import { ProtectedArtworkImage } from './ProtectedArtworkImage';

interface AlbumCardProps {
  album: Album;
  onSelect: (albumId: string) => void;
  roleLabel?: string;
}

const VISIBILITY_LABEL: Record<AlbumVisibility, string> = {
  public: 'Public',
  unlisted: 'Direct Link',
  invite: 'Invite Only',
  private: 'Private',
};

export function AlbumCard({ album, onSelect, roleLabel }: AlbumCardProps) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-[#0B0B0D] transition-transform duration-200 hover:-translate-y-0.5 hover:border-zinc-700/90">
      <button
        type="button"
        onClick={() => onSelect(album.id)}
        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B84B] focus-visible:ring-inset"
      >
        <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-950">
          {album.coverUrl ? (
            <ProtectedArtworkImage
              src={album.coverUrl}
              alt={album.title}
              title={album.title}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 text-zinc-600">
              <FolderOpen className="h-8 w-8 mb-2" strokeWidth={1.25} />
              <span className="text-xs text-zinc-500">Empty Album</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 p-5">
          <h3 className="font-display text-xl font-medium leading-snug text-zinc-100 group-hover:text-[#E5B84B] transition-colors">
            {album.title}
          </h3>
          {album.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">
              {album.description}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="text-zinc-300">{album.ownerName}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {album.artCount} {album.artCount === 1 ? 'piece' : 'pieces'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{VISIBILITY_LABEL[album.visibility]}</span>
            {roleLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#E5B84B]">{roleLabel}</span>
              </>
            )}
          </div>
        </div>
      </button>
    </article>
  );
}
