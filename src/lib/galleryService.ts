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
import { db, handleFirestoreError, OperationType } from './firebase';
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
  const q = query(collection(db, 'artworks'), where('ownerId', '==', uid), limit(100));
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
  }

  batch.update(albumRef, albumPayload);

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteAlbumWithArtworks(album: Album): Promise<void> {
  const path = `albums/${album.id}`;
  const batch = writeBatch(db);
  for (const artId of album.artworkIds) {
    batch.delete(doc(db, 'artworks', artId));
  }
  batch.delete(doc(db, 'albums', album.id));

  try {
    await batch.commit();
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

  try {
    await setDoc(doc(db, 'invites', inviteKey), {
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
      const ratio = w / h;
      let aspectRatio: AspectRatioOption = 'auto';
      if (Math.abs(ratio - 1) < 0.12) aspectRatio = '1:1';
      else if (ratio >= 1.55) aspectRatio = '16:9';
      else if (ratio > 1.08) aspectRatio = '4:3';
      else aspectRatio = '3:4';
      resolve({ width: w, height: h, aspectRatio });
    };
    img.onerror = () => resolve({ width: 0, height: 0, aspectRatio: 'auto' });
    img.src = dataUrl;
  });
}

export async function uploadMediaFile(
  file: File,
  ownerId: string,
): Promise<{
  imageUrl: string;
  dimensions: string;
  aspectRatio: AspectRatioOption;
}> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });

  const { width, height, aspectRatio } = await readImageDimensions(dataUrl);
  const dimensions = width && height ? `${width} × ${height} px` : '';

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataUrl,
      fileName: file.name,
      ownerId,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || 'Failed to upload image to cloud media storage.');
  }

  const result = (await response.json()) as { imageUrl: string };
  return {
    imageUrl: result.imageUrl,
    dimensions,
    aspectRatio,
  };
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
