# Security Specification — myartpieces

## 1. Data Invariants
1. **PII Isolation**: User email addresses are stored exclusively in `/users/{userId}/private/account` (strictly owner-readable/writable) and `/albums/{albumId}/invites/{inviteEmail}` (readable only by the album owner or the verified invitee matching that exact email). Public user profiles (`/users/{userId}`), albums (`/albums/{albumId}`), artworks (`/artworks/{artworkId}`), comments, and likes never store email addresses.
2. **Ownership Immutability**: `ownerId`, `authorId`, `actorId`, `recipientId`, and `createdAt` are immutable after document creation.
3. **Server-Side Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must strictly equal `request.time`.
4. **Atomic Engagement Counters**: Creating or deleting a like (`likes/{userId}`) or comment (`comments/{commentId}`) must occur in an atomic batch alongside incrementing or decrementing `likesCount` / `commentsCount` on the parent `/artworks/{artworkId}` document, verified via `getAfter()` / `existsAfter()`.
5. **Verified Identity for Writes**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.
6. **Album-Artwork Relational Integrity**: Creating an artwork requires the parent `/albums/{albumId}` to exist and the actor to be either the album's `ownerId` or an invited `editor`. Deleting an artwork atomically updates the parent album's `artworkIds` and `artCount`.
7. **Zero Blanket List Access**: Top-level `list` rules on `/albums`, `/artworks`, and `collectionGroup('invites')` evaluate `resource.data` directly without database lookups, preventing unauthorized enumeration of private, unlisted, or invite-only resources.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing on Album Create**: Authenticated User B attempts to create an album with `ownerId: "userA"`. -> Expected: `PERMISSION_DENIED`.
2. **Ghost Field Injection (Shadow Update)**: Owner attempts to update an album with an extra unallowed field `isFeaturedVerified: true`. -> Expected: `PERMISSION_DENIED`.
3. **Client Timestamp Forgery**: Authenticated user attempts to create an artwork with `createdAt: "2020-01-01T00:00:00Z"` instead of server `request.time`. -> Expected: `PERMISSION_DENIED`.
4. **PII Leakage via Public Profile**: User attempts to write an `email` field into `/users/{userId}` public profile. -> Expected: `PERMISSION_DENIED`.
5. **Private Account Cross-Read**: User B attempts `get` on `/users/userA/private/account`. -> Expected: `PERMISSION_DENIED`.
6. **Unverified Email Bypass**: User with `email_verified: false` attempts to create a comment or invite. -> Expected: `PERMISSION_DENIED`.
7. **Like Counter Manipulation**: User attempts to update `artworks/{id}.likesCount` directly by `+500` without creating a matching `likes/{uid}` document in the batch. -> Expected: `PERMISSION_DENIED`.
8. **Orphaned Artwork Creation**: User attempts to create an artwork referencing a non-existent `albumId: "fake_album_999"`. -> Expected: `PERMISSION_DENIED`.
9. **Viewer Privilege Escalation**: An invited user with `role: "viewer"` attempts to update the shared album's `title` or `visibility`. -> Expected: `PERMISSION_DENIED`.
10. **Editor Visibility Hijack**: An invited user with `role: "editor"` attempts to change a shared private/invite album's `visibility` to `"public"`. -> Expected: `PERMISSION_DENIED`.
11. **Path ID Poisoning / Resource Exhaustion**: User attempts to create `/albums/<1500_char_string>` or inject a 10KB string into `title`. -> Expected: `PERMISSION_DENIED`.
12. **Blanket Scraping of Private/Unlisted Albums**: Unauthenticated user or non-owner runs `list` on `/albums` without restricting to `visibility == 'public'`. -> Expected: `PERMISSION_DENIED`.
