import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Edit3,
  Heart,
  Lock,
  MessageSquare,
  RotateCcw,
  Send,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useGallery } from '../contexts/GalleryContext';
import { db } from '../lib/firebase';
import {
  addArtworkComment,
  deleteArtworkComment,
  deleteArtworkPiece,
  downloadOriginalArtwork,
  formatRelativeDate,
  hasUserLikedArtwork,
  subscribeArtworkComments,
  toggleArtworkLike,
  updateArtworkPiece,
} from '../lib/galleryService';
import { FIELD_LIMITS, type Artwork, type ArtworkComment } from '../types/gallery';
import { ProtectedArtworkImage } from './ProtectedArtworkImage';

interface ArtworkLightboxProps {
  artwork: Artwork;
  canEditAsAlbumEditor?: boolean;
  onClose: () => void;
  onOpenAlbum: (albumId: string) => void;
}

export function ArtworkLightbox({
  artwork: initialArtwork,
  canEditAsAlbumEditor = false,
  onClose,
  onOpenAlbum,
}: ArtworkLightboxProps) {
  const { user, signInWithGoogle, showToast } = useGallery();
  const [artwork, setArtwork] = useState<Artwork>(initialArtwork);
  const [comments, setComments] = useState<ArtworkComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  // High-resolution optical zoom & pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Inline edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(initialArtwork.title);
  const [editMedium, setEditMedium] = useState(initialArtwork.medium);
  const [editYear, setEditYear] = useState(initialArtwork.year);
  const [editDesc, setEditDesc] = useState(initialArtwork.description);
  const [editTags, setEditTags] = useState(initialArtwork.tags.join(', '));
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isFeatured = Boolean(artwork.isFeaturedShowcase);
  const isOwner = Boolean(user && user.uid === artwork.ownerId && !isFeatured);
  const canEdit = isOwner || (canEditAsAlbumEditor && !isFeatured);

  useEffect(() => {
    setArtwork(initialArtwork);
    setEditTitle(initialArtwork.title);
    setEditMedium(initialArtwork.medium);
    setEditYear(initialArtwork.year);
    setEditDesc(initialArtwork.description);
    setEditTags(initialArtwork.tags.join(', '));
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsEditing(false);
    setConfirmDelete(false);
  }, [initialArtwork]);

  // Real-time document sync for counts & edits
  useEffect(() => {
    if (isFeatured) return;
    const unsub = onSnapshot(
      doc(db, 'artworks', initialArtwork.id),
      (snap) => {
        if (snap.exists()) {
          setArtwork(snap.data() as Artwork);
        }
      },
      () => {},
    );
    return () => unsub();
  }, [initialArtwork.id, isFeatured]);

  // Real-time comments stream
  useEffect(() => {
    if (isFeatured) {
      setComments([]);
      return;
    }
    const unsub = subscribeArtworkComments(initialArtwork.id, setComments);
    return () => unsub();
  }, [initialArtwork.id, isFeatured]);

  // Check if user liked this piece
  useEffect(() => {
    if (!user || isFeatured) {
      setLiked(false);
      return;
    }
    hasUserLikedArtwork(initialArtwork.id, user.uid)
      .then(setLiked)
      .catch(() => setLiked(false));
  }, [initialArtwork.id, user, isFeatured]);

  // ESC key closes lightbox
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleToggleZoom = (nextZoom: number) => {
    setZoom(nextZoom);
    if (nextZoom === 1) {
      setPan({ x: 0, y: 0 });
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    isPanningRef.current = true;
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanningRef.current || zoom <= 1) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handlePointerUp = () => {
    isPanningRef.current = false;
  };

  const handleLike = async () => {
    if (isFeatured) {
      showToast('Featured exhibition pieces are read-only showcase works. Upload or open a community piece to engage.');
      return;
    }
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      const next = await toggleArtworkLike(artwork, user, liked);
      setLiked(next);
    } catch (err) {
      console.error(err);
      showToast('Unable to update appreciation right now.');
    } finally {
      setLikeBusy(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFeatured) return;
    if (!user) {
      await signInWithGoogle();
      return;
    }
    const trimmed = commentText.trim();
    if (!trimmed || submittingComment) return;
    setSubmittingComment(true);
    try {
      await addArtworkComment(artwork, user, trimmed);
      setCommentText('');
    } catch (err) {
      console.error(err);
      showToast('Could not post comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteArtworkComment(artwork.id, commentId);
    } catch (err) {
      console.error(err);
      showToast('Unable to delete comment.');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateArtworkPiece({
        artworkId: artwork.id,
        title: editTitle,
        description: editDesc,
        medium: editMedium,
        year: editYear,
        tags: editTags.split(','),
      });
      setIsEditing(false);
      showToast('Artwork metadata updated.');
    } catch (err) {
      console.error(err);
      showToast('Failed to save artwork updates.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteArtwork = async () => {
    try {
      await deleteArtworkPiece(artwork);
      showToast('Artwork removed from gallery.');
      onClose();
    } catch (err) {
      console.error(err);
      showToast('Could not delete artwork.');
    }
  };

  const handleDownloadOriginal = async () => {
    if (!isOwner || !user) return;
    try {
      await downloadOriginalArtwork(artwork, user.uid);
    } catch (err) {
      console.error(err);
      showToast('Could not download original artwork.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={artwork.title}
      className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-[#050505]/95 backdrop-blur-md"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Left/Center High-Resolution Inspection Stage */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-[#030304] p-4 lg:p-10">
        {/* Top Stage Bar */}
        <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-[#0B0B0D]/90 px-3 py-1.5 text-xs text-zinc-400">
            <Lock className="h-3.5 w-3.5 text-[#E5B84B]" strokeWidth={1.75} />
            <span className="whitespace-nowrap">
              {isOwner ? 'Creator Original Access' : 'Protected High-Res Render'}
            </span>
            {artwork.dimensions && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums whitespace-nowrap">{artwork.dimensions}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-[#0B0B0D]/90 p-1 text-xs">
              <button
                type="button"
                onClick={() => handleToggleZoom(Math.max(1, Number((zoom - 0.5).toFixed(1))))}
                disabled={zoom <= 1}
                aria-label="Zoom out"
                className="rounded px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="w-11 text-center tabular-nums text-zinc-300">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => handleToggleZoom(Math.min(3, Number((zoom + 0.5).toFixed(1))))}
                disabled={zoom >= 3}
                aria-label="Zoom in"
                className="rounded px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {zoom > 1 && (
                <button
                  type="button"
                  onClick={() => handleToggleZoom(1)}
                  aria-label="Reset zoom"
                  className="rounded px-2 py-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close lightbox"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-[#0B0B0D]/90 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Image Canvas */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={`flex h-full w-full items-center justify-center overflow-hidden ${
            zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
          }`}
        >
          <ProtectedArtworkImage
            src={artwork.imageUrl}
            alt={artwork.title}
            title={artwork.title}
            className="max-h-[82vh] max-w-full rounded-sm shadow-2xl"
            imgClassName="max-h-[82vh] max-w-full w-auto h-auto object-contain transition-transform duration-150 ease-out"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            }}
          />
        </div>
      </div>

      {/* Right Curator & Real-Time Critique Sidebar */}
      <aside className="flex w-full lg:w-[420px] xl:w-[460px] flex-col border-t lg:border-t-0 lg:border-l border-zinc-800/80 bg-[#0B0B0D] max-h-[55vh] lg:max-h-screen overflow-hidden">
        {/* Top Close & Title */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-6 py-5">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-medium leading-tight text-zinc-100 text-balance">
              {artwork.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="text-zinc-200 font-medium">{artwork.ownerName}</span>
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

          <button
            type="button"
            onClick={onClose}
            aria-label="Close lightbox"
            className="hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Details + Comments */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Edit Form OR Description */}
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="space-y-3 border-b border-zinc-800/80 pb-5">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  maxLength={FIELD_LIMITS.ARTWORK_TITLE_MAX}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Medium</label>
                  <input
                    type="text"
                    required
                    maxLength={FIELD_LIMITS.MEDIUM_MAX}
                    value={editMedium}
                    onChange={(e) => setEditMedium(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Year</label>
                  <input
                    type="text"
                    maxLength={FIELD_LIMITS.YEAR_MAX}
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Curatorial Notes</label>
                <textarea
                  rows={3}
                  maxLength={FIELD_LIMITS.ARTWORK_DESC_MAX}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-lg bg-[#E5B84B] px-4 py-2 text-xs font-semibold text-[#050505] hover:bg-[#f0c761] disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {artwork.description && (
                <p className="text-sm leading-relaxed text-zinc-300">{artwork.description}</p>
              )}

              {artwork.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  {artwork.tags.map((tag, idx) => (
                    <React.Fragment key={tag}>
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      <span>#{tag}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleLike}
                  disabled={likeBusy}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                    liked
                      ? 'border-[#E5B84B]/60 bg-[#E5B84B]/10 text-[#E5B84B]'
                      : 'border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
                  }`}
                >
                  <Heart
                    className="h-3.5 w-3.5"
                    strokeWidth={1.75}
                    fill={liked ? 'currentColor' : 'none'}
                  />
                  <span className="tabular-nums">{artwork.likesCount}</span>
                  <span>Appreciate</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAlbum(artwork.albumId);
                  }}
                  className="inline-flex items-center rounded-lg border border-zinc-800 px-3.5 py-2 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
                >
                  Open Album
                </button>

                {isOwner &&
                  (artwork.imageUrl.startsWith('cloud://media/') ||
                    artwork.imageUrl.startsWith('/api/media/')) && (
                  <button
                    type="button"
                    onClick={handleDownloadOriginal}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3.5 py-2 text-xs text-zinc-200 transition-colors hover:border-[#E5B84B]/60 hover:text-[#E5B84B]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Original</span>
                  </button>
                )}
              </div>

              {!isOwner && (
                <p className="text-[11px] text-zinc-500">
                  High-resolution gallery viewing enabled. Original file downloads are restricted to the creator.
                </p>
              )}

              {canEdit && (
                <div className="flex items-center gap-3 border-t border-zinc-800/80 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit Details</span>
                  </button>

                  {isOwner && !confirmDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Piece</span>
                    </button>
                  )}

                  {isOwner && confirmDelete && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDeleteArtwork}
                        className="rounded bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-500"
                      >
                        Confirm Delete
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
              )}
            </div>
          )}

          {/* Real-Time Comment Section */}
          <div className="border-t border-zinc-800/80 pt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Exhibition Notes & Comments</span>
              </h3>
              <span className="text-xs text-zinc-500 tabular-nums">
                {isFeatured ? artwork.commentsCount : comments.length}
              </span>
            </div>

            {isFeatured ? (
              <p className="text-xs leading-relaxed text-zinc-500">
                Curated exhibition pieces showcase gallery presentation. Upload an artwork or open a community piece to post live comments and trigger real-time notifications.
              </p>
            ) : (
              <div className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No reflections yet. Start the conversation around this piece.
                  </p>
                ) : (
                  comments.map((comment) => {
                    const canDeleteComment =
                      user && (user.uid === comment.authorId || user.uid === artwork.ownerId);
                    return (
                      <div
                        key={comment.id}
                        className="group border-b border-zinc-800/60 pb-3 last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-zinc-200">{comment.authorName}</span>
                            <span aria-hidden="true" className="text-zinc-600">
                              ·
                            </span>
                            <span className="text-zinc-500">
                              {formatRelativeDate(comment.createdAt)}
                            </span>
                          </div>
                          {canDeleteComment && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment.id)}
                              aria-label="Delete comment"
                              className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity hover:text-rose-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-300">{comment.text}</p>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Real-Time Comment Composer */}
        {!isFeatured && (
          <div className="border-t border-zinc-800/80 bg-[#08080A] px-6 py-4">
            {user ? (
              <form onSubmit={handlePostComment} className="flex items-center gap-2">
                <input
                  type="text"
                  value={commentText}
                  maxLength={FIELD_LIMITS.COMMENT_MAX}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment or critique..."
                  className="flex-1 rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#E5B84B] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || submittingComment}
                  aria-label="Post comment"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E5B84B] text-[#050505] transition-colors hover:bg-[#f0c761] disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="w-full rounded-lg border border-zinc-800 py-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-[#E5B84B]/60 hover:text-[#E5B84B]"
              >
                Sign in with Google to comment or appreciate
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
