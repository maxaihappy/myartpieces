import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FolderOpen,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useGallery } from '../contexts/GalleryContext';
import {
  createAlbum,
  createArtworkPiece,
  uploadMediaFile,
} from '../lib/galleryService';
import { convertHeicToJpeg, isHeicFile } from '../lib/heicConverter';
import { FIELD_LIMITS, type Album, type AlbumVisibility } from '../types/gallery';

interface UploadArtworkModalProps {
  defaultAlbumId?: string;
  availableAlbums: Album[];
  onClose: () => void;
  onUploaded: (albumId: string) => void;
}

interface QueuedArtwork {
  key: string;
  file: File;
  previewUrl: string;
  title: string;
  status: 'converting' | 'queued' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

const MEDIUM_PRESETS = [
  'Digital Painting',
  'Fine Art Photography',
  'Oil & Linen',
  'Sculpture & Relief',
  'Light Installation',
  'Mixed Media',
];

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif|gif|heic|heif)$/i;

function isSupportedImageFile(file: File): boolean {
  if (isHeicFile(file)) return true;
  if (file.type && file.type.startsWith('image/')) {
    return /^image\/(jpeg|jpg|png|webp|avif|gif)$/i.test(file.type) || IMAGE_EXT_RE.test(file.name);
  }
  return IMAGE_EXT_RE.test(file.name);
}

function cleanTitleFromFilename(name: string): string {
  return (
    name
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .slice(0, FIELD_LIMITS.ARTWORK_TITLE_MAX) || 'Untitled Piece'
  );
}

async function readDirectoryAllEntries(
  dirEntry: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = dirEntry.createReader();
  const entries: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch || batch.length === 0) break;
    entries.push(...batch);
  }
  return entries;
}

async function collectEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    return [file];
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const children = await readDirectoryAllEntries(dirEntry);
    const nested = await Promise.all(children.map(collectEntryFiles));
    return nested.flat();
  }
  return [];
}

