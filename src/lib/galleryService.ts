import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  FIELD_LIMITS,
  type Album,
  type AlbumInvite,
  type AlbumVisibility,
  type Artwork,
  type ArtworkComment,
  type AspectRatioOption,
  type GalleryNotification,
  type InviteRole,
  type UserPrivateAccount,
  type UserPublicProfile,
} from '../types/gallery';

export function generateSafeId(prefix = 'id'): string {
  const raw =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw}`.slice(0, 64);
}

export function toMillis(val: Timestamp | Date | undefined | null): number {
  if (!val) return 0;
  if (val instanceof Date) return val.getTime();
  if (typeof (val as Timestamp).toMillis === 'function') return (val as Timestamp).toMillis();
  return 0;
}

export function formatRelativeDate(val: Timestamp | Date | undefined | null): string {
  const ms = toMillis(val);
  if (!ms) return 'Just now';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function ensureUserDocuments(user: User): Promise<{
  profile: UserPublicProfile;
  account: UserPrivateAccount;
}> {
  const uid = user.uid;
  const publicPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/account`;
  const publicRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'account');

  let profileSnap;
  try {
    profileSnap = await getDoc(publicRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, publicPath);
  }

  let profile: UserPublicProfile;
  if (!profileSnap.exists()) {
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Artist').slice(
      0,
      FIELD_LIMITS.DISPLAY_NAME_MAX,
    );
    const photoURL = (user.photoURL || '').slice(0, FIELD_LIMITS.URL_MAX);
    try {
      await setDoc(publicRef, {
        uid,
        displayName,
        photoURL,
        bio: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const fresh = await getDoc(publicRef);
      profile = fresh.data() as UserPublicProfile;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, publicPath);
    }
  } else {
    profile = profileSnap.data() as UserPublicProfile;
  }

  let accountSnap;
  try {
    accountSnap = await getDoc(privateRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, privatePath);
  }

  let account: UserPrivateAccount;
  if (!accountSnap.exists()) {
    const email = (user.email || '').toLowerCase().slice(0, FIELD_LIMITS.EMAIL_MAX);
    try {
      await setDoc(privateRef, {
        uid,
        email,
        pushEnabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const fresh = await getDoc(privateRef);
      account = fresh.data() as UserPrivateAccount;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, privatePath);
    }
  } else {
    account = accountSnap.data() as UserPrivateAccount;
  }

  return { profile, account };
}

