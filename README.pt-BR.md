# Scroll Me

Rede social de vídeos curtos estilo reels, com **streaming HLS adaptativo**, grafo social completo e API pensada em segurança — construída como vitrine técnica de engenharia full stack em nível de produção.

## Visão da arquitetura

```
┌─────────────┐     JWT (memória)     ┌──────────────────────────────────────┐
│   Angular   │◄────────────────────►│  API NestJS 11                        │
│  NgModules  │     cookie refresh    │  Prisma 6 · PostgreSQL 16            │
│  hls.js     │     (HttpOnly)        │  ffmpeg (/tmp efêmero) · upload R2   │
└──────┬──────┘                       └──────────────┬───────────────────────┘
       │ manifesto + segmentos assinados              │ só metadados
       └────────────────────────────────────────────►│ Cloudflare R2 (API S3)
                                                     └───────────────────────┘
```

**Princípio de design:** a API nunca faz proxy de bytes de vídeo. O processamento de upload é efêmero em disco; a mídia durável fica no object storage. O servidor reescreve o texto da playlist HLS com URLs presignadas de segmentos — o navegador faz stream direto do R2.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Angular 19 (NgModules, `ChangeDetectionStrategy.OnPush`), `hls.js` |
| Backend | NestJS 11, Prisma 6, PostgreSQL 16 |
| Mídia | `fluent-ffmpeg` → HLS (`.m3u8` + segmentos `.ts`), thumbnail JPEG |
| Storage | Cloudflare R2 (compatível S3), URLs presignadas |
| CI / segurança | GitHub Actions (lint, test, build), CodeQL |
| Deploy alvo | Cloudflare Pages (frontend) · VPS + Coolify (API) |

## Destaques técnicos

### Pipeline de mídia

1. **Ingestão** — upload autenticado `multipart/form-data`; Multer grava em diretório temporário configurável (`UPLOAD_TMP_DIR`).
2. **Transcodificação** — `fluent-ffmpeg` gera bundle HLS e thumbnail em diretório por job, somente em `/tmp`.
3. **Persistência** — manifesto + segmentos + thumbnail enviados ao R2 em `posts/{uuid}/`; o banco guarda a chave do manifesto e metadados.
4. **Limpeza** — blocos `finally` removem arquivos temporários; `safe-path` confina a exclusão à raiz de upload (proteção contra path traversal).
5. **Reprodução** — `GET /posts/:id/manifest` busca a playlist armazenada, reescreve URIs dos segmentos com URLs presignadas, retorna JSON `{ playlist, expiresIn }`. Sem proxy de vídeo na API.

### Auth e segurança

- **Sessões** — JWT de acesso de curta duração em memória no cliente; refresh token em cookie `HttpOnly`, `SameSite=Strict` (rotacionado no refresh).
- **Senhas** — hash bcrypt; mensagens genéricas em login/registro para reduzir enumeração de usuários.
- **Endurecimento HTTP** — `helmet` com CSP, `@nestjs/throttler` global em rotas sensíveis, CORS restrito a `FRONTEND_ORIGIN`.
- **Validação de entrada** — DTOs com `class-validator`, whitelist + `forbidNonWhitelisted`; erros JSON uniformes via `AllExceptionsFilter`.
- **Segurança de upload** — limites de tamanho/MIME, filtro de exceção Multer, limpeza de temp só por basename via `safe-path`.

### Grafo social e modelo de dados

Schema PostgreSQL (Prisma):

| Modelo | Propósito |
|--------|-----------|
| `User` | `username`, `displayName`, `email`, `bio`, `avatarKey`, `Role` |
| `Post` | legenda, `videoManifestUrl`, `thumbnailKey`, relação com autor |
| `Follow` | PK composta `(followerId, followingId)` |
| `Like` | PK composta `(userId, postId)` — `upsert` idempotente |
| `Comment` | `body` (máx. 500 caracteres), paginação por cursor por post |

**Feeds** — paginação keyset por cursor (`createdAt` + id):

- `GET /feed/following` — posts de usuários seguidos.
- `GET /feed/discover` — feed global de descoberta (pode excluir IDs já exibidos no following).

Curtidas, follows e comentários usam upserts ou checagens de ownership; endpoints de delete exigem escopo de autor/dono.

