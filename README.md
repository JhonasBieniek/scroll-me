# Scroll Me

Portfolio-grade short-video social network (reels-style) with **HLS adaptive streaming**, a full social graph, and security-first API design — built to demonstrate production-minded full-stack engineering.

## Architecture overview

```
┌─────────────┐     JWT (memory)      ┌──────────────────────────────────────┐
│   Angular   │◄────────────────────►│  NestJS 11 API                        │
│  NgModules  │     refresh cookie    │  Prisma 6 · PostgreSQL 16            │
│  hls.js     │     (HttpOnly)        │  ffmpeg (ephemeral /tmp) · R2 upload │
└──────┬──────┘                       └──────────────┬───────────────────────┘
       │ presigned manifest + segments               │ metadata only
       └────────────────────────────────────────────►│ Cloudflare R2 (S3 API)
                                                     └───────────────────────┘
```

**Design principle:** the API never proxies video bytes. Upload processing is ephemeral on disk; durable media lives in object storage. The server rewrites HLS playlist text with time-limited presigned segment URLs — the browser streams directly from R2.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Angular 19 (NgModules, `ChangeDetectionStrategy.OnPush`), `hls.js` |
| Backend | NestJS 11 |
| Database | PostgreSQL 16 + Prisma 6 — users, posts, likes, follows, comments (relational / social graph) |
| Object storage | Cloudflare R2 (S3-compatible) — HLS segments, thumbnails, avatars; presigned URLs for playback |
| Media | `fluent-ffmpeg` → HLS (`.m3u8` + `.ts` segments), JPEG thumbnail |
| Testing | Jest + ts-jest (`*.spec.ts`); backend unit tests in CI |
| CI / security | GitHub Actions (lint, test, build), CodeQL |

## Technical highlights

### Media pipeline

1. **Ingest** — authenticated `multipart/form-data` upload; Multer writes to a configured temp root (`UPLOAD_TMP_DIR`).
2. **Transcode** — `fluent-ffmpeg` produces an HLS bundle and thumbnail under a per-job directory in `/tmp` only.
3. **Persist** — manifest + segments + thumbnail uploaded to R2 under `posts/{uuid}/`; DB stores manifest key and metadata.
4. **Cleanup** — `finally` blocks remove temp files; `safe-path` confines deletion to the upload root (path traversal protection).
5. **Playback** — `GET /posts/:id/manifest` fetches the stored playlist, rewrites segment URIs to presigned URLs, returns JSON `{ playlist, expiresIn }`. No video proxy on the API.

### Auth & security

- **Sessions** — short-lived JWT access token held in memory on the client; refresh token in `HttpOnly`, `SameSite=Strict` cookie (rotated on refresh).
- **Passwords** — bcrypt hashing; generic error messages on login/register to reduce user enumeration.
- **HTTP hardening** — `helmet` with CSP, global `@nestjs/throttler` on sensitive routes, CORS locked to `FRONTEND_ORIGIN`.
- **Input validation** — `class-validator` DTOs with whitelist + `forbidNonWhitelisted`; uniform JSON errors via `AllExceptionsFilter`.
- **Upload safety** — size/MIME constraints, Multer exception filter, basename-only temp cleanup via `safe-path`.

### Social graph & data model

PostgreSQL schema (Prisma):

| Model | Purpose |
|-------|---------|
| `User` | `username`, `displayName`, `email`, `bio`, `avatarKey`, `Role` |
| `Post` | caption, `videoManifestUrl`, `thumbnailKey`, author relation |
| `Follow` | composite PK `(followerId, followingId)` |
| `Like` | composite PK `(userId, postId)` — idempotent `upsert` |
| `Comment` | `body` (max 500 chars), cursor-paginated per post |

**Feeds** — cursor-based keyset pagination (`createdAt` + id):

- `GET /feed/following` — posts from followed users.
- `GET /feed/discover` — global discovery feed (can exclude IDs already shown in following).