export async function updateUserProfile(uid: string, displayName: string, photoURL: string, bio: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: displayName.trim().slice(0, FIELD_LIMITS.DISPLAY_NAME_MAX) || 'Artist',
      photoURL: photoURL.slice(0, FIELD_LIMITS.URL_MAX),
      bio: bio.trim().slice(0, FIELD_LIMITS.BIO_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateUserPushPreference(uid: string, email: string, pushEnabled: boolean): Promise<void> {
  const path = `users/${uid}/private/account`;
  try {
    await updateDoc(doc(db, 'users', uid, 'private', 'account'), {
      pushEnabled,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribePublicAlbums(callback: (albums: Album[]) => void): Unsubscribe {
  const path = 'albums';
  const q = query(collection(db, 'albums'), where('visibility', '==', 'public'), limit(40));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Album);
      items.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export function subscribePublicArtworks(callback: (artworks: Artwork[]) => void): Unsubscribe {
  const path = 'artworks';
  const q = query(collection(db, 'artworks'), where('visibility', '==', 'public'), limit(60));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Artwork);
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export function subscribeUserAlbums(uid: string, callback: (albums: Album[]) => void): Unsubscribe {
  const path = 'albums';
  const q = query(collection(db, 'albums'), where('ownerId', '==', uid), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Album);
      items.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export function subscribeUserArtworks(uid: string, callback: (artworks: Artwork[]) => void): Unsubscribe {
  const path = 'artworks';
  const q = query(collection(db, 'artworks'), where('ownerId', '==', uid), limit(500));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Artwork);
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export function subscribeReceivedInvites(emailLower: string, callback: (invites: AlbumInvite[]) => void): Unsubscribe {
  const path = 'invites';
  const q = query(collection(db, 'invites'), where('email', '==', emailLower), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as AlbumInvite);
      items.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export function subscribeOwnerInvites(ownerId: string, callback: (invites: AlbumInvite[]) => void): Unsubscribe {
  const path = 'invites';
  const q = query(collection(db, 'invites'), where('ownerId', '==', ownerId), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as AlbumInvite);
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export function subscribeNotifications(
  uid: string,
  callback: (notifications: GalleryNotification[]) => void,
): Unsubscribe {
  const path = `users/${uid}/notifications`;
  const q = query(collection(db, 'users', uid, 'notifications'), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as GalleryNotification);
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export async function createAlbum(params: {
  title: string;
  description: string;
  visibility: AlbumVisibility;
  owner: User;
}): Promise<string> {
  const albumId = generateSafeId('alb');
  const path = `albums/${albumId}`;
  const ownerName = (params.owner.displayName || params.owner.email?.split('@')[0] || 'Artist').slice(
    0,
    FIELD_LIMITS.DISPLAY_NAME_MAX,
  );

  try {
    await setDoc(doc(db, 'albums', albumId), {
      id: albumId,
      title: params.title.trim().slice(0, FIELD_LIMITS.ALBUM_TITLE_MAX),
      description: params.description.trim().slice(0, FIELD_LIMITS.ALBUM_DESC_MAX),
      coverUrl: '',
      ownerId: params.owner.uid,
      ownerName,
      ownerPhotoUrl: (params.owner.photoURL || '').slice(0, FIELD_LIMITS.URL_MAX),
      visibility: params.visibility,
      artCount: 0,
      artworkIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return albumId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateAlbumDetails(params: {
  album: Album;
  title: string;
  description: string;
  visibility?: AlbumVisibility;
  isOwner: boolean;
}): Promise<void> {
  const { album, title, description, visibility, isOwner } = params;
  const path = `albums/${album.id}`;
  const batch = writeBatch(db);
  const albumRef = doc(db, 'albums', album.id);

  const albumPayload: Record<string, unknown> = {
    title: title.trim().slice(0, FIELD_LIMITS.ALBUM_TITLE_MAX),
    description: description.trim().slice(0, FIELD_LIMITS.ALBUM_DESC_MAX),
    updatedAt: serverTimestamp(),
  };

  if (isOwner && visibility && visibility !== album.visibility) {
    albumPayload.visibility = visibility;
    for (const artId of album.artworkIds) {
      batch.update(doc(db, 'artworks', artId), {
        visibility,
        updatedAt: serverTimestamp(),
      });
    }
    const artworks = await fetchArtworksByIds(album.artworkIds);
    for (const art of artworks) {
      if (art.imageUrl.startsWith('cloud://media/')) {
        const mediaId = art.imageUrl.replace('cloud://media/', '');
        batch.update(doc(db, 'media', mediaId), {
          visibility,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  batch.update(albumRef, albumPayload);

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

async function deleteCloudMediaRecord(imageUrl: string): Promise<void> {
  if (!imageUrl.startsWith('cloud://media/')) return;
  const mediaId = imageUrl.replace('cloud://media/', '');
  try {
    const mediaSnap = await getDoc(doc(db, 'media', mediaId));
    if (!mediaSnap.exists()) return;
    const chunkCount = (mediaSnap.data().chunkCount as number) || 0;
    const batch = writeBatch(db);
    for (let i = 0; i < chunkCount; i++) {
      batch.delete(doc(db, 'media', mediaId, 'chunks', `chunk_${i}`));
    }
    batch.delete(doc(db, 'media', mediaId));
    await batch.commit();
  } catch (err) {
    console.warn('Cloud media cleanup skipped:', err);
  }
}

export async function deleteAlbumWithArtworks(album: Album): Promise<void> {
  const path = `albums/${album.id}`;
  const artworks = await fetchArtworksByIds(album.artworkIds);
  const batch = writeBatch(db);
  for (const artId of album.artworkIds) {
    batch.delete(doc(db, 'artworks', artId));
  }
  batch.delete(doc(db, 'albums', album.id));

  try {
    await batch.commit();
    await Promise.all(artworks.map((a) => deleteCloudMediaRecord(a.imageUrl)));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function inviteUserToAlbum(params: {
  album: Album;
  email: string;
  role: InviteRole;
}): Promise<void> {
  const emailLower = params.email.trim().toLowerCase().slice(0, FIELD_LIMITS.EMAIL_MAX);
  const inviteKey = `${params.album.id}__${emailLower}`;
  const path = `invites/${inviteKey}`;
  const inviteRef = doc(db, 'invites', inviteKey);

  try {
    const existingSnap = await getDoc(inviteRef);
    if (existingSnap.exists()) {
      await updateDoc(inviteRef, {
        role: params.role,
        albumTitle: params.album.title.slice(0, FIELD_LIMITS.ALBUM_TITLE_MAX),
        coverUrl: (params.album.coverUrl || '').slice(0, FIELD_LIMITS.URL_MAX),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(inviteRef, {
        id: inviteKey,
        email: emailLower,
        albumId: params.album.id,
        albumTitle: params.album.title.slice(0, FIELD_LIMITS.ALBUM_TITLE_MAX),
        coverUrl: (params.album.coverUrl || '').slice(0, FIELD_LIMITS.URL_MAX),
        ownerId: params.album.ownerId,
        ownerName: params.album.ownerName.slice(0, FIELD_LIMITS.DISPLAY_NAME_MAX),
        role: params.role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function revokeAlbumInvite(inviteKey: string): Promise<void> {
  const path = `invites/${inviteKey}`;
  try {
    await deleteDoc(doc(db, 'invites', inviteKey));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchAlbumById(albumId: string): Promise<Album | null> {
  const path = `albums/${albumId}`;
  try {
    const snap = await getDoc(doc(db, 'albums', albumId));
    return snap.exists() ? (snap.data() as Album) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function fetchArtworksByIds(artworkIds: string[]): Promise<Artwork[]> {
  if (artworkIds.length === 0) return [];
  const results = await Promise.all(
    artworkIds.map(async (id) => {
      const path = `artworks/${id}`;
      try {
        const snap = await getDoc(doc(db, 'artworks', id));
        return snap.exists() ? (snap.data() as Artwork) : null;
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, path);
      }
    }),
  );
  return results.filter((item): item is Artwork => item !== null);
}

function computeAspectRatio(width: number, height: number): AspectRatioOption {
  if (!width || !height) return 'auto';
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.12) return '1:1';
  if (ratio >= 1.55) return '16:9';
  if (ratio > 1.08) return '4:3';
  return '3:4';
}

export async function readImageDimensions(dataUrl: string): Promise<{
  width: number;
  height: number;
  aspectRatio: AspectRatioOption;
}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1600;
      const h = img.naturalHeight || 1200;
      resolve({ width: w, height: h, aspectRatio: computeAspectRatio(w, h) });
    };
    img.onerror = () => resolve({ width: 0, height: 0, aspectRatio: 'auto' });
    img.src = dataUrl;
  });
}

const CLOUD_CHUNK_CHARS = 700000;
const MAX_CLOUD_BASE64_CHARS = CLOUD_CHUNK_CHARS * 35;
const FAST_UPLOAD_MAX_EDGE = 2560;
const FAST_UPLOAD_BYPASS_BYTES = 480 * 1024;

interface CachedCloudMedia {
  objectUrl: string;
  mimeType: string;
  fileName: string;
  blob: Blob;
}

const cloudMediaCache = new Map<string, CachedCloudMedia>();
const inFlightCloudMedia = new Map<string, Promise<CachedCloudMedia>>();

async function loadImageSourceFromBlob(blob: Blob): Promise<{
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  release: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement below
    }
  }

  const objUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || 1600,
        height: img.naturalHeight || 1200,
        release: () => URL.revokeObjectURL(objUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Could not decode image dimensions.'));
    };
    img.src = objUrl;
  });
}

async function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), mimeType, quality);
  });
}

async function encodeCanvasToGalleryBlob(
  canvas: HTMLCanvasElement,
  quality = 0.85,
): Promise<Blob> {
  const webpBlob = await canvasToBlobAsync(canvas, 'image/webp', quality);
  if (webpBlob && webpBlob.type === 'image/webp' && webpBlob.size > 0) {
    return webpBlob;
  }
  const jpegBlob = await canvasToBlobAsync(canvas, 'image/jpeg', quality);
  if (jpegBlob && jpegBlob.size > 0) {
    return jpegBlob;
  }
  throw new Error('Could not encode image in browser canvas.');
}

async function blobToBase64Parts(blob: Blob): Promise<{ mimeType: string; base64Body: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read encoded image data.'));
    reader.readAsDataURL(blob);
  });
  const commaIdx = dataUrl.indexOf(',');
  const header = commaIdx >= 0 ? dataUrl.slice(0, commaIdx) : '';
  const base64Body = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const mimeMatch = /^data:([^;]+);base64$/i.exec(header);
  const mimeType = (mimeMatch?.[1] || blob.type || 'image/jpeg').toLowerCase().slice(0, 64);
  return { mimeType, base64Body };
}

async function prepareOptimizedGalleryBlob(file: File): Promise<{
  blob: Blob;
  width: number;
  height: number;
  aspectRatio: AspectRatioOption;
}> {
  const normalizedType = (file.type || '').toLowerCase();

  // Preserve animated GIFs under 14 MB untouched
  if (normalizedType === 'image/gif' && file.size <= 14 * 1024 * 1024) {
    const loaded = await loadImageSourceFromBlob(file);
    const width = loaded.width;
    const height = loaded.height;
    loaded.release();
    return {
      blob: file,
      width,
      height,
      aspectRatio: computeAspectRatio(width, height),
    };
  }

  const loaded = await loadImageSourceFromBlob(file);
  try {
    const { source, width, height } = loaded;
    const maxDim = Math.max(width, height);
    const isStandardSmallFile =
      file.size <= FAST_UPLOAD_BYPASS_BYTES &&
      maxDim <= FAST_UPLOAD_MAX_EDGE &&
      /^image\/(jpeg|jpg|png|webp|avif)$/i.test(normalizedType);

    if (isStandardSmallFile) {
      return {
        blob: file,
        width,
        height,
        aspectRatio: computeAspectRatio(width, height),
      };
    }

    let targetW = width;
    let targetH = height;
    if (maxDim > FAST_UPLOAD_MAX_EDGE) {
      if (width >= height) {
        targetH = Math.max(1, Math.round((height * FAST_UPLOAD_MAX_EDGE) / width));
        targetW = FAST_UPLOAD_MAX_EDGE;
      } else {
        targetW = Math.max(1, Math.round((width * FAST_UPLOAD_MAX_EDGE) / height));
        targetH = FAST_UPLOAD_MAX_EDGE;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize image canvas processor.');
    }
    ctx.drawImage(source, 0, 0, targetW, targetH);

    let encoded = await encodeCanvasToGalleryBlob(canvas, 0.85);
    if (encoded.size > 4.5 * 1024 * 1024) {
      encoded = await encodeCanvasToGalleryBlob(canvas, 0.76);
    }

    // If original file was already smaller than canvas output and within edge limit, keep original
    const finalBlob =
      maxDim <= FAST_UPLOAD_MAX_EDGE &&
      file.size <= encoded.size &&
      /^image\/(jpeg|jpg|png|webp|avif)$/i.test(normalizedType)
        ? file
        : encoded;

    return {
      blob: finalBlob,
      width: targetW,
      height: targetH,
      aspectRatio: computeAspectRatio(targetW, targetH),
    };
  } finally {
    loaded.release();
  }
}

async function storeCloudMediaBlob(params: {
  blob: Blob;
  fileName: string;
  albumId: string;
  visibility: AlbumVisibility;
  ownerId: string;
}): Promise<{ mediaId: string; imageUrl: string }> {
  const { mimeType, base64Body } = await blobToBase64Parts(params.blob);
  if (base64Body.length > MAX_CLOUD_BASE64_CHARS) {
    throw new Error('Image exceeds maximum cloud gallery upload size (15 MB).');
  }

  const chunks: string[] = [];
  for (let i = 0; i < base64Body.length; i += CLOUD_CHUNK_CHARS) {
    chunks.push(base64Body.slice(i, i + CLOUD_CHUNK_CHARS));
  }

  const mediaId = generateSafeId('med');
  const approxBytes = Math.min(15000000, Math.max(1, Math.floor((base64Body.length * 3) / 4)));

  try {
    // Write media header + first slice of chunks in ONE batch commit (single round-trip for <= 8 chunks!)
    const firstSlice = chunks.slice(0, 8);
    const firstBatch = writeBatch(db);
    firstBatch.set(doc(db, 'media', mediaId), {
      id: mediaId,
      ownerId: params.ownerId,
      albumId: params.albumId,
      visibility: params.visibility,
      mimeType,
      fileName: (params.fileName || `${mediaId}.webp`).slice(0, 160),
      chunkCount: chunks.length,
      sizeBytes: approxBytes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    firstSlice.forEach((chunkData, index) => {
      firstBatch.set(doc(db, 'media', mediaId, 'chunks', `chunk_${index}`), {
        index,
        ownerId: params.ownerId,
        data: chunkData,
      });
    });
    await firstBatch.commit();

    // Commit any remaining chunks in batches of 8 if image > ~4 MB
    for (let start = 8; start < chunks.length; start += 8) {
      const batch = writeBatch(db);
      const slice = chunks.slice(start, start + 8);
      slice.forEach((chunkData, offset) => {
        const index = start + offset;
        batch.set(doc(db, 'media', mediaId, 'chunks', `chunk_${index}`), {
          index,
          ownerId: params.ownerId,
          data: chunkData,
        });
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `media/${mediaId}`);
  }

  const objectUrl = URL.createObjectURL(params.blob);
  cloudMediaCache.set(mediaId, {
    objectUrl,
    mimeType,
    fileName: params.fileName || `${mediaId}.webp`,
    blob: params.blob,
  });

  return {
    mediaId,
    imageUrl: `cloud://media/${mediaId}`,
  };
}

export async function uploadMediaFile(
  file: File,
  album: Album,
  ownerId: string,
): Promise<{
  imageUrl: string;
  dimensions: string;
  aspectRatio: AspectRatioOption;
}> {
  const prepared = await prepareOptimizedGalleryBlob(file);
  const dimensions =
    prepared.width && prepared.height ? `${prepared.width} × ${prepared.height} px` : '';

  const stored = await storeCloudMediaBlob({
    blob: prepared.blob,
    fileName: file.name || 'artwork.webp',
    albumId: album.id,
    visibility: album.visibility,
    ownerId,
  });

  return {
    imageUrl: stored.imageUrl,
    dimensions,
    aspectRatio: prepared.aspectRatio,
  };
}

async function resolveArtworkToBlob(imageUrl: string): Promise<{ blob: Blob; fileName: string }> {
  if (imageUrl.startsWith('cloud://media/')) {
    const resolved = await resolveCloudMedia(imageUrl);
    if (!resolved) {
      throw new Error('Could not resolve artwork image from cloud storage.');
    }
    return { blob: resolved.blob, fileName: resolved.fileName };
  }

  const resp = await fetch(imageUrl);
  if (!resp.ok) {
    throw new Error('Could not load artwork image for rotation.');
  }
  const blob = await resp.blob();
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  return { blob, fileName: `artwork.${ext}` };
}

export async function rotateAndSaveArtwork(
  artwork: Artwork,
  degrees: 90 | 180 | 270,
): Promise<{
  imageUrl: string;
  dimensions: string;
  aspectRatio: AspectRatioOption;
}> {
  const { blob: sourceBlob, fileName } = await resolveArtworkToBlob(artwork.imageUrl);
  const loaded = await loadImageSourceFromBlob(sourceBlob);

  let rotatedBlob: Blob;
  let targetW: number;
  let targetH: number;

  try {
    const swapAxes = degrees === 90 || degrees === 270;
    targetW = swapAxes ? loaded.height : loaded.width;
    targetH = swapAxes ? loaded.width : loaded.height;

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize image rotation canvas.');
    }

    ctx.translate(targetW / 2, targetH / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(loaded.source, -loaded.width / 2, -loaded.height / 2, loaded.width, loaded.height);

    rotatedBlob = await encodeCanvasToGalleryBlob(canvas, 0.9);
  } finally {
    loaded.release();
  }

  const aspectRatio = computeAspectRatio(targetW, targetH);
  const dimensions = `${targetW} × ${targetH} px`;

  const mediaOwnerId = auth.currentUser?.uid || artwork.ownerId;
  const stored = await storeCloudMediaBlob({
    blob: rotatedBlob,
    fileName,
    albumId: artwork.albumId,
    visibility: artwork.visibility,
    ownerId: mediaOwnerId,
  });

  const batch = writeBatch(db);
  batch.update(doc(db, 'artworks', artwork.id), {
    imageUrl: stored.imageUrl,
    dimensions,
    aspectRatio,
    updatedAt: serverTimestamp(),
  });

  // Keep album cover in sync if this artwork is currently the album cover
  try {
    const albumSnap = await getDoc(doc(db, 'albums', artwork.albumId));
    if (albumSnap.exists()) {
      const albumData = albumSnap.data() as Album;
      if (albumData.coverUrl === artwork.imageUrl) {
        batch.update(doc(db, 'albums', artwork.albumId), {
          coverUrl: stored.imageUrl,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch {
    // Non-fatal if album cover sync check fails
  }

  try {
    await batch.commit();
  } catch (err) {
    // Clean up newly uploaded media on metadata failure
    await deleteCloudMediaRecord(stored.imageUrl);
    handleFirestoreError(err, OperationType.UPDATE, `artworks/${artwork.id}`);
  }

  // Clean up previous cloud media record asynchronously
  void deleteCloudMediaRecord(artwork.imageUrl);

  return {
    imageUrl: stored.imageUrl,
    dimensions,
    aspectRatio,
  };
}

export async function resolveCloudMedia(imageUrl: string): Promise<CachedCloudMedia | null> {
  if (!imageUrl.startsWith('cloud://media/')) return null;
  const mediaId = imageUrl.replace('cloud://media/', '');
  const cached = cloudMediaCache.get(mediaId);
  if (cached) return cached;

  const existingPromise = inFlightCloudMedia.get(mediaId);
  if (existingPromise) return existingPromise;

  const loader = (async () => {
    const mediaPath = `media/${mediaId}`;
    let mediaSnap;
    try {
      mediaSnap = await getDoc(doc(db, 'media', mediaId));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, mediaPath);
    }
    if (!mediaSnap.exists()) {
      throw new Error('Cloud media asset not found.');
    }

    const meta = mediaSnap.data() as {
      chunkCount: number;
      mimeType: string;
      fileName: string;
    };

    const chunkSnaps = await Promise.all(
      Array.from({ length: meta.chunkCount }, async (_, index) => {
        const chunkPath = `media/${mediaId}/chunks/chunk_${index}`;
        try {
          return await getDoc(doc(db, 'media', mediaId, 'chunks', `chunk_${index}`));
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, chunkPath);
        }
      }),
    );

    const base64Full = chunkSnaps
      .map((snap) => (snap.exists() ? (snap.data().data as string) : ''))
      .join('');

    if (!base64Full) {
      throw new Error('Cloud media chunks missing.');
    }

    const binaryStr = atob(base64Full);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: meta.mimeType || 'image/jpeg' });
    const objectUrl = URL.createObjectURL(blob);
    const entry: CachedCloudMedia = {
      objectUrl,
      mimeType: meta.mimeType || 'image/jpeg',
      fileName: meta.fileName || `${mediaId}.jpg`,
      blob,
    };
    cloudMediaCache.set(mediaId, entry);
    return entry;
  })();

  inFlightCloudMedia.set(mediaId, loader);
  try {
    return await loader;
  } finally {
    inFlightCloudMedia.delete(mediaId);
  }
}

export async function downloadOriginalArtwork(
  artwork: Artwork,
  uid: string,
): Promise<void> {
  if (artwork.imageUrl.startsWith('cloud://media/')) {
    const resolved = await resolveCloudMedia(artwork.imageUrl);
    if (!resolved) throw new Error('Could not resolve artwork file from cloud.');
    const a = document.createElement('a');
    a.href = resolved.objectUrl;
    a.download = resolved.fileName || `${artwork.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  if (artwork.imageUrl.startsWith('/api/media/')) {
    const filename = artwork.imageUrl.replace('/api/media/', '');
    const downloadUrl = `/api/media/${filename}/download?uid=${encodeURIComponent(uid)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${artwork.title.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export async function createArtworkPiece(params: {
  album: Album;
  owner: User;
  title: string;
  description: string;
  medium: string;
  dimensions: string;
  year: string;
  tags: string[];
  imageUrl: string;
  aspectRatio: AspectRatioOption;
}): Promise<string> {
  const artworkId = generateSafeId('art');
  const path = `artworks/${artworkId}`;
  const ownerName = (params.owner.displayName || params.owner.email?.split('@')[0] || 'Artist').slice(
    0,
    FIELD_LIMITS.DISPLAY_NAME_MAX,
  );
  const cleanTags = params.tags
    .map((t) => t.trim().slice(0, FIELD_LIMITS.TAG_MAX_LEN))
    .filter(Boolean)
    .slice(0, FIELD_LIMITS.TAGS_MAX_COUNT);

  const batch = writeBatch(db);
  batch.set(doc(db, 'artworks', artworkId), {
    id: artworkId,
    albumId: params.album.id,
    ownerId: params.owner.uid,
    ownerName,
    ownerPhotoUrl: (params.owner.photoURL || '').slice(0, FIELD_LIMITS.URL_MAX),
    title: params.title.trim().slice(0, FIELD_LIMITS.ARTWORK_TITLE_MAX),
    description: params.description.trim().slice(0, FIELD_LIMITS.ARTWORK_DESC_MAX),
    medium: params.medium.trim().slice(0, FIELD_LIMITS.MEDIUM_MAX) || 'Digital Art',
    dimensions: params.dimensions.trim().slice(0, FIELD_LIMITS.DIMENSIONS_MAX),
    year: params.year.trim().slice(0, FIELD_LIMITS.YEAR_MAX) || String(new Date().getFullYear()),
    tags: cleanTags,
    imageUrl: params.imageUrl.slice(0, FIELD_LIMITS.URL_MAX),
    aspectRatio: params.aspectRatio,
    visibility: params.album.visibility,
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'albums', params.album.id), {
    artCount: increment(1),
    artworkIds: arrayUnion(artworkId),
    coverUrl: (params.album.coverUrl || params.imageUrl).slice(0, FIELD_LIMITS.URL_MAX),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return artworkId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateArtworkPiece(params: {
  artworkId: string;
  title: string;
  description: string;
  medium: string;
  year: string;
  tags: string[];
}): Promise<void> {
  const path = `artworks/${params.artworkId}`;
  const cleanTags = params.tags
    .map((t) => t.trim().slice(0, FIELD_LIMITS.TAG_MAX_LEN))
    .filter(Boolean)
    .slice(0, FIELD_LIMITS.TAGS_MAX_COUNT);

  try {
    await updateDoc(doc(db, 'artworks', params.artworkId), {
      title: params.title.trim().slice(0, FIELD_LIMITS.ARTWORK_TITLE_MAX),
      description: params.description.trim().slice(0, FIELD_LIMITS.ARTWORK_DESC_MAX),
      medium: params.medium.trim().slice(0, FIELD_LIMITS.MEDIUM_MAX) || 'Digital Art',
      year: params.year.trim().slice(0, FIELD_LIMITS.YEAR_MAX),
      tags: cleanTags,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteArtworkPiece(artwork: Artwork): Promise<void> {
  const path = `artworks/${artwork.id}`;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'artworks', artwork.id));
  batch.update(doc(db, 'albums', artwork.albumId), {
    artCount: increment(-1),
    artworkIds: arrayRemove(artwork.id),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    await deleteCloudMediaRecord(artwork.imageUrl);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function hasUserLikedArtwork(artworkId: string, uid: string): Promise<boolean> {
  const path = `artworks/${artworkId}/likes/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'artworks', artworkId, 'likes', uid));
    return snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function toggleArtworkLike(artwork: Artwork, user: User, currentlyLiked: boolean): Promise<boolean> {
  const path = `artworks/${artwork.id}/likes/${user.uid}`;
  const batch = writeBatch(db);
  const likeRef = doc(db, 'artworks', artwork.id, 'likes', user.uid);
  const artworkRef = doc(db, 'artworks', artwork.id);
  const actorName = (user.displayName || user.email?.split('@')[0] || 'Collector').slice(
    0,
    FIELD_LIMITS.DISPLAY_NAME_MAX,
  );

  if (currentlyLiked) {
    batch.delete(likeRef);
    batch.update(artworkRef, {
      likesCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(likeRef, {
      userId: user.uid,
      userName: actorName,
      createdAt: serverTimestamp(),
    });
    batch.update(artworkRef, {
      likesCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    if (artwork.ownerId !== user.uid) {
      const notifId = generateSafeId('ntf');
      batch.set(doc(db, 'users', artwork.ownerId, 'notifications', notifId), {
        id: notifId,
        recipientId: artwork.ownerId,
        actorId: user.uid,
        actorName,
        actorPhotoUrl: (user.photoURL || '').slice(0, FIELD_LIMITS.URL_MAX),
        type: 'like',
        artworkId: artwork.id,
        artworkTitle: artwork.title.slice(0, FIELD_LIMITS.ARTWORK_TITLE_MAX),
        albumId: artwork.albumId,
        message: `${actorName} appreciated "${artwork.title}"`,
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
    return !currentlyLiked;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeArtworkComments(
  artworkId: string,
  callback: (comments: ArtworkComment[]) => void,
): Unsubscribe {
  const path = `artworks/${artworkId}/comments`;
  const q = query(collection(db, 'artworks', artworkId, 'comments'), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as ArtworkComment);
      items.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path),
  );
}

export async function addArtworkComment(artwork: Artwork, user: User, text: string): Promise<void> {
  const commentId = generateSafeId('cmt');
  const path = `artworks/${artwork.id}/comments/${commentId}`;
  const actorName = (user.displayName || user.email?.split('@')[0] || 'Viewer').slice(
    0,
    FIELD_LIMITS.DISPLAY_NAME_MAX,
  );
  const cleanText = text.trim().slice(0, FIELD_LIMITS.COMMENT_MAX);
  if (!cleanText) return;

  const batch = writeBatch(db);
  batch.set(doc(db, 'artworks', artwork.id, 'comments', commentId), {
    id: commentId,
    artworkId: artwork.id,
    authorId: user.uid,
    authorName: actorName,
    authorPhotoUrl: (user.photoURL || '').slice(0, FIELD_LIMITS.URL_MAX),
    text: cleanText,
    visibility: artwork.visibility,
    artworkOwnerId: artwork.ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'artworks', artwork.id), {
    commentsCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  if (artwork.ownerId !== user.uid) {
    const notifId = generateSafeId('ntf');
    batch.set(doc(db, 'users', artwork.ownerId, 'notifications', notifId), {
      id: notifId,
      recipientId: artwork.ownerId,
      actorId: user.uid,
      actorName,
      actorPhotoUrl: (user.photoURL || '').slice(0, FIELD_LIMITS.URL_MAX),
      type: 'comment',
      artworkId: artwork.id,
      artworkTitle: artwork.title.slice(0, FIELD_LIMITS.ARTWORK_TITLE_MAX),
      albumId: artwork.albumId,
      message: `${actorName} commented on "${artwork.title}": ${cleanText.slice(0, 90)}`,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteArtworkComment(artworkId: string, commentId: string): Promise<void> {
  const path = `artworks/${artworkId}/comments/${commentId}`;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'artworks', artworkId, 'comments', commentId));
  batch.update(doc(db, 'artworks', artworkId), {
    commentsCount: increment(-1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function markNotificationRead(uid: string, notificationId: string): Promise<void> {
  const path = `users/${uid}/notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsRead(uid: string, notifications: GalleryNotification[]): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;
  const path = `users/${uid}/notifications`;
  const batch = writeBatch(db);
  for (const item of unread) {
    batch.update(doc(db, 'users', uid, 'notifications', item.id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchArtworkById(artworkId: string): Promise<Artwork | null> {
  const path = `artworks/${artworkId}`;
  try {
    const snap = await getDoc(doc(db, 'artworks', artworkId));
    return snap.exists() ? (snap.data() as Artwork) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function fetchAlbumsBatch(albumIds: string[]): Promise<Album[]> {
  const uniqueIds = Array.from(new Set(albumIds));
  const items = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'albums', id));
        return snap.exists() ? (snap.data() as Album) : null;
      } catch {
        return null;
      }
    }),
  );
  return items.filter((a): a is Album => a !== null);
}

// Keep unused getDocs import satisfied or export helper if needed
export { getDocs };