### UX do frontend

- **Feed vertical com snap** — CSS scroll-snap; `IntersectionObserver` ativa exatamente um card (autoplay + attach HLS).
- **Ciclo de vida do player** — cards inativos chamam `hls.destroy()` para liberar buffers MediaSource e requisições de rede.
- **Perfil** — grid de thumbnails, visualizador reel em tela cheia com o mesmo padrão de card ativo.
- **Editar perfil** — nome de exibição, username, bio, upload de avatar com preview via URL presignada.
- **Preferências** — estado de mute persistido em `sessionStorage` na sessão da aba do navegador.

## Estrutura do projeto

```
scroll-me/
├── backend/                 # API NestJS
│   ├── prisma/              # schema + migrations
│   └── src/
│       ├── auth/            # fluxo JWT + cookie refresh
│       ├── feed/            # feeds following + discover
│       ├── posts/           # upload, likes, manifest, thumbnail
│       ├── users/           # perfis, follow, avatar
│       ├── comments/
│       ├── media/           # transcodificação HLS com ffmpeg
│       ├── storage/         # cliente R2, presign, rewrite de manifest
│       └── common/          # safe-path, exception filter
├── frontend/                # SPA Angular
│   └── src/app/
│       ├── core/            # auth interceptor, users service, shell state
│       └── features/        # feed, profile, create, auth
├── docker-compose.yml       # db + api + frontend (dev)
├── .env.example
└── .github/workflows/       # CI + CodeQL
```

## Rodar localmente

**Pré-requisitos:** Node.js 22+, Docker.

```bash
cp .env.example .env
# Defina JWT_ACCESS_SECRET, JWT_REFRESH_SECRET e credenciais R2_* para upload/streaming
docker compose up --build
```

| Serviço | URL |
|---------|-----|
| API | http://localhost:3000 |
| App | http://localhost:4200 |

O frontend lê `API_BASE_URL` do `.env` na raiz (via `sync-env` antes de `start`/`build`). O navegador roda no host — use `http://localhost:3000`, não o hostname interno Docker `api`.

**Sem Docker** (só API + banco):

```bash
# PostgreSQL local, DATABASE_URL configurada
cd backend && npm install && npx prisma migrate deploy && npm run start:dev
cd frontend && npm install && npm start
```

## Visão geral da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/register` · `/auth/login` | Registro / login; define cookie de refresh |
| `POST` | `/auth/refresh` · `/auth/logout` | Rotacionar sessão / limpar cookie |
| `GET` | `/auth/me` | Usuário autenticado atual |
| `GET` | `/feed/following` · `/feed/discover` | Feeds com paginação por cursor |
| `POST` | `/posts/upload` | Upload `.mp4` → HLS → R2 → criar post |
| `GET` | `/posts/:id/manifest` | Playlist HLS com segmentos presignados |
| `GET` | `/posts/:id/thumbnail` | URL presignada da thumbnail |
| `POST` · `DELETE` | `/posts/:id/like` | Curtir / descurtir (idempotente) |
| `DELETE` | `/posts/:id` | Excluir post próprio |
| `GET` · `PATCH` | `/users/me` | Ler / atualizar perfil |
| `POST` | `/users/me/avatar` | Upload de avatar |
| `GET` | `/users/:username` | Perfil público + contadores + estado de follow |
| `GET` | `/users/:username/posts` | Posts do usuário (paginação por cursor) |
| `POST` · `DELETE` | `/users/:username/follow` | Seguir / deixar de seguir |
| `GET` | `/posts/:postId/comments` | Listar comentários (paginação por cursor) |
| `POST` | `/posts/:postId/comments` | Criar comentário |
| `DELETE` | `/comments/:id` | Excluir comentário próprio |

Todas as rotas, exceto os endpoints de auth iniciais, exigem access token válido (`Authorization: Bearer`).

## Qualidade

```bash
cd backend && npm run lint && npm test && npm run build
cd frontend && npm run build
```

A CI executa as mesmas verificações em push/PR; o CodeQL analisa JavaScript/TypeScript semanalmente e a cada push.

## Licença

Este projeto está sob a licença [MIT](./LICENSE).

---

Read in English: [README.md](./README.md)