Likes, follows, and comments use upserts or ownership checks; delete endpoints enforce author/owner scope.

### Frontend UX

- **Vertical snap feed** — CSS scroll-snap; `IntersectionObserver` activates exactly one card (autoplay + HLS attach).
- **Player lifecycle** — inactive cards call `hls.destroy()` to release MediaSource buffers and network requests.
- **Profile** — grid of thumbnails, full-screen reel viewer with the same active-card pattern.
- **Edit profile** — display name, username, bio, avatar upload with presigned preview URLs.
- **Preferences** — mute state persisted in `sessionStorage` for the browser tab session.

## Project layout

```
scroll-me/
├── backend/                 # NestJS API
│   ├── prisma/              # schema + migrations
│   └── src/
│       ├── auth/            # JWT + refresh cookie flow
│       ├── feed/            # following + discover feeds
│       ├── posts/           # upload, likes, manifest, thumbnail
│       ├── users/           # profiles, follow, avatar
│       ├── comments/
│       ├── media/           # ffmpeg HLS transcode
│       ├── storage/         # R2 client, presign, manifest rewrite
│       └── common/          # safe-path, exception filter
├── frontend/                # Angular SPA
│   └── src/app/
│       ├── core/            # auth interceptor, users service, shell state
│       └── features/        # feed, profile, create, auth
├── docker-compose.yml       # db + api + frontend (dev)
├── .env.example
└── .github/workflows/       # CI + CodeQL
```

## Quick start

**Requirements:** Node.js 22+, Docker.

```bash
cp .env.example .env
# Set JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, and R2_* credentials for uploads/streaming
docker compose up --build
```

| Service | URL |
|---------|-----|
| API | http://localhost:3000 |
| App | http://localhost:4200 |

The frontend reads `API_BASE_URL` from the root `.env` (via `sync-env` before `start`/`build`). The browser runs on the host — use `http://localhost:3000`, not the Docker internal hostname `api`.

**Without Docker** (API + DB only):

```bash
# PostgreSQL running locally, DATABASE_URL set
cd backend && npm install && npx prisma migrate deploy && npm run start:dev
cd frontend && npm install && npm start
```

## API overview

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/register` · `/auth/login` | Register / login; sets refresh cookie |
| `POST` | `/auth/refresh` · `/auth/logout` | Rotate session / clear cookie |
| `GET` | `/auth/me` | Current authenticated user |
| `GET` | `/feed/following` · `/feed/discover` | Cursor-paginated feeds |
| `POST` | `/posts/upload` | Upload `.mp4` → HLS → R2 → create post |
| `GET` | `/posts/:id/manifest` | HLS playlist with presigned segments |
| `GET` | `/posts/:id/thumbnail` | Presigned thumbnail URL |
| `POST` · `DELETE` | `/posts/:id/like` | Idempotent like / unlike |
| `DELETE` | `/posts/:id` | Delete own post |
| `GET` · `PATCH` | `/users/me` | Profile read / update |
| `POST` | `/users/me/avatar` | Avatar image upload |
| `GET` | `/users/:username` | Public profile + counts + follow state |
| `GET` | `/users/:username/posts` | User posts (cursor pagination) |
| `POST` · `DELETE` | `/users/:username/follow` | Follow / unfollow |
| `GET` | `/posts/:postId/comments` | List comments (cursor pagination) |
| `POST` | `/posts/:postId/comments` | Create comment |
| `DELETE` | `/comments/:id` | Delete own comment |

All routes except auth entrypoints require a valid access token (`Authorization: Bearer`).

## Quality

```bash
cd backend && npm run lint && npm test && npm run build
cd frontend && npm run build
```

Backend unit tests run with **Jest** (`npm test`); CI runs lint, Jest, and build on push/PR. CodeQL scans JavaScript/TypeScript weekly and on every push.

## License

This project is licensed under the [MIT License](./LICENSE).

---

Read in Portuguese: [README.pt-BR.md](./README.pt-BR.md)
