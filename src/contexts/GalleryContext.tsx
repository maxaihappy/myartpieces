import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  ensureUserDocuments,
  subscribeNotifications,
  subscribeOwnerInvites,
  subscribePublicAlbums,
  subscribePublicArtworks,
  subscribeReceivedInvites,
  subscribeUserAlbums,
  subscribeUserArtworks,
  updateUserPushPreference,
} from '../lib/galleryService';
import type {
  Album,
  AlbumInvite,
  Artwork,
  GalleryNotification,
  UserPrivateAccount,
  UserPublicProfile,
} from '../types/gallery';

interface LiveToast {
  id: string;
  message: string;
  artworkId?: string;
}

interface GalleryContextValue {
  user: User | null;
  authReady: boolean;
  profile: UserPublicProfile | null;
  account: UserPrivateAccount | null;
  publicAlbums: Album[];
  publicArtworks: Artwork[];
  myAlbums: Album[];
  myArtworks: Artwork[];
  receivedInvites: AlbumInvite[];
  sentInvites: AlbumInvite[];
  notifications: GalleryNotification[];
  unreadCount: number;
  liveToast: LiveToast | null;
  dismissToast: () => void;
  showToast: (message: string, artworkId?: string) => void;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  togglePushAlerts: () => Promise<void>;
}

const GalleryContext = createContext<GalleryContextValue | null>(null);

export function GalleryProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [account, setAccount] = useState<UserPrivateAccount | null>(null);

  const [publicAlbums, setPublicAlbums] = useState<Album[]>([]);
  const [publicArtworks, setPublicArtworks] = useState<Artwork[]>([]);
  const [myAlbums, setMyAlbums] = useState<Album[]>([]);
  const [myArtworks, setMyArtworks] = useState<Artwork[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<AlbumInvite[]>([]);
  const [sentInvites, setSentInvites] = useState<AlbumInvite[]>([]);
  const [notifications, setNotifications] = useState<GalleryNotification[]>([]);
  const [liveToast, setLiveToast] = useState<LiveToast | null>(null);

  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const initialNotificationsLoadedRef = useRef(false);
  const pushEnabledRef = useRef(false);

  useEffect(() => {
    pushEnabledRef.current = Boolean(account?.pushEnabled);
  }, [account?.pushEnabled]);

  const showToast = useCallback((message: string, artworkId?: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setLiveToast({ id, message, artworkId });
  }, []);

  const dismissToast = useCallback(() => {
    setLiveToast(null);
  }, []);

  useEffect(() => {
    if (!liveToast) return;
    const timer = window.setTimeout(() => setLiveToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [liveToast]);

  // Public gallery streams (accessible even when logged out!)
  useEffect(() => {
    const unsubAlbums = subscribePublicAlbums(setPublicAlbums);
    const unsubArtworks = subscribePublicArtworks(setPublicArtworks);
    return () => {
      unsubAlbums();
      unsubArtworks();
    };
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const { profile: p, account: a } = await ensureUserDocuments(nextUser);
          setProfile(p);
          setAccount(a);
        } catch (err) {
          console.error('Failed to sync user profile:', err);
        }
      } else {
        setProfile(null);
        setAccount(null);
        setMyAlbums([]);
        setMyArtworks([]);
        setReceivedInvites([]);
        setSentInvites([]);
        setNotifications([]);
        seenNotificationIdsRef.current.clear();
        initialNotificationsLoadedRef.current = false;
      }
      setAuthReady(true);
    });
    return () => unsubAuth();
  }, []);

  // Authenticated user streams
  useEffect(() => {
    if (!authReady || !user) return;
    const unsubMyAlbums = subscribeUserAlbums(user.uid, setMyAlbums);
    const unsubMyArtworks = subscribeUserArtworks(user.uid, setMyArtworks);
    const unsubSentInvites = subscribeOwnerInvites(user.uid, setSentInvites);
    const emailLower = user.email?.toLowerCase();
    const unsubReceivedInvites = emailLower
      ? subscribeReceivedInvites(emailLower, setReceivedInvites)
      : () => {};

    const unsubNotifications = subscribeNotifications(user.uid, (items) => {
      setNotifications(items);
      if (!initialNotificationsLoadedRef.current) {
        items.forEach((n) => seenNotificationIdsRef.current.add(n.id));
        initialNotificationsLoadedRef.current = true;
        return;
      }
      const brandNew = items.filter((n) => !n.read && !seenNotificationIdsRef.current.has(n.id));
      brandNew.forEach((n) => {
        seenNotificationIdsRef.current.add(n.id);
        showToast(n.message, n.artworkId);
        if (
          pushEnabledRef.current &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          window.Notification.permission === 'granted'
        ) {
          try {
            new window.Notification('MAP — My Art Piece', {
              body: n.message,
              tag: n.id,
            });
          } catch {
            // Browser prevented Notification constructor in sandboxed context; in-app toast remains active.
          }
        }
      });
    });

    return () => {
      unsubMyAlbums();
      unsubMyArtworks();
      unsubSentInvites();
      unsubReceivedInvites();
      unsubNotifications();
    };
  }, [authReady, user, showToast]);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const togglePushAlerts = useCallback(async () => {
    if (!user || !account) return;
    const nextEnabled = !account.pushEnabled;
    if (nextEnabled && typeof window !== 'undefined' && 'Notification' in window) {
      if (window.Notification.permission === 'default') {
        await window.Notification.requestPermission();
      }
    }
    await updateUserPushPreference(user.uid, account.email, nextEnabled);
    setAccount((prev) => (prev ? { ...prev, pushEnabled: nextEnabled } : prev));
    showToast(
      nextEnabled
        ? 'Live push notifications enabled for likes and comments.'
        : 'Browser push notifications paused.',
    );
  }, [user, account, showToast]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const value = useMemo<GalleryContextValue>(
    () => ({
      user,
      authReady,
      profile,
      account,
      publicAlbums,
      publicArtworks,
      myAlbums,
      myArtworks,
      receivedInvites,
      sentInvites,
      notifications,
      unreadCount,
      liveToast,
      dismissToast,
      showToast,
      signInWithGoogle,
      signOutUser,
      togglePushAlerts,
    }),
    [
      user,
      authReady,
      profile,
      account,
      publicAlbums,
      publicArtworks,
      myAlbums,
      myArtworks,
      receivedInvites,
      sentInvites,
      notifications,
      unreadCount,
      liveToast,
      dismissToast,
      showToast,
      signInWithGoogle,
      signOutUser,
      togglePushAlerts,
    ],
  );

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
}

export function useGallery() {
  const ctx = useContext(GalleryContext);
  if (!ctx) throw new Error('useGallery must be used inside GalleryProvider');
  return ctx;
}
