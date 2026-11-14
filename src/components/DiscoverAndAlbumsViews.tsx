import React, { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import {
  FEATURED_ALBUMS,
  FEATURED_ARTWORKS,
  FEATURED_HERO_IMAGE,
} from '../data/featuredWorks';
import { useGallery } from '../contexts/GalleryContext';
import type { Album, Artwork } from '../types/gallery';
import { AlbumCard } from './AlbumCard';
import { ArtworkCard } from './ArtworkCard';
import { ProtectedArtworkImage } from './ProtectedArtworkImage';

const MEDIUM_FILTERS = [
  'All Works',
  'Fine Art Photography',
  'Sculpture & Relief',
  'Oil & Linen',
  'Light Installation',
  'Digital Painting',
];

interface DiscoverViewProps {
  onSelectArtwork: (artwork: Artwork) => void;
  onOpenAlbum: (albumId: string) => void;
  onNavigateAlbums: () => void;
  onOpenUpload: () => void;
}

export function DiscoverView({
  onSelectArtwork,
  onOpenAlbum,
  onNavigateAlbums,
  onOpenUpload,
}: DiscoverViewProps) {
  const { user, publicAlbums, publicArtworks, signInWithGoogle } = useGallery();
  const [selectedMedium, setSelectedMedium] = useState('All Works');
  const [searchQuery, setSearchQuery] = useState('');

  const allPublicAlbums = useMemo<Album[]>(() => {
    return [...publicAlbums, ...FEATURED_ALBUMS];
  }, [publicAlbums]);

  const allPublicArtworks = useMemo<Artwork[]>(() => {
    return [...publicArtworks, ...FEATURED_ARTWORKS];
  }, [publicArtworks]);

  const filteredArtworks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allPublicArtworks.filter((art) => {
      const matchesMedium =
        selectedMedium === 'All Works' ||
        art.medium.toLowerCase() === selectedMedium.toLowerCase();
      if (!matchesMedium) return false;
      if (!q) return true;
      return (
        art.title.toLowerCase().includes(q) ||
        art.ownerName.toLowerCase().includes(q) ||
        art.medium.toLowerCase().includes(q) ||
        art.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [allPublicArtworks, selectedMedium, searchQuery]);

  const heroArtwork = FEATURED_ARTWORKS[2]; // Amber Refraction Chamber

  return (
    <div className="mx-auto max-w-[1440px] px-6 lg:px-10 pb-20">
      {/* Split-Screen Editorial Hero */}
      <section className="pt-8 pb-10 lg:pt-12 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-5 flex flex-col justify-between py-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#E5B84B]">
                MAP · My Art Piece
              </p>
              <h1 className="mt-4 font-display text-4xl sm:text-5xl xl:text-[56px] font-medium leading-[1.06] tracking-tight text-zinc-100 text-wrap:balance">
                Where high-resolution art lives with quiet permanence.
              </h1>
              <p className="mt-5 max-w-md text-sm sm:text-base leading-relaxed text-zinc-400">
                Catalog your works in custom exhibitions, share publicly or strictly via invite-only Gmail permissions, and invite real-time dialogue without compromising original file ownership.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {user ? (
                <button
                  type="button"
                  onClick={onOpenUpload}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E5B84B] px-5 py-3 text-xs font-semibold tracking-wide text-[#050505] transition-colors hover:bg-[#f0c761]"
                >
                  <span>Upload Artwork</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E5B84B] px-5 py-3 text-xs font-semibold tracking-wide text-[#050505] transition-colors hover:bg-[#f0c761]"
                >
                  <span>Sign in to Curate</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={onNavigateAlbums}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-5 py-3 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600"
              >
                <span>Browse Exhibitions</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <button
              type="button"
              onClick={() => onSelectArtwork(heroArtwork)}
              className="group relative block h-full min-h-[320px] lg:min-h-[460px] w-full overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B84B]"
            >
              <ProtectedArtworkImage
                src={FEATURED_HERO_IMAGE}
                alt={heroArtwork.title}
                title={heroArtwork.title}
                className="h-full w-full lg:h-full"
                imgClassName="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
              />
              <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 p-6 sm:p-8">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#E5B84B]">
                  Featured Installation
                </p>
                <div className="mt-1.5 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                  <h2 className="font-display text-2xl sm:text-3xl font-medium text-white">
                    {heroArtwork.title}
                  </h2>
                  <p className="text-xs text-zinc-300">
                    {heroArtwork.ownerName} · {heroArtwork.medium} · {heroArtwork.year}
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Full-Width 4-Column Archive Strip */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-800/80">
          <div className="bg-[#0B0B0D] px-5 py-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Public Artpieces
            </div>
            <div className="mt-1 text-xl font-medium text-zinc-100 tabular-nums">
              {allPublicArtworks.length}
            </div>
          </div>
          <div className="bg-[#0B0B0D] px-5 py-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Open Exhibitions
            </div>
            <div className="mt-1 text-xl font-medium text-zinc-100 tabular-nums">
              {allPublicAlbums.length}
            </div>
          </div>
          <div className="bg-[#0B0B0D] px-5 py-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Viewing Fidelity
            </div>
            <div className="mt-1 text-sm sm:text-base font-medium text-zinc-100">
              High-Res · Protected
            </div>
          </div>
          <div className="bg-[#0B0B0D] px-5 py-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Gallery Access
            </div>
            <div className="mt-1 text-sm sm:text-base font-medium text-zinc-100">
              Public · Link · Invite
            </div>
          </div>
        </div>
      </section>

      {/* Featured Public Albums Strip */}
      <section className="border-t border-zinc-800/80 pt-12 pb-14">
        <div className="flex items-end justify-between gap-4 mb-7">
          <div>
            <h2 className="font-display text-3xl font-medium text-zinc-100">
              Featured Exhibitions
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Open public albums available for immediate high-resolution viewing.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateAlbums}
            className="text-xs font-medium text-zinc-300 hover:text-[#E5B84B] whitespace-nowrap"
          >
            View All Albums
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allPublicAlbums.slice(0, 3).map((album) => (
            <AlbumCard key={album.id} album={album} onSelect={onOpenAlbum} />
          ))}
        </div>
      </section>

      {/* Artwork Discovery Stream */}
      <section className="border-t border-zinc-800/80 pt-12">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
          <div>
            <h2 className="font-display text-3xl font-medium text-zinc-100">
              Gallery Archive
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Select any piece for full-resolution optical inspection and live commentary.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, artist, or tag..."
                className="w-full sm:w-64 rounded-lg border border-zinc-800 bg-[#0B0B0D] pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#E5B84B] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Interactive Medium Filter Tabs */}
        <div className="mb-8 flex items-center gap-1.5 overflow-x-auto pb-1">
          {MEDIUM_FILTERS.map((medium) => {
            const active = selectedMedium === medium;
            return (
              <button
                key={medium}
                type="button"
                onClick={() => setSelectedMedium(medium)}
                className={`whitespace-nowrap shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-zinc-100 text-[#050505]'
                    : 'bg-[#0B0B0D] text-zinc-400 border border-zinc-800/80 hover:text-zinc-100'
                }`}
              >
                {medium}
              </button>
            );
          })}
        </div>

        {filteredArtworks.length === 0 ? (
          <div className="rounded-xl border border-zinc-800/80 bg-[#0B0B0D] p-14 text-center">
            <p className="font-display text-2xl text-zinc-300">No matching artworks</p>
            <p className="mt-2 text-xs text-zinc-500">
              Try clearing your search filter or selecting All Works.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredArtworks.map((art, index) => (
              <ArtworkCard
                key={art.id}
                artwork={art}
                featuredSpan={index === 0 && filteredArtworks.length >= 4 && selectedMedium === 'All Works' && !searchQuery}
                onSelect={onSelectArtwork}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function PublicAlbumsView({ onOpenAlbum }: { onOpenAlbum: (albumId: string) => void }) {
  const { publicAlbums, myAlbums, user } = useGallery();

  const mergedPublic = useMemo(() => {
    return [...publicAlbums, ...FEATURED_ALBUMS];
  }, [publicAlbums]);

  return (
    <section className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10 lg:py-14 space-y-12">
      <div className="border-b border-zinc-800/80 pb-6">
        <h1 className="font-display text-4xl font-medium text-zinc-100">
          Public Exhibitions & Collections
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Curated albums open for everyone to explore without an account.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mergedPublic.map((album) => (
          <AlbumCard key={album.id} album={album} onSelect={onOpenAlbum} />
        ))}
      </div>

      {user && myAlbums.some((a) => a.visibility !== 'public') && (
        <div className="border-t border-zinc-800/80 pt-10">
          <h2 className="font-display text-2xl font-medium text-zinc-100 mb-6">
            Your Private & Invite-Only Albums
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myAlbums
              .filter((a) => a.visibility !== 'public')
              .map((album) => (
                <AlbumCard key={album.id} album={album} onSelect={onOpenAlbum} />
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
