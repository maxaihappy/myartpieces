/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, X } from 'lucide-react';
import mapLogo from './assets/images/map_gallery_logo_1794683974787.jpg';
import { AlbumDetailView } from './components/AlbumDetailView';
import { AlbumModal } from './components/AlbumModal';
import { ArtworkLightbox } from './components/ArtworkLightbox';
import { DiscoverView, PublicAlbumsView } from './components/DiscoverAndAlbumsViews';
import { ActivityView, SharedView, StudioView } from './components/StudioAndSharedViews';
import { TopBar } from './components/TopBar';
import { UploadArtworkModal } from './components/UploadArtworkModal';
import { GalleryProvider, useGallery } from './contexts/GalleryContext';
import { fetchAlbumsBatch, fetchArtworkById } from './lib/galleryService';
import type { Album, AppView, Artwork } from './types/gallery';

function getInitialRouteFromLocation(): { view: AppView; albumId: string | null } {
  if (typeof window === 'undefined') return { view: 'discover', albumId: null };
  const path = window.location.pathname;
  const albumMatch = /^\/album\/([a-zA-Z0-9_-]+)$/.exec(path);
  if (albumMatch) {
    return { view: 'album-detail', albumId: albumMatch[1] };
  }
  return { view: 'discover', albumId: null };
}

