import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Upload, X } from 'lucide-react';
import { useGallery } from '../contexts/GalleryContext';
import {
  createAlbum,
  createArtworkPiece,
  uploadMediaFile,
} from '../lib/galleryService';
import { FIELD_LIMITS, type Album, type AlbumVisibility } from '../types/gallery';

interface UploadArtworkModalProps {
  defaultAlbumId?: string;
  availableAlbums: Album[];
  onClose: () => void;
  onUploaded: (albumId: string) => void;
}

const MEDIUM_PRESETS = [
  'Digital Painting',
  'Fine Art Photography',
  'Oil & Linen',
  'Sculpture & Relief',
  'Light Installation',
  'Mixed Media',
];

export function UploadArtworkModal({
  defaultAlbumId,
  availableAlbums,
  onClose,
  onUploaded,
}: UploadArtworkModalProps) {
  const { user, showToast } = useGallery();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>(
    defaultAlbumId || availableAlbums[0]?.id || '__new__',
  );

  // Inline new album fields
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [newAlbumVisibility, setNewAlbumVisibility] = useState<AlbumVisibility>('public');

  // Artwork fields
  const [title, setTitle] = useState('');
  const [medium, setMedium] = useState('Digital Painting');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFileSelect = (chosen: File | undefined | null) => {
    if (!chosen) return;
    if (!chosen.type.startsWith('image/')) {
      showToast('Please select an image file (JPEG, PNG, WebP, AVIF, or GIF).');
      return;
    }
    if (chosen.size > 25 * 1024 * 1024) {
      showToast('Image file must be under 25 MB.');
      return;
    }
    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
    if (!title) {
      const base = chosen.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      setTitle(base.slice(0, FIELD_LIMITS.ARTWORK_TITLE_MAX));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !file || !title.trim() || uploading) return;

    setUploading(true);
    try {
      let targetAlbum: Album | undefined = availableAlbums.find((a) => a.id === selectedAlbumId);

      if (!targetAlbum || selectedAlbumId === '__new__') {
        const albumTitleToUse = newAlbumTitle.trim() || 'Studio Collection';
        const createdId = await createAlbum({
          title: albumTitleToUse,
          description: 'Curated digital art series.',
          visibility: newAlbumVisibility,
          owner: user,
        });
        targetAlbum = {
          id: createdId,
          title: albumTitleToUse,
          description: 'Curated digital art series.',
          coverUrl: '',
          ownerId: user.uid,
          ownerName: user.displayName || user.email?.split('@')[0] || 'Artist',
          ownerPhotoUrl: user.photoURL || '',
          visibility: newAlbumVisibility,
          artCount: 0,
          artworkIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      const uploaded = await uploadMediaFile(file, user.uid);
      await createArtworkPiece({
        album: targetAlbum,
        owner: user,
        title,
        description,
        medium,
        dimensions: uploaded.dimensions,
        year,
        tags: tagsInput.split(','),
        imageUrl: uploaded.imageUrl,
        aspectRatio: uploaded.aspectRatio,
      });

      showToast(`"${title.trim()}" published to ${targetAlbum.title}.`);
      onUploaded(targetAlbum.id);
      onClose();
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to upload artwork.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload Artwork Piece"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0B0B0D] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <h2 className="font-display text-2xl font-medium text-zinc-100">
              Upload Artwork Piece
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Upload from phone, tablet, or computer in lossless high-resolution rendering.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* File Dropzone / Mobile Picker */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFileSelect(e.dataTransfer.files?.[0]);
            }}
            className="rounded-xl border border-dashed border-zinc-700 bg-[#050505] p-5 text-center transition-colors hover:border-[#E5B84B]/60"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              className="hidden"
            />
            {previewUrl ? (
              <div className="space-y-3">
                <img
                  src={previewUrl}
                  alt="Artwork preview"
                  className="mx-auto max-h-64 rounded-lg object-contain"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-[#E5B84B] hover:underline"
                >
                  Choose a different image
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center py-6 text-zinc-400 hover:text-zinc-200"
              >
                <ImagePlus className="h-8 w-8 text-[#E5B84B] mb-2" strokeWidth={1.5} />
                <span className="text-sm font-medium text-zinc-200">
                  Select photo or digital artwork
                </span>
                <span className="mt-1 text-xs text-zinc-500">
                  Supports JPEG, PNG, WebP, AVIF up to 25 MB
                </span>
              </button>
            )}
          </div>

          {/* Album Assignment */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-zinc-300">
              Assign to Album
            </label>
            <select
              value={selectedAlbumId}
              onChange={(e) => setSelectedAlbumId(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
            >
              {availableAlbums.map((alb) => (
                <option key={alb.id} value={alb.id}>
                  {alb.title} ({alb.visibility})
                </option>
              ))}
              <option value="__new__">+ Create a New Custom Album</option>
            </select>

            {selectedAlbumId === '__new__' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-zinc-800/80 bg-[#050505] p-3.5">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    New Album Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={FIELD_LIMITS.ALBUM_TITLE_MAX}
                    value={newAlbumTitle}
                    onChange={(e) => setNewAlbumTitle(e.target.value)}
                    placeholder="Studio Collection"
                    className="w-full rounded-lg border border-zinc-800 bg-[#0B0B0D] px-3 py-2 text-xs text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Album Visibility
                  </label>
                  <select
                    value={newAlbumVisibility}
                    onChange={(e) => setNewAlbumVisibility(e.target.value as AlbumVisibility)}
                    className="w-full rounded-lg border border-zinc-800 bg-[#0B0B0D] px-3 py-2 text-xs text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
                  >
                    <option value="public">Public Gallery</option>
                    <option value="unlisted">Direct Link Only</option>
                    <option value="invite">Invite Only (Email)</option>
                    <option value="private">Private Archive</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Metadata Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Piece Title
              </label>
              <input
                type="text"
                required
                maxLength={FIELD_LIMITS.ARTWORK_TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled Study No. 1"
                className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Medium / Discipline
              </label>
              <input
                type="text"
                list="medium-presets"
                required
                maxLength={FIELD_LIMITS.MEDIUM_MAX}
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
              />
              <datalist id="medium-presets">
                {MEDIUM_PRESETS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Year
              </label>
              <input
                type="text"
                maxLength={FIELD_LIMITS.YEAR_MAX}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Curatorial Notes
            </label>
            <textarea
              rows={3}
              maxLength={FIELD_LIMITS.ARTWORK_DESC_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Process, camera/brush notes, edition details..."
              className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#E5B84B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Tags (comma separated, up to 10)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="monochrome, minimalism, portrait"
              className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#E5B84B] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
            <span className="text-[11px] text-zinc-500">
              Non-owners cannot download your uploaded image.
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-800 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || !file || !title.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E5B84B] px-5 py-2 text-xs font-semibold text-[#050505] hover:bg-[#f0c761] disabled:opacity-50"
              >
                {uploading ? <Plus className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                <span>{uploading ? 'Publishing...' : 'Publish Piece'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