async function extractDroppedFilesAndFolderName(
  dataTransfer: DataTransfer,
): Promise<{ files: File[]; folderName: string }> {
  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .map((item) =>
      typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null,
    )
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length > 0) {
    const firstDir = entries.find((e) => e.isDirectory);
    const folderName = firstDir ? firstDir.name : '';
    const nested = await Promise.all(entries.map(collectEntryFiles));
    return { files: nested.flat(), folderName };
  }

  return { files: Array.from(dataTransfer.files || []), folderName: '' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadArtworkModal({
  defaultAlbumId,
  availableAlbums,
  onClose,
  onUploaded,
}: UploadArtworkModalProps) {
  const { user, showToast } = useGallery();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueuedArtwork[]>([]);
  const activeConversionsRef = useRef<Map<string, Promise<File>>>(new Map());
  const isMountedRef = useRef(true);

  const [queue, setQueue] = useState<QueuedArtwork[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>(
    defaultAlbumId || availableAlbums[0]?.id || '__new__',
  );

  // Inline new album fields
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [newAlbumVisibility, setNewAlbumVisibility] = useState<AlbumVisibility>('public');

  // Shared batch metadata
  const [medium, setMedium] = useState('Fine Art Photography');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      queueRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const ensureFileConverted = (item: QueuedArtwork): Promise<File> => {
    if (!isHeicFile(item.file)) {
      return Promise.resolve(item.file);
    }
    const existing = activeConversionsRef.current.get(item.key);
    if (existing) return existing;

    const promise = convertHeicToJpeg(item.file)
      .then((convertedFile) => {
        if (isMountedRef.current) {
          const previewUrl = URL.createObjectURL(convertedFile);
          setQueue((prev) =>
            prev.map((q) =>
              q.key === item.key
                ? {
                    ...q,
                    file: convertedFile,
                    previewUrl,
                    status: q.status === 'converting' ? 'queued' : q.status,
                  }
                : q,
            ),
          );
        }
        return convertedFile;
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setQueue((prev) =>
            prev.map((q) =>
              q.key === item.key
                ? {
                    ...q,
                    status: 'error',
                    errorMsg:
                      err instanceof Error ? err.message : 'HEIC conversion failed',
                  }
                : q,
            ),
          );
        }
        throw err;
      })
      .finally(() => {
        activeConversionsRef.current.delete(item.key);
      });

    activeConversionsRef.current.set(item.key, promise);
    return promise;
  };

  // Concurrent background HEIC/HEIF -> JPEG preview worker pool (concurrency = 3, never cancels on re-render)
  useEffect(() => {
    const pending = queue.filter(
      (item) => item.status === 'converting' && !activeConversionsRef.current.has(item.key),
    );
    if (pending.length === 0) return;

    const availableSlots = Math.max(0, 3 - activeConversionsRef.current.size);
    pending.slice(0, availableSlots).forEach((item) => {
      void ensureFileConverted(item).catch(() => {});
    });
  }, [queue]);

  const addFilesToQueue = (rawFiles: File[], suggestedFolderName = '') => {
    if (rawFiles.length === 0) return;

    let skippedUnsupported = 0;
    let skippedOversized = 0;

    setQueue((prev) => {
      const existingKeys = new Set(prev.map((q) => q.key));
      const nextItems: QueuedArtwork[] = [];

      for (const file of rawFiles) {
        if (!isSupportedImageFile(file)) {
          skippedUnsupported += 1;
          continue;
        }
        if (file.size > 25 * 1024 * 1024) {
          skippedOversized += 1;
          continue;
        }
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);

        const needsHeicConversion = isHeicFile(file);
        nextItems.push({
          key,
          file,
          previewUrl: needsHeicConversion ? '' : URL.createObjectURL(file),
          title: cleanTitleFromFilename(file.name),
          status: needsHeicConversion ? 'converting' : 'queued',
        });
      }

      if (nextItems.length === 0 && skippedUnsupported === 0 && skippedOversized === 0) {
        showToast('Those photos are already in your upload queue.');
      }

      return [...prev, ...nextItems];
    });

    if (suggestedFolderName && !newAlbumTitle) {
      setNewAlbumTitle(
        suggestedFolderName.replace(/[_-]+/g, ' ').slice(0, FIELD_LIMITS.ALBUM_TITLE_MAX),
      );
    }

    if (skippedOversized > 0) {
      showToast(`Skipped ${skippedOversized} image(s) larger than 25 MB.`);
    } else if (skippedUnsupported > 0 && rawFiles.length === skippedUnsupported) {
      showToast('No supported images found (JPEG, PNG, WebP, AVIF, GIF, HEIC).');
    }
  };

  const handleInputFiles = (fileList: FileList | null, fromFolder = false) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    let folderName = '';
    if (fromFolder) {
      const rel = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      if (rel.includes('/')) {
        folderName = rel.split('/')[0];
      }
    }
    addFilesToQueue(files, folderName);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (uploading) return;
    try {
      const { files, folderName } = await extractDroppedFilesAndFolderName(e.dataTransfer);
      addFilesToQueue(files, folderName);
    } catch (err) {
      console.error(err);
      showToast('Could not read dropped files or folder.');
    }
  };

  const handleRemoveItem = (key: string) => {
    if (uploading) return;
    setQueue((prev) => {
      const target = prev.find((item) => item.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.key !== key);
    });
  };

  const handleClearQueue = () => {
    if (uploading) return;
    queue.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setQueue([]);
  };

  const updateItemTitle = (key: string, nextTitle: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.key === key
          ? { ...item, title: nextTitle.slice(0, FIELD_LIMITS.ARTWORK_TITLE_MAX) }
          : item,
      ),
    );
  };

  const convertingCount = queue.filter((item) => item.status === 'converting').length;
  const uploadableItems = queue.filter((item) => item.status !== 'done');
  const existingAlbum = availableAlbums.find((a) => a.id === selectedAlbumId);
  const remainingSlots =
    selectedAlbumId === '__new__'
      ? FIELD_LIMITS.ALBUM_MAX_ARTWORKS
      : Math.max(0, FIELD_LIMITS.ALBUM_MAX_ARTWORKS - (existingAlbum?.artCount || 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || uploadableItems.length === 0 || uploading) return;

    if (uploadableItems.length > remainingSlots) {
      showToast(
        `This album can hold ${remainingSlots} more piece(s). Create a new album or trim the queue.`,
      );
      return;
    }

    setUploading(true);
    setProgress({ current: 0, total: uploadableItems.length });

    try {
      let targetAlbum: Album | undefined = existingAlbum;

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

      const albumSnapshot = targetAlbum;
      let completedCount = 0;
      let successCount = 0;
      let failureCount = 0;
      let nextIndex = 0;

      // Serialize only the lightweight album/artwork metadata commit to keep artCount strictly atomic
      let metadataCommitChain: Promise<void> = Promise.resolve();
      const enqueueMetadataCommit = (fn: () => Promise<void>) => {
        const next = metadataCommitChain.then(fn, fn);
        metadataCommitChain = next.catch(() => {});
        return next;
      };

      const workerCount = Math.min(4, uploadableItems.length);
      const runWorker = async () => {
        while (true) {
          const idx = nextIndex;
          nextIndex += 1;
          if (idx >= uploadableItems.length) break;

          const item = uploadableItems[idx];
          if (isMountedRef.current) {
            setQueue((prev) =>
              prev.map((q) =>
                q.key === item.key ? { ...q, status: 'uploading', errorMsg: undefined } : q,
              ),
            );
          }

          try {
            const latestItem =
              queueRef.current.find((q) => q.key === item.key) || item;
            const uploadReadyFile = isHeicFile(latestItem.file)
              ? await ensureFileConverted(latestItem)
              : latestItem.file;

            const uploaded = await uploadMediaFile(uploadReadyFile, albumSnapshot, user.uid);

            await enqueueMetadataCommit(async () => {
              const artworkId = await createArtworkPiece({
                album: targetAlbum!,
                owner: user,
                title: item.title.trim() || cleanTitleFromFilename(item.file.name),
                description,
                medium,
                dimensions: uploaded.dimensions,
                year,
                tags: tagsInput.split(','),
                imageUrl: uploaded.imageUrl,
                aspectRatio: uploaded.aspectRatio,
              });
              targetAlbum = {
                ...targetAlbum!,
                coverUrl: targetAlbum!.coverUrl || uploaded.imageUrl,
                artCount: targetAlbum!.artCount + 1,
                artworkIds: [...targetAlbum!.artworkIds, artworkId],
              };
            });

            successCount += 1;
            if (isMountedRef.current) {
              setQueue((prev) =>
                prev.map((q) => (q.key === item.key ? { ...q, status: 'done' } : q)),
              );
            }
          } catch (itemErr) {
            failureCount += 1;
            if (isMountedRef.current) {
              setQueue((prev) =>
                prev.map((q) =>
                  q.key === item.key
                    ? {
                        ...q,
                        status: 'error',
                        errorMsg:
                          itemErr instanceof Error ? itemErr.message : 'Upload failed',
                      }
                    : q,
                ),
              );
            }
          } finally {
            completedCount += 1;
            if (isMountedRef.current) {
              setProgress({ current: completedCount, total: uploadableItems.length });
            }
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

      if (failureCount === 0) {
        showToast(
          successCount === 1
            ? `Published "${uploadableItems[0].title.trim()}" to ${targetAlbum.title}.`
            : `Published ${successCount} artworks to ${targetAlbum.title}.`,
        );
        onUploaded(targetAlbum.id);
        onClose();
      } else {
        showToast(
          `Published ${successCount} piece(s); ${failureCount} failed and remain in queue.`,
        );
      }
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to publish artworks.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload Artwork Pieces"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0B0B0D] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <h2 className="font-display text-2xl font-medium text-zinc-100">
              Upload Artpieces
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Select photos, pick a folder, or drop files—including Apple HEIC/HEIF photos, automatically converted for universal viewing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close upload modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Hidden File & Folder Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={(e) => {
              handleInputFiles(e.target.files, false);
              e.target.value = '';
            }}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => {
              handleInputFiles(e.target.files, true);
              e.target.value = '';
            }}
            className="hidden"
          />

          {/* Multi-File & Folder Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={handleDrop}
            className={`rounded-xl border border-dashed p-5 text-center transition-colors ${
              isDragActive
                ? 'border-[#E5B84B] bg-[#E5B84B]/10'
                : 'border-zinc-700 bg-[#050505] hover:border-zinc-500'
            }`}
          >
            <ImagePlus className="mx-auto h-8 w-8 text-[#E5B84B] mb-2" strokeWidth={1.5} />
            <p className="text-sm font-medium text-zinc-100">
              Drop multiple photos or entire folders here
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Supports JPEG, PNG, WebP, AVIF, GIF, and Apple HEIC / HEIF up to 25 MB each
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-100 transition-colors hover:border-[#E5B84B]/60 hover:text-[#E5B84B] disabled:opacity-40"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span>Choose Photos</span>
              </button>

              <button
                type="button"
                disabled={uploading}
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-100 transition-colors hover:border-[#E5B84B]/60 hover:text-[#E5B84B] disabled:opacity-40"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Choose Folder</span>
              </button>
            </div>
          </div>

          {/* Queued Items List */}
          {queue.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200 tabular-nums">
                  Upload Queue ({queue.length} {queue.length === 1 ? 'piece' : 'pieces'})
                </span>
                {!uploading && (
                  <button
                    type="button"
                    onClick={handleClearQueue}
                    className="text-zinc-500 hover:text-zinc-200"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 bg-[#050505]">
                {queue.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-3.5 p-3"
                  >
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.title}
                        className="h-12 w-12 rounded-md border border-zinc-800 object-cover shrink-0"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-500 shrink-0">
                        {item.status === 'converting' ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[#E5B84B]" />
                        ) : (
                          <ImageIcon className="h-4 w-4" />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        disabled={uploading || item.status === 'done'}
                        value={item.title}
                        onChange={(e) => updateItemTitle(item.key, e.target.value)}
                        placeholder="Piece title"
                        className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-zinc-100 focus:border-zinc-700 focus:bg-[#0B0B0D] focus:outline-none"
                      />
                      <div className="mt-0.5 flex items-center gap-2 px-1.5 text-[11px] text-zinc-500 tabular-nums">
                        <span>{formatFileSize(item.file.size)}</span>
                        {item.status === 'converting' && (
                          <span className="inline-flex items-center gap-1 text-[#E5B84B]">
                            Converting HEIC to high-res JPEG...
                          </span>
                        )}
                        {item.status === 'uploading' && (
                          <span className="inline-flex items-center gap-1 text-[#E5B84B]">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Uploading to cloud...
                          </span>
                        )}
                        {item.status === 'done' && (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Published
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-rose-400 truncate">
                            {item.errorMsg || 'Failed'}
                          </span>
                        )}
                      </div>
                    </div>

                    {!uploading && item.status !== 'done' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.key)}
                        aria-label={`Remove ${item.title}`}
                        className="p-1.5 text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Album Assignment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-300">
                Assign to Album
              </label>
              <span className="text-[11px] text-zinc-500 tabular-nums">
                {remainingSlots} slots available
              </span>
            </div>
            <select
              disabled={uploading}
              value={selectedAlbumId}
              onChange={(e) => setSelectedAlbumId(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none disabled:opacity-60"
            >
              {availableAlbums.map((alb) => (
                <option key={alb.id} value={alb.id}>
                  {alb.title} ({alb.visibility} · {alb.artCount}/{FIELD_LIMITS.ALBUM_MAX_ARTWORKS})
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
                    disabled={uploading}
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
                    disabled={uploading}
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

          {/* Shared Batch Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Medium / Discipline
              </label>
              <input
                type="text"
                list="medium-presets"
                required
                disabled={uploading}
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
                disabled={uploading}
                maxLength={FIELD_LIMITS.YEAR_MAX}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 focus:border-[#E5B84B] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Curatorial Notes (applied to batch, editable individually later)
            </label>
            <textarea
              rows={2}
              disabled={uploading}
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
              disabled={uploading}
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="monochrome, minimalism, portrait"
              className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#E5B84B] focus:outline-none"
            />
          </div>

          {uploading && progress.total > 0 && (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-[#E5B84B] transition-all duration-300"
                  style={{
                    width: `${Math.round((progress.current / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-zinc-800/80 pt-4">
            <span className="text-[11px] text-zinc-500">
              {uploading
                ? `Optimizing & uploading ${progress.current} of ${progress.total} in parallel...`
                : convertingCount > 0
                  ? `Converting ${convertingCount} HEIC preview(s) — you can click Publish anytime.`
                  : 'Non-owners cannot download your uploaded images.'}
            </span>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={uploading}
                onClick={onClose}
                className="rounded-lg border border-zinc-800 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || uploadableItems.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E5B84B] px-5 py-2 text-xs font-semibold text-[#050505] hover:bg-[#f0c761] disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                <span>
                  {uploading
                    ? `Publishing ${progress.current}/${progress.total}...`
                    : uploadableItems.length > 1
                      ? `Publish ${uploadableItems.length} Pieces`
                      : 'Publish Piece'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