function GalleryShell() {
  const {
    user,
    myAlbums,
    receivedInvites,
    unreadCount,
    liveToast,
    dismissToast,
    signInWithGoogle,
    showToast,
  } = useGallery();

  const initialRoute = useMemo(() => getInitialRouteFromLocation(), []);
  const [activeView, setActiveView] = useState<AppView>(initialRoute.view);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(initialRoute.albumId);

  // Modals & Lightbox state
  const [selectedArtwork, setSelectedArtwork] = useState<{
    artwork: Artwork;
    canEditAsAlbumEditor: boolean;
    isAlbumOwner?: boolean;
  } | null>(null);
  const [albumModalState, setAlbumModalState] = useState<{
    open: boolean;
    album?: Album | null;
  }>({ open: false, album: null });
  const [uploadModalState, setUploadModalState] = useState<{
    open: boolean;
    defaultAlbumId?: string;
  }>({ open: false });

  // Editable albums include owned albums + shared albums with 'editor' role
  const [editableSharedAlbums, setEditableSharedAlbums] = useState<Album[]>([]);

  useEffect(() => {
    const editorInvites = receivedInvites.filter((inv) => inv.role === 'editor');
    if (editorInvites.length === 0) {
      setEditableSharedAlbums([]);
      return;
    }
    fetchAlbumsBatch(editorInvites.map((inv) => inv.albumId))
      .then(setEditableSharedAlbums)
      .catch(() => setEditableSharedAlbums([]));
  }, [receivedInvites]);

  const uploadableAlbums = useMemo(
    () => [...myAlbums, ...editableSharedAlbums],
    [myAlbums, editableSharedAlbums],
  );

  // Sync browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const next = getInitialRouteFromLocation();
      setActiveView(next.view);
      setActiveAlbumId(next.albumId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToView = useCallback((view: AppView) => {
    setActiveView(view);
    setActiveAlbumId(null);
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openAlbumDetail = useCallback((albumId: string) => {
    setActiveAlbumId(albumId);
    setActiveView('album-detail');
    window.history.pushState({}, '', `/album/${albumId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenUpload = useCallback(
    async (defaultAlbumId?: string) => {
      if (!user) {
        await signInWithGoogle();
        return;
      }
      setUploadModalState({ open: true, defaultAlbumId });
    },
    [user, signInWithGoogle],
  );

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithGoogle();
      showToast('Signed in with Google.');
    } catch (err) {
      console.error(err);
      showToast('Google sign-in was cancelled or blocked.');
    }
  }, [signInWithGoogle, showToast]);

  const handleToastAction = async () => {
    if (!liveToast?.artworkId) {
      dismissToast();
      return;
    }
    const art = await fetchArtworkById(liveToast.artworkId);
    dismissToast();
    if (art) {
      setSelectedArtwork({ artwork: art, canEditAsAlbumEditor: false });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-[#F4F4F5]">
      <TopBar
        activeView={activeView === 'album-detail' ? 'albums' : activeView}
        onNavigate={navigateToView}
        user={user}
        unreadCount={unreadCount}
        onSignIn={handleSignIn}
        onOpenUpload={() => handleOpenUpload()}
      />

      <main className="flex-1">
        {activeView === 'discover' && (
          <DiscoverView
            onSelectArtwork={(artwork) =>
              setSelectedArtwork({ artwork, canEditAsAlbumEditor: false })
            }
            onOpenAlbum={openAlbumDetail}
            onNavigateAlbums={() => navigateToView('albums')}
            onOpenUpload={() => handleOpenUpload()}
          />
        )}

        {activeView === 'albums' && <PublicAlbumsView onOpenAlbum={openAlbumDetail} />}

        {activeView === 'studio' && (
          <StudioView
            onOpenAlbum={openAlbumDetail}
            onSelectArtwork={(artwork) =>
              setSelectedArtwork({ artwork, canEditAsAlbumEditor: false })
            }
            onCreateAlbum={() => setAlbumModalState({ open: true, album: null })}
            onOpenUpload={() => handleOpenUpload()}
          />
        )}

        {activeView === 'shared' && <SharedView onOpenAlbum={openAlbumDetail} />}

        {activeView === 'activity' && (
          <ActivityView
            onSelectArtwork={(artwork) =>
              setSelectedArtwork({ artwork, canEditAsAlbumEditor: false })
            }
          />
        )}

        {activeView === 'album-detail' && activeAlbumId && (
          <AlbumDetailView
            albumId={activeAlbumId}
            onBack={() => navigateToView('albums')}
            onSelectArtwork={(artwork, canEditAsAlbumEditor, isAlbumOwner) =>
              setSelectedArtwork({ artwork, canEditAsAlbumEditor, isAlbumOwner })
            }
            onManageAlbum={(album) => setAlbumModalState({ open: true, album })}
            onUploadToAlbum={(albId) => handleOpenUpload(albId)}
          />
        )}
      </main>

      <footer className="border-t border-zinc-900 bg-[#050505] px-6 py-8 lg:px-10">
        <div className="mx-auto flex max-w-[1440px] flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-2.5">
            <img
              src={mapLogo}
              alt="MAP Logo"
              className="h-6 w-6 rounded-sm object-cover"
            />
            <span>MAP (My Art Piece) · High-Resolution Digital Art Archive</span>
          </div>
          <span>Protected viewing enabled · Creator-exclusive downloads</span>
        </div>
      </footer>

      {/* High-Resolution Protected Lightbox */}
      {selectedArtwork && (
        <ArtworkLightbox
          artwork={selectedArtwork.artwork}
          canEditAsAlbumEditor={selectedArtwork.canEditAsAlbumEditor}
          isAlbumOwner={selectedArtwork.isAlbumOwner}
          onClose={() => setSelectedArtwork(null)}
          onOpenAlbum={openAlbumDetail}
        />
      )}

      {/* Create / Edit / Invite Album Modal */}
      {albumModalState.open && (
        <AlbumModal
          existingAlbum={albumModalState.album}
          onClose={() => setAlbumModalState({ open: false, album: null })}
          onSaved={(savedId) => {
            if (!albumModalState.album) {
              openAlbumDetail(savedId);
            }
          }}
        />
      )}

      {/* Upload Artwork Modal */}
      {uploadModalState.open && (
        <UploadArtworkModal
          defaultAlbumId={uploadModalState.defaultAlbumId}
          availableAlbums={uploadableAlbums}
          onClose={() => setUploadModalState({ open: false })}
          onUploaded={(albumId) => openAlbumDetail(albumId)}
        />
      )}

      {/* Live Push / Activity Toast */}
      {liveToast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-zinc-800 bg-[#0B0B0D]/95 px-4 py-3 text-xs text-zinc-100 shadow-2xl backdrop-blur-md"
        >
          <Bell className="h-4 w-4 text-[#E5B84B] shrink-0" />
          <button
            type="button"
            onClick={handleToastAction}
            className="flex-1 text-left leading-snug hover:text-[#E5B84B]"
          >
            {liveToast.message}
          </button>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss notification"
            className="text-zinc-500 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <GalleryProvider>
      <GalleryShell />
    </GalleryProvider>
  );
}
