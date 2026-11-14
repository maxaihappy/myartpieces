import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, Lock, Settings2, Trash2, Upload } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { FEATURED_ALBUMS, FEATURED_ARTWORKS } from '../data/featuredWorks';
import { useGallery } from '../contexts/GalleryContext';
import { db } from '../lib/firebase';
import { deleteAlbumWithArtworks, fetchArtworksByIds } from '../lib/galleryService';
import type { Album, AlbumVisibility, Artwork } from '../types/gallery';
import { ArtworkCard } from './ArtworkCard';

interface AlbumDetailViewProps {
  albumId: string;
  onBack: () => void;
  onSelectArtwork: (artwork: Artwork, canEditAsAlbumEditor: boolean) => void;
  onManageAlbum: (album: Album) => void;
  onUploadToAlbum: (albumId: string) => void;
}

const VISIBILITY_COPY: Record<AlbumVisibility, string> = {
  public: 'Public Gallery',
  unlisted: 'Direct Link Only',
  invite: 'Invite-Only Exhibition',
  private: 'Private Reference Archive',
};

export function AlbumDetailView({
  albumId,
  onBack,
  onSelectArtwork,
  onManageAlbum,
  onUploadToAlbum,
}: AlbumDetailViewProps) {
  const { user, receivedInvites, signInWithGoogle, showToast } = useGallery();
  const [album, setAlbum] = useState<Album | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const featuredAlbum = useMemo(
    () => FEATURED_ALBUMS.find((a) => a.id === albumId) || null,
    [albumId],
  );

  const inviteRecord = useMemo(
    () => receivedInvites.find((inv) => inv.albumId === albumId),
    [receivedInvites, albumId],
  );

  useEffect(() => {
    setAccessError(null);
    setConfirmDelete(false);

    if (featuredAlbum) {
      setAlbum(featuredAlbum);
      setArtworks(FEATURED_ARTWORKS.filter((art) => art.albumId === featuredAlbum.id));
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'albums', albumId),
      async (snap) => {
        if (!snap.exists()) {
          setAlbum(null);
          setArtworks([]);
          setAccessError('This gallery could not be found.');
          setLoading(false);
          return;
        }
        const loaded = snap.data() as Album;
        setAlbum(loaded);
        setAccessError(null);
        try {
          const items = await fetchArtworksByIds(loaded.artworkIds || []);
          setArtworks(items);
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      },
      () => {
        setAlbum(null);
        setArtworks([]);
        setAccessError(
          user
            ? 'You do not have permission to view this private or invite-only gallery.'
            : 'This gallery is private or invite-only. Sign in with an invited Gmail account to view.',
        );
        setLoading(false);
      },
    );

    return () => unsub();
  }, [albumId, featuredAlbum, user]);

  const isOwner = Boolean(album && user && album.ownerId === user.uid && !album.isFeaturedShowcase);
  const isInvitedEditor = Boolean(inviteRecord?.role === 'editor' && !album?.isFeaturedShowcase);
  const canEditAlbum = isOwner || isInvitedEditor;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/album/${albumId}`);
      setCopiedLink(true);
      showToast('Direct gallery link copied.');
      window.setTimeout(() => setCopiedLink(false), 2400);
    } catch {
      showToast('Unable to copy link.');
    }
  };

  const handleDelete = async () => {
    if (!album || !isOwner) return;
    try {
      await deleteAlbumWithArtworks(album);
      showToast(`Deleted "${album.title}".`);
      onBack();
    } catch (err) {
      console.error(err);
      showToast('Could not delete album.');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-16 lg:px-10">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-900 mb-4" />
        <div className="h-5 w-96 animate-pulse rounded bg-zinc-900/70 mb-10" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="aspect-[4/3] animate-pulse rounded-xl bg-zinc-900/80" />
          ))}
        </div>
      </div>
    );
  }

  if (accessError || !album) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <Lock className="mx-auto h-9 w-9 text-zinc-600 mb-4" strokeWidth={1.5} />
        <h1 className="font-display text-3xl font-medium text-zinc-100">
          Restricted Gallery
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {accessError || 'This gallery is unavailable.'}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-xs text-zinc-200 hover:border-zinc-700"
          >
            Return to Galleries
          </button>
          {!user && (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="rounded-lg bg-[#E5B84B] px-4 py-2 text-xs font-semibold text-[#050505] hover:bg-[#f0c761]"
            >
              Sign in with Google
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10 lg:py-14">
      <button
        type="button"
        onClick={onBack}
        className="mb-8 inline-flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to Galleries</span>
      </button>

      {/* Gallery Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 border-b border-zinc-800/80 pb-8">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mb-3">
            <span className="text-[#E5B84B]">{VISIBILITY_COPY[album.visibility]}</span>
            <span aria-hidden="true">·</span>
            <span>Curated by {album.ownerName}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {artworks.length} {artworks.length === 1 ? 'piece' : 'pieces'}
            </span>
            {inviteRecord && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-zinc-200">
                  Shared ({inviteRecord.role === 'editor' ? 'Can Edit' : 'Viewer'})
                </span>
              </>
            )}
          </div>

          <h1 className="font-display text-4xl sm:text-5xl font-medium tracking-tight text-zinc-100 text-balance">
            {album.title}
          </h1>

          {album.description && (
            <p className="mt-4 text-sm sm:text-base leading-relaxed text-zinc-400">
              {album.description}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3.5 py-2 text-xs text-zinc-200 transition-colors hover:border-zinc-600"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-[#E5B84B]" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedLink ? 'Link Copied' : 'Share Link'}</span>
          </button>

          {canEditAlbum && (
            <>
              <button
                type="button"
                onClick={() => onManageAlbum(album)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3.5 py-2 text-xs text-zinc-200 transition-colors hover:border-zinc-600"
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span>{isOwner ? 'Manage & Invite' : 'Edit Gallery'}</span>
              </button>

              <button
                type="button"
                onClick={() => onUploadToAlbum(album.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#E5B84B] px-4 py-2 text-xs font-semibold text-[#050505] transition-colors hover:bg-[#f0c761]"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Add Piece</span>
              </button>
            </>
          )}

          {isOwner && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete album"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-500 hover:border-rose-900/60 hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {isOwner && confirmDelete && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-500"
              >
                Delete Album
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Artworks Grid */}
      {artworks.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-display text-2xl text-zinc-300">
            This exhibition space is awaiting its first piece.
          </p>
          {canEditAlbum && (
            <button
              type="button"
              onClick={() => onUploadToAlbum(album.id)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#E5B84B] px-5 py-2.5 text-xs font-semibold text-[#050505] hover:bg-[#f0c761]"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload First Artwork</span>
            </button>
          )}
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {artworks.map((art) => (
            <ArtworkCard
              key={art.id}
              artwork={art}
              onSelect={(selected) => onSelectArtwork(selected, isInvitedEditor)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
