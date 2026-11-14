import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCheck,
  FolderPlus,
  Heart,
  LogOut,
  MessageSquare,
  Share2,
  Upload,
} from 'lucide-react';
import { useGallery } from '../contexts/GalleryContext';
import {
  fetchAlbumsBatch,
  fetchArtworkById,
  formatRelativeDate,
  markAllNotificationsRead,
  markNotificationRead,
  updateUserProfile,
} from '../lib/galleryService';
import { FIELD_LIMITS, type Album, type Artwork } from '../types/gallery';
import { AlbumCard } from './AlbumCard';
import { ArtworkCard } from './ArtworkCard';

interface StudioViewProps {
  onOpenAlbum: (albumId: string) => void;
  onSelectArtwork: (artwork: Artwork) => void;
  onCreateAlbum: () => void;
  onOpenUpload: () => void;
}

export function StudioView({
  onOpenAlbum,
  onSelectArtwork,
  onCreateAlbum,
  onOpenUpload,
}: StudioViewProps) {
  const {
    user,
    profile,
    account,
    myAlbums,
    myArtworks,
    signInWithGoogle,
    signOutUser,
    togglePushAlerts,
    showToast,
  } = useGallery();

  const [editingBio, setEditingBio] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName || user?.displayName || '');
    setBio(profile?.bio || '');
  }, [profile, user]);

  if (!user) {
    return (
      <section className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-[#E5B84B] mb-3">
          Personal Archive & Curation
        </p>
        <h1 className="font-display text-4xl font-medium text-zinc-100 text-balance">
          Curate your private and public exhibitions.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Sign in with your Gmail account to upload high-resolution artworks from any device, organize custom albums, manage invite-only access, and receive live notifications.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="mt-8 inline-flex items-center rounded-lg bg-[#E5B84B] px-6 py-3 text-xs font-semibold tracking-wide text-[#050505] hover:bg-[#f0c761]"
        >
          Sign in with Google
        </button>
      </section>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      await updateUserProfile(user.uid, displayName, user.photoURL || '', bio);
      setEditingBio(false);
      showToast('Artist studio profile updated.');
    } catch (err) {
      console.error(err);
      showToast('Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <section className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10 lg:py-14 space-y-14">
      {/* Studio Curator Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-zinc-800/80 pb-8">
        <div className="flex items-start gap-4">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={displayName || 'Artist avatar'}
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-full border border-zinc-700 object-cover shrink-0"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 font-display text-2xl text-zinc-200 shrink-0">
              {(displayName || 'A').charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <h1 className="font-display text-3xl sm:text-4xl font-medium text-zinc-100">
              {profile?.displayName || user.displayName || 'My Studio'}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>{user.email}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {myAlbums.length} {myAlbums.length === 1 ? 'album' : 'albums'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {myArtworks.length} {myArtworks.length === 1 ? 'piece' : 'pieces'}
              </span>
            </div>
            {profile?.bio && !editingBio && (
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">{profile.bio}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={togglePushAlerts}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs transition-colors ${
              account?.pushEnabled
                ? 'border-[#E5B84B]/60 bg-[#E5B84B]/10 text-[#E5B84B]'
                : 'border-zinc-800 text-zinc-300 hover:border-zinc-700'
            }`}
          >
            {account?.pushEnabled ? (
              <Bell className="h-3.5 w-3.5" />
            ) : (
              <BellOff className="h-3.5 w-3.5" />
            )}
            <span>{account?.pushEnabled ? 'Push Alerts On' : 'Enable Push Alerts'}</span>
          </button>

          <button
            type="button"
            onClick={() => setEditingBio((v) => !v)}
            className="rounded-lg border border-zinc-800 px-3.5 py-2 text-xs text-zinc-300 hover:border-zinc-700"
          >
            {editingBio ? 'Close Bio' : 'Edit Bio'}
          </button>

          <button
            type="button"
            onClick={signOutUser}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3.5 py-2 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {editingBio && (
        <form
          onSubmit={handleSaveProfile}
          className="max-w-xl space-y-3 rounded-xl border border-zinc-800 bg-[#0B0B0D] p-5"
        >
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Curator Name</label>
            <input
              type="text"
              required
              maxLength={FIELD_LIMITS.DISPLAY_NAME_MAX}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Artist Statement / Bio</label>
            <textarea
              rows={2}
              maxLength={FIELD_LIMITS.BIO_MAX}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-lg bg-[#E5B84B] px-4 py-2 text-xs font-semibold text-[#050505] hover:bg-[#f0c761]"
          >
            {savingProfile ? 'Saving...' : 'Save Studio Profile'}
          </button>
        </form>
      )}

      {/* My Custom Albums */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-medium text-zinc-100">
              My Curated Albums
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Public exhibitions, unlisted direct-link galleries, invite-only rooms, and private archives.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateAlbum}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-xs font-medium text-zinc-100 hover:border-[#E5B84B]/60 hover:text-[#E5B84B]"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>New Album</span>
          </button>
        </div>

        {myAlbums.length === 0 ? (
          <div className="rounded-xl border border-zinc-800/80 bg-[#0B0B0D] p-10 text-center">
            <p className="text-sm text-zinc-400">
              Create your first custom album to organize and share your artworks.
            </p>
            <button
              type="button"
              onClick={onCreateAlbum}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#E5B84B] px-4 py-2 text-xs font-semibold text-[#050505] hover:bg-[#f0c761]"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>Create Album</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myAlbums.map((alb) => (
              <AlbumCard key={alb.id} album={alb} onSelect={onOpenAlbum} />
            ))}
          </div>
        )}
      </div>

      {/* My Uploaded Pieces */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-medium text-zinc-100">
              Uploaded Artpieces
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Click any piece to inspect in high resolution, edit details, or download your original file.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenUpload}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E5B84B] px-4 py-2 text-xs font-semibold text-[#050505] hover:bg-[#f0c761]"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Piece</span>
          </button>
        </div>

        {myArtworks.length === 0 ? (
          <div className="rounded-xl border border-zinc-800/80 bg-[#0B0B0D] p-10 text-center">
            <p className="text-sm text-zinc-400">
              No artworks uploaded yet. Publish high-resolution photos or digital paintings from any device.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myArtworks.map((art) => (
              <ArtworkCard key={art.id} artwork={art} onSelect={onSelectArtwork} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function SharedView({ onOpenAlbum }: { onOpenAlbum: (albumId: string) => void }) {
  const { user, receivedInvites, signInWithGoogle } = useGallery();
  const [sharedAlbums, setSharedAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || receivedInvites.length === 0) {
      setSharedAlbums([]);
      return;
    }
    setLoading(true);
    fetchAlbumsBatch(receivedInvites.map((inv) => inv.albumId))
      .then(setSharedAlbums)
      .finally(() => setLoading(false));
  }, [user, receivedInvites]);

  if (!user) {
    return (
      <section className="mx-auto max-w-2xl px-6 py-24 text-center">
        <Share2 className="mx-auto h-9 w-9 text-zinc-600 mb-4" strokeWidth={1.5} />
        <h1 className="font-display text-4xl font-medium text-zinc-100">
          Shared With Me
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Sign in with your Gmail account to view private exhibitions and collaborative albums explicitly shared with your email.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="mt-8 inline-flex items-center rounded-lg bg-[#E5B84B] px-6 py-3 text-xs font-semibold text-[#050505] hover:bg-[#f0c761]"
        >
          Sign in with Google
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10 lg:py-14">
      <div className="border-b border-zinc-800/80 pb-6 mb-10">
        <h1 className="font-display text-4xl font-medium text-zinc-100">
          Shared With Me
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Private and invite-only galleries shared directly with <span className="text-zinc-200">{user.email}</span>.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="aspect-[4/3] animate-pulse rounded-xl bg-zinc-900" />
          ))}
        </div>
      ) : sharedAlbums.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-[#0B0B0D] p-14 text-center">
          <p className="font-display text-2xl text-zinc-300">No shared galleries yet</p>
          <p className="mt-2 text-xs text-zinc-500">
            When another artist invites {user.email} to an album, it will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sharedAlbums.map((alb) => {
            const invite = receivedInvites.find((i) => i.albumId === alb.id);
            const roleLabel = invite?.role === 'editor' ? 'Can Edit & Curate' : 'Viewer';
            return (
              <AlbumCard
                key={alb.id}
                album={alb}
                roleLabel={roleLabel}
                onSelect={onOpenAlbum}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ActivityView({
  onSelectArtwork,
}: {
  onSelectArtwork: (artwork: Artwork) => void;
}) {
  const { user, account, notifications, unreadCount, togglePushAlerts, showToast } = useGallery();

  if (!user) return null;

  const handleOpenNotification = async (notifId: string, artworkId: string) => {
    try {
      await markNotificationRead(user.uid, notifId);
      const art = await fetchArtworkById(artworkId);
      if (art) {
        onSelectArtwork(art);
      } else {
        showToast('That artwork is no longer available.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 lg:py-14">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6 mb-8">
        <div>
          <h1 className="font-display text-4xl font-medium text-zinc-100">
            Engagement & Alerts
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Real-time notifications whenever viewers appreciate or comment on your artpieces.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePushAlerts}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs transition-colors ${
              account?.pushEnabled
                ? 'border-[#E5B84B]/60 bg-[#E5B84B]/10 text-[#E5B84B]'
                : 'border-zinc-800 text-zinc-300 hover:border-zinc-700'
            }`}
          >
            {account?.pushEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            <span>{account?.pushEnabled ? 'Push Alerts Active' : 'Enable Push Alerts'}</span>
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllNotificationsRead(user.uid, notifications)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3.5 py-2 text-xs text-zinc-300 hover:border-zinc-700"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark All Read</span>
            </button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-[#0B0B0D] p-12 text-center">
          <p className="font-display text-2xl text-zinc-300">Quiet gallery floor</p>
          <p className="mt-2 text-xs text-zinc-500">
            Likes and real-time comments on your published pieces will stream here instantaneously.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800/70 rounded-xl border border-zinc-800/80 bg-[#0B0B0D]">
          {notifications.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handleOpenNotification(item.id, item.artworkId)}
                className={`flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-zinc-900/60 ${
                  item.read ? 'opacity-70' : 'bg-[#E5B84B]/[0.03]'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="mt-0.5 text-[#E5B84B] shrink-0">
                    {item.type === 'like' ? (
                      <Heart className="h-4 w-4" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-100">{item.message}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatRelativeDate(item.createdAt)}
                      {!item.read && ' · Unread'}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
