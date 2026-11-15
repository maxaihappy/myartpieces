import React, { useMemo, useState } from 'react';
import { Check, Copy, Mail, Trash2, UserPlus, X } from 'lucide-react';
import { useGallery } from '../contexts/GalleryContext';
import {
  createAlbum,
  inviteUserToAlbum,
  revokeAlbumInvite,
  updateAlbumDetails,
} from '../lib/galleryService';
import {
  FIELD_LIMITS,
  type Album,
  type AlbumVisibility,
  type InviteRole,
} from '../types/gallery';

interface AlbumModalProps {
  existingAlbum?: Album | null;
  onClose: () => void;
  onSaved?: (albumId: string) => void;
}

const VISIBILITY_OPTIONS: {
  value: AlbumVisibility;
  label: string;
  desc: string;
}[] = [
  {
    value: 'public',
    label: 'Public Gallery',
    desc: 'Visible to everyone in Discover and Public Albums without signing in.',
  },
  {
    value: 'unlisted',
    label: 'Direct Link Only',
    desc: 'Hidden from public feeds; anyone with the direct gallery URL can view.',
  },
  {
    value: 'invite',
    label: 'Invite Only (Email)',
    desc: 'Accessible strictly to Gmail accounts you explicitly invite below.',
  },
  {
    value: 'private',
    label: 'Private Archive',
    desc: 'Personal reference only. Visible exclusively to you.',
  },
];

