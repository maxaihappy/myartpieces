import React from 'react';
import { Upload } from 'lucide-react';
import mapLogo from '../assets/images/map_gallery_logo_1794683974787.jpg';
import type { User } from 'firebase/auth';
import type { AppView } from '../types/gallery';

interface TopBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  user: User | null;
  unreadCount: number;
  onSignIn: () => void;
  onOpenUpload: () => void;
}

export function TopBar({
  activeView,
  onNavigate,
  user,
  unreadCount,
  onSignIn,
  onOpenUpload,
}: TopBarProps) {
  const navItems: { id: AppView; label: string }[] = [
    { id: 'discover', label: 'Discover' },
    { id: 'albums', label: 'Albums' },
    { id: 'studio', label: 'My Studio' },
    { id: 'shared', label: 'Shared' },
    ...(user
      ? [
          {
            id: 'activity' as AppView,
            label: unreadCount > 0 ? `Activity (${unreadCount})` : 'Activity',
          },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#050505]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5 lg:px-10">
        {/* Zone 1: Single-element brand emblem + wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('discover')}
          aria-label="MAP — My Art Piece Home"
          className="inline-flex items-center gap-3 font-display text-2xl font-semibold tracking-tight text-zinc-100 transition-colors hover:text-[#E5B84B] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B84B]"
        >
          <img
            src={mapLogo}
            alt="MAP Logo"
            className="h-9 w-9 rounded-sm object-cover shrink-0"
          />
          <span>MAP</span>
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          aria-label="Primary Gallery Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-normal text-zinc-400"
        >
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B84B] ${
                  isActive
                    ? 'text-zinc-100 font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-[#E5B84B]'
                    : 'hover:text-zinc-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action CTA */}
        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={onOpenUpload}
              className="inline-flex items-center gap-2 rounded-lg bg-[#E5B84B] px-4 py-2 text-xs font-semibold tracking-wide text-[#050505] transition-all duration-150 hover:bg-[#f0c761] active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B84B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]"
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={2} />
              <span>Upload</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center rounded-lg bg-[#E5B84B] px-4 py-2 text-xs font-semibold tracking-wide text-[#050505] transition-all duration-150 hover:bg-[#f0c761] active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B84B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]"
            >
              Sign in with Google
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        aria-label="Mobile Gallery Navigation"
        className="flex md:hidden items-center gap-5 overflow-x-auto border-t border-zinc-900 px-6 py-2.5 text-xs text-zinc-400"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors ${
                isActive ? 'text-[#E5B84B] font-medium' : 'hover:text-zinc-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
