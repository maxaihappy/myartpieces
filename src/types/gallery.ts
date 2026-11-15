import type { Timestamp } from 'firebase/firestore';

export type AlbumVisibility = 'public' | 'unlisted' | 'private' | 'invite';
export type InviteRole = 'viewer' | 'editor';
export type AspectRatioOption = '4:3' | '3:4' | '16:9' | '1:1' | 'auto';
export type NotificationType = 'like' | 'comment' | 'invite';

// Blueprint-synchronized validation constants (matches firebase-blueprint.json & firestore.rules)
export const FIELD_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX: 128,
  DISPLAY_NAME_MAX: 100,
  BIO_MAX: 500,
  ALBUM_TITLE_MAX: 120,
  ALBUM_DESC_MAX: 1000,
  ARTWORK_TITLE_MAX: 160,
  ARTWORK_DESC_MAX: 2000,
  MEDIUM_MAX: 80,
  DIMENSIONS_MAX: 60,
  YEAR_MAX: 12,
  TAGS_MAX_COUNT: 10,
  TAG_MAX_LEN: 40,
  COMMENT_MAX: 1000,
  URL_MAX: 1000,
  EMAIL_MAX: 254,
  ALBUM_MAX_ARTWORKS: 500,
} as const;

export interface UserPublicProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  bio: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface UserPrivateAccount {
  uid: string;
  email: string;
  pushEnabled: boolean;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface Album {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  ownerId: string;
  ownerName: string;
  ownerPhotoUrl: string;
  visibility: AlbumVisibility;
  artCount: number;
  artworkIds: string[];
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  isFeaturedShowcase?: boolean;
}

export interface AlbumInvite {
  id: string;
  email: string;
  albumId: string;
  albumTitle: string;
  coverUrl: string;
  ownerId: string;
  ownerName: string;
  role: InviteRole;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface Artwork {
  id: string;
  albumId: string;
  ownerId: string;
  ownerName: string;
  ownerPhotoUrl: string;
  title: string;
  description: string;
  medium: string;
  dimensions: string;
  year: string;
  tags: string[];
  imageUrl: string;
  aspectRatio: AspectRatioOption;
  visibility: AlbumVisibility;
  likesCount: number;
  commentsCount: number;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  isFeaturedShowcase?: boolean;
}

export interface ArtworkComment {
  id: string;
  artworkId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string;
  text: string;
  visibility: AlbumVisibility;
  artworkOwnerId: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface GalleryNotification {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  actorPhotoUrl: string;
  type: NotificationType;
  artworkId: string;
  artworkTitle: string;
  albumId: string;
  message: string;
  read: boolean;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export type AppView = 'discover' | 'albums' | 'studio' | 'shared' | 'activity' | 'album-detail';