export function AlbumModal({ existingAlbum, onClose, onSaved }: AlbumModalProps) {
  const { user, sentInvites, showToast } = useGallery();
  const isOwner = !existingAlbum || existingAlbum.ownerId === user?.uid;

  const [title, setTitle] = useState(existingAlbum?.title || '');
  const [description, setDescription] = useState(existingAlbum?.description || '');
  const [visibility, setVisibility] = useState<AlbumVisibility>(
    existingAlbum?.visibility || 'public',
  );
  const [saving, setSaving] = useState(false);

  // Invite management state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('viewer');
  const [inviting, setInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const albumInvites = useMemo(
    () =>
      existingAlbum
        ? sentInvites.filter((inv) => inv.albumId === existingAlbum.id)
        : [],
    [existingAlbum, sentInvites],
  );

  const directShareUrl = existingAlbum
    ? `${window.location.origin}/album/${existingAlbum.id}`
    : '';

  const handleCopyLink = async () => {
    if (!directShareUrl) return;
    try {
      await navigator.clipboard.writeText(directShareUrl);
      setCopiedLink(true);
      showToast('Direct gallery link copied.');
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      showToast('Copy failed — please copy the URL from the field.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || saving) return;
    setSaving(true);
    try {
      if (existingAlbum) {
        await updateAlbumDetails({
          album: existingAlbum,
          title,
          description,
          visibility: isOwner ? visibility : undefined,
          isOwner,
        });
        showToast('Album details saved.');
        onSaved?.(existingAlbum.id);
      } else {
        const newId = await createAlbum({
          title,
          description,
          visibility,
          owner: user,
        });
        showToast('Custom album created.');
        onSaved?.(newId);
      }
      onClose();
    } catch (err) {
      console.error(err);
      showToast('Unable to save album. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingAlbum || !isOwner || inviting) return;
    const cleaned = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      showToast('Please enter a valid email address.');
      return;
    }
    if (cleaned === user?.email?.toLowerCase()) {
      showToast('You already own this gallery.');
      return;
    }
    setInviting(true);
    try {
      await inviteUserToAlbum({
        album: existingAlbum,
        email: cleaned,
        role: inviteRole,
      });
      setInviteEmail('');
      const roleText = inviteRole === 'editor' ? 'Manage Album' : 'View Only';
      showToast(`Invited ${cleaned} (${roleText}).`);
    } catch (err) {
      console.error(err);
      showToast('Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleChangeInviteRole = async (email: string, nextRole: InviteRole) => {
    if (!existingAlbum || !isOwner) return;
    try {
      await inviteUserToAlbum({
        album: existingAlbum,
        email,
        role: nextRole,
      });
      showToast(
        `Updated ${email} to ${nextRole === 'editor' ? 'Manage Album' : 'View Only'}.`,
      );
    } catch (err) {
      console.error(err);
      showToast('Could not update permission level.');
    }
  };

  const handleRevoke = async (inviteKey: string, email: string) => {
    try {
      await revokeAlbumInvite(inviteKey);
      showToast(`Removed access for ${email}.`);
    } catch (err) {
      console.error(err);
      showToast('Could not revoke access.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={existingAlbum ? 'Manage Album' : 'Create Custom Album'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0B0B0D] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <h2 className="font-display text-2xl font-medium text-zinc-100">
            {existingAlbum ? 'Curate & Share Album' : 'New Custom Album'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Album Title
            </label>
            <input
              type="text"
              required
              maxLength={FIELD_LIMITS.ALBUM_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Nocturnal Charcoal Studies"
              className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#E5B84B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Curatorial Statement
            </label>
            <textarea
              rows={3}
              maxLength={FIELD_LIMITS.ALBUM_DESC_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the theme, series, or medium of this collection..."
              className="w-full rounded-lg border border-zinc-800 bg-[#050505] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#E5B84B] focus:outline-none"
            />
          </div>

          {isOwner && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-2">
                Visibility & Access
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {VISIBILITY_OPTIONS.map((opt) => {
                  const selected = visibility === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setVisibility(opt.value)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-[#E5B84B] bg-[#E5B84B]/10'
                          : 'border-zinc-800 bg-[#050505] hover:border-zinc-700'
                      }`}
                    >
                      <div className="text-xs font-medium text-zinc-100">{opt.label}</div>
                      <div className="mt-1 text-[11px] leading-snug text-zinc-400">
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-800 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="rounded-lg bg-[#E5B84B] px-5 py-2 text-xs font-semibold text-[#050505] hover:bg-[#f0c761] disabled:opacity-50"
            >
              {saving ? 'Saving...' : existingAlbum ? 'Save Changes' : 'Create Album'}
            </button>
          </div>
        </form>

        {/* Direct Link & Email Invitations (for existing albums owned by user) */}
        {existingAlbum && isOwner && (
          <div className="mt-6 space-y-5 border-t border-zinc-800/80 pt-6">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
                Direct Gallery Link
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={directShareUrl}
                  className="flex-1 rounded-lg border border-zinc-800 bg-[#050505] px-3 py-2 text-xs text-zinc-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3.5 py-2 text-xs text-zinc-200 hover:border-[#E5B84B]/60 hover:text-[#E5B84B]"
                >
                  {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
                Invite-Only Email Permissions
              </h3>
              <form onSubmit={handleAddInvite} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                    <input
                      type="email"
                      required
                      maxLength={FIELD_LIMITS.EMAIL_MAX}
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="collaborator@gmail.com"
                      className="w-full rounded-lg border border-zinc-800 bg-[#050505] pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#E5B84B] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={inviting || !inviteEmail.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 px-4 py-2 text-xs font-medium text-[#050505] hover:bg-white disabled:opacity-50 whitespace-nowrap"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>{inviting ? 'Inviting...' : 'Send Invite'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setInviteRole('viewer')}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      inviteRole === 'viewer'
                        ? 'border-[#E5B84B] bg-[#E5B84B]/10'
                        : 'border-zinc-800 bg-[#050505] hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-medium text-zinc-100">View Only</div>
                    <div className="mt-1 text-[11px] leading-snug text-zinc-400">
                      Can view high-res photos, appreciate, and comment. Cannot upload, rotate, edit, or delete.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteRole('editor')}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      inviteRole === 'editor'
                        ? 'border-[#E5B84B] bg-[#E5B84B]/10'
                        : 'border-zinc-800 bg-[#050505] hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-medium text-zinc-100">Manage Album</div>
                    <div className="mt-1 text-[11px] leading-snug text-zinc-400">
                      Can upload photos, rotate, and edit details. Cannot delete photos or delete the album.
                    </div>
                  </button>
                </div>
              </form>

              {albumInvites.length > 0 && (
                <ul className="mt-3 divide-y divide-zinc-800/70 rounded-xl border border-zinc-800/80 bg-[#050505]">
                  {albumInvites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-zinc-200 truncate block">{inv.email}</span>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <select
                          aria-label={`Permission for ${inv.email}`}
                          value={inv.role}
                          onChange={(e) =>
                            handleChangeInviteRole(inv.email, e.target.value as InviteRole)
                          }
                          className="rounded-lg border border-zinc-800 bg-[#0B0B0D] px-2.5 py-1 text-[11px] text-zinc-200 focus:border-[#E5B84B] focus:outline-none"
                        >
                          <option value="viewer">View Only</option>
                          <option value="editor">Manage Album</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRevoke(inv.id, inv.email)}
                          className="inline-flex items-center gap-1 text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Revoke</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
