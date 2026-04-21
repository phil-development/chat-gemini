# Chat Modal com Gemini — Briefing Técnico

Projeto de teste técnico: modal de chat interativo com IA, usando Gemini, com persistência de contexto de conversa.

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend:** Fastify + TypeScript + driver `pg` (sem ORM)
- **Banco:** PostgreSQL 16 (em container)
- **Migrations:** `node-pg-migrate` (SQL puro versionado)
- **IA:** Gemini via Vercel AI SDK (`ai` + `@ai-sdk/google`)
- **Orquestração:** Docker Compose (3 serviços: db, backend, frontend)

## Requisitos funcionais

1. Botão na página que abre um modal de chat
2. Modal exibe histórico de mensagens da conversa atual
3. Input para o usuário enviar mensagem
4. Resposta da IA via streaming (token a token)
5. Todas as mensagens (user + assistant) persistidas no Postgres
6. Ao reabrir o modal, histórico carrega automaticamente
7. Contexto da conversa mantido: últimas 50 mensagens enviadas ao Gemini

## Requisitos não-funcionais

- **Commits estruturados:** um commit por feature/fix, com escopo (`feat(backend):`, `chore(frontend):`, etc). NUNCA commit único no final.
- **Sem ORM:** uso direto do driver `pg` com queries SQL parametrizadas.
- **Migrations versionadas:** cada mudança de schema é um arquivo novo, nunca editar migration antiga.
- **API key server-side:** `GOOGLE_GENERATIVE_AI_API_KEY` só existe no backend, nunca exposta ao cliente.
- **Variáveis de ambiente:** `.env` real NÃO commitado, `.env.example` commitado.
- **TypeScript estrito:** `strict: true` em todos os `tsconfig.json`.

---

## Arquitetura

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│    Frontend      │─────▶│     Backend      │─────▶│    Postgres      │
│  Vite + React    │ HTTP │    Fastify       │  SQL │   16-alpine      │
│   :5173          │      │    :3001         │      │   :5432          │
└──────────────────┘      └──────────────────┘      └──────────────────┘
                                   │
                                   │ Vercel AI SDK
                                   ▼
                          ┌──────────────────┐
                          │  Gemini API      │
                          │  (Google)        │
                          └──────────────────┘
```

## Estrutura de pastas

```
chat-gemini/
├── docker-compose.yml
├── .env.example
├── .env                      # não commitar
├── .gitignore
├── README.md
├── frontend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── components.json       # shadcn
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── components/
│       │   ├── chat-modal.tsx
│       │   └── ui/           # shadcn components
│       └── lib/
│           ├── api.ts
│           └── utils.ts      # shadcn
└── backend/
    ├── Dockerfile
    ├── .dockerignore
    ├── package.json
    ├── tsconfig.json
    ├── .pg-migraterc
    ├── migrations/
    │   └── <timestamp>_create_conversations_and_messages.sql
    └── src/
        ├── index.ts
        ├── env.ts
        ├── db.ts
        └── routes/
            └── chat.ts
```

---

## Schema do banco

Duas tabelas:

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text check (role in ('user','assistant')) not null,
  content text not null,
  created_at timestamptz default now()
);

create index messages_conversation_created_idx
  on messages(conversation_id, created_at);
```

Notas:
- `gen_random_uuid()` é nativo no Postgres 13+, dispensa `create extension`.
- Índice composto acelera a query de histórico (filtro + ordenação em uma varredura).
- `on delete cascade` garante integridade: apagar conversa apaga mensagens.

---

## API do backend

| Método | Rota                                | Descrição                              |
|--------|-------------------------------------|----------------------------------------|
| GET    | `/health`                           | Healthcheck (retorna `{ ok: true }`)   |
| POST   | `/conversations`                    | Cria conversa nova, retorna `{ id }`   |
| GET    | `/conversations/:id/messages`       | Lista últimas 50 mensagens da conversa |
| POST   | `/chat`                             | Envia mensagem, retorna stream         |

### Contrato do `POST /chat`

**Request:**
```json
{
  "conversationId": "uuid",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." },
    { "role": "user", "content": "última mensagem" }
  ]
}
```

**Response:** stream de texto no formato esperado pelo hook `useChat` do AI SDK.

**Comportamento:**
1. Salva a última mensagem (a do usuário) no banco ANTES de chamar Gemini.
2. Chama Gemini com streaming.
3. No callback `onFinish`, salva a resposta completa do assistant.

---

## Variáveis de ambiente

`.env` (raiz, não commitar):

```
GOOGLE_GENERATIVE_AI_API_KEY=<pegar em https://aistudio.google.com/apikey>
POSTGRES_USER=app
POSTGRES_PASSWORD=app
POSTGRES_DB=chat
```

`.env.example` (commitar, valores vazios):

```
GOOGLE_GENERATIVE_AI_API_KEY=
POSTGRES_USER=app
POSTGRES_PASSWORD=app
POSTGRES_DB=chat
```

---

## Plano de commits (ordem obrigatória)

Usar Conventional Commits com escopo. Um commit por etapa, na ordem:

1. `chore: init monorepo structure`
   - Cria pastas `frontend/` e `backend/`, `.gitignore`, `.env.example`, README inicial.

2. `chore(backend): setup fastify + typescript`
   - `npm init`, instala deps, configura `tsconfig.json`, scripts em `package.json`, cria `.pg-migraterc`.

3. `feat(db): add conversations and messages migration`
   - Cria primeira migration SQL com as duas tabelas e o índice.

4. `feat(backend): database connection and query helpers`
   - `src/env.ts`, `src/db.ts` com pool `pg` e funções `createConversation`, `getMessages`, `saveMessage`.

5. `feat(backend): chat routes with gemini streaming`
   - `src/routes/chat.ts` com as 3 rotas, `src/index.ts` com Fastify + CORS.

6. `chore(backend): add dockerfile`
   - `Dockerfile` multi-stage com target `dev`, `.dockerignore`.

7. `chore(frontend): setup vite + react + tailwind + shadcn`
   - `npm create vite`, instala Tailwind v4, roda `shadcn init`, adiciona componentes `dialog button input scroll-area`.

8. `feat(frontend): api client for backend communication`
   - `src/lib/api.ts` com `createConversation`, `fetchMessages`, `CHAT_ENDPOINT`.

9. `feat(frontend): chat modal ui with shadcn dialog`
   - `src/components/chat-modal.tsx` com estrutura do modal (sem integração ainda).

10. `feat(frontend): load conversation history on open`
    - Lógica de `useEffect` que busca/cria conversa e carrega histórico.

11. `fix(frontend): auto-scroll on new message`
    - `useEffect` que scrolla pro fim quando `messages` muda.

12. `chore(frontend): add dockerfile`
    - `Dockerfile` multi-stage, `.dockerignore`.

13. `chore: docker-compose orchestration`
    - `docker-compose.yml` com 3 serviços (db com healthcheck, backend depends_on db healthy, frontend).

14. `docs: readme with architecture and setup`
    - README final com stack, arquitetura, decisões, como rodar, próximos passos.

---

## Código de referência

### `backend/package.json` (scripts)

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "node-pg-migrate",
    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down"
  }
}
```

Dependências:
- runtime: `fastify`, `@fastify/cors`, `pg`, `ai`, `@ai-sdk/google`, `dotenv`
- dev: `typescript`, `@types/node`, `@types/pg`, `tsx`, `node-pg-migrate`

### `backend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

### `backend/.pg-migraterc`

```json
{
  "migrations-dir": "migrations",
  "database-url-var": "DATABASE_URL"
}
```

### `backend/migrations/<timestamp>_create_conversations_and_messages.sql`

Gerar com:
```bash
npm run migrate -- create create_conversations_and_messages --migration-file-language sql
```

Conteúdo:

```sql
-- Up Migration
create table conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text check (role in ('user','assistant')) not null,
  content text not null,
  created_at timestamptz default now()
);

create index messages_conversation_created_idx
  on messages(conversation_id, created_at);

-- Down Migration
drop index if exists messages_conversation_created_idx;
drop table if exists messages;
drop table if exists conversations;
```

### `backend/src/env.ts`

```ts
import 'dotenv/config'

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
  PORT: Number(process.env.PORT ?? 3001),
}

for (const [k, v] of Object.entries(env)) {
  if (v === undefined || v === '') {
    throw new Error(`Missing env: ${k}`)
  }
}
```

### `backend/src/db.ts`

```ts
import { Pool } from 'pg'
import { env } from './env.js'

export const pool = new Pool({ connectionString: env.DATABASE_URL })

export type Role = 'user' | 'assistant'

export async function createConversation() {
  const { rows } = await pool.query<{ id: string }>(
    'insert into conversations default values returning id'
  )
  return rows[0]
}

export async function getMessages(conversationId: string) {
  const { rows } = await pool.query<{ role: Role; content: string }>(
    `select role, content from messages
     where conversation_id = $1
     order by created_at asc
     limit 50`,
    [conversationId]
  )
  return rows
}

export async function saveMessage(
  conversationId: string,
  role: Role,
  content: string
) {
  await pool.query(
    'insert into messages (conversation_id, role, content) values ($1, $2, $3)',
    [conversationId, role, content]
  )
}
```

### `backend/src/routes/chat.ts`

```ts
import type { FastifyInstance } from 'fastify'
import { google } from '@ai-sdk/google'
import { streamText } from 'ai'
import { createConversation, getMessages, saveMessage } from '../db.js'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function chatRoutes(app: FastifyInstance) {
  app.post('/conversations', async () => {
    return await createConversation()
  })

  app.get<{ Params: { id: string } }>(
    '/conversations/:id/messages',
    async (req) => {
      return await getMessages(req.params.id)
    }
  )

  app.post<{
    Body: { conversationId: string; messages: ChatMessage[] }
  }>('/chat', async (req, reply) => {
    const { conversationId, messages } = req.body

    const last = messages[messages.length - 1]
    if (last?.role !== 'user') {
      return reply.status(400).send({ error: 'Last message must be from user' })
    }
    await saveMessage(conversationId, 'user', last.content)

    const result = streamText({
      model: google('gemini-2.0-flash'),
      messages,
      onFinish: async ({ text }) => {
        await saveMessage(conversationId, 'assistant', text)
      },
    })

    reply.header('Content-Type', 'text/plain; charset=utf-8')
    return reply.send(result.toDataStream())
  })
}
```

### `backend/src/index.ts`

```ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { chatRoutes } from './routes/chat.js'
import { env } from './env.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })
await app.register(chatRoutes)

app.get('/health', async () => ({ ok: true }))

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
```

### `backend/Dockerfile`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]
```

### `backend/.dockerignore`

```
node_modules
dist
.env
```

### `frontend/vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { host: true, port: 5173 },
})
```

### `frontend/src/index.css`

```css
@import "tailwindcss";
```

(O shadcn `init` pode adicionar tokens de tema aqui — manter o que ele gerar.)

### `frontend/src/lib/api.ts`

```ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export async function createConversation(): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/conversations`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create conversation')
  return res.json()
}

export async function fetchMessages(id: string) {
  const res = await fetch(`${API_URL}/conversations/${id}/messages`)
  if (!res.ok) throw new Error('Failed to fetch messages')
  return res.json() as Promise<{ role: 'user' | 'assistant'; content: string }[]>
}

export const CHAT_ENDPOINT = `${API_URL}/chat`
```

### `frontend/src/components/chat-modal.tsx`

```tsx
import { useChat } from '@ai-sdk/react'
import { useEffect, useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createConversation, fetchMessages, CHAT_ENDPOINT } from '@/lib/api'

export function ChatModal() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, input, handleInputChange, handleSubmit, setMessages } =
    useChat({
      api: CHAT_ENDPOINT,
      body: { conversationId },
    })

  useEffect(() => {
    async function init() {
      let id = localStorage.getItem('conversationId')
      if (!id) {
        const conv = await createConversation()
        id = conv.id
        localStorage.setItem('conversationId', id)
      }
      setConversationId(id)
      const history = await fetchMessages(id)
      setMessages(
        history.map((m, i) => ({
          id: String(i),
          role: m.role,
          content: m.content,
        }))
      )
      setLoading(false)
    }
    init()
  }, [setMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Abrir chat</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Chat com Gemini</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={m.role === 'user' ? 'text-right' : 'text-left'}
                >
                  <span
                    className={`inline-block px-3 py-2 rounded-lg ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {m.content}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Digite sua mensagem..."
          />
          <Button type="submit" disabled={!conversationId}>
            Enviar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### `frontend/src/App.tsx`

```tsx
import { ChatModal } from './components/chat-modal'

export default function App() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <ChatModal />
    </main>
  )
}
```

### `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

### `frontend/.dockerignore`

```
node_modules
dist
```

### `docker-compose.yml` (raiz)

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 3s
      retries: 10

  backend:
    build:
      context: ./backend
      target: dev
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      GOOGLE_GENERATIVE_AI_API_KEY: ${GOOGLE_GENERATIVE_AI_API_KEY}
      PORT: 3001
    ports:
      - "3001:3001"
    volumes:
      - ./backend/src:/app/src
      - ./backend/migrations:/app/migrations
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      target: dev
    environment:
      VITE_API_URL: http://localhost:3001
    ports:
      - "5173:5173"
    volumes:
      - ./frontend/src:/app/src
    depends_on:
      - backend

volumes:
  db_data:
```

### `.gitignore` (raiz)

```
node_modules
dist
.env
.DS_Store
*.log
```

---

## Fluxo de execução (primeira vez)

```bash
# 1. Preencher .env com a GOOGLE_GENERATIVE_AI_API_KEY

# 2. Subir containers
docker compose up -d --build

# 3. Aplicar migrations
docker compose exec backend npm run migrate:up

# 4. Verificar
curl http://localhost:3001/health
# Acessar http://localhost:5173 no navegador

# 5. Inspecionar banco (opcional)
docker compose exec db psql -U app -d chat -c "select * from messages;"
```

---

## README final (para o `docs:` commit)

Deve conter:

1. **Título + descrição curta** do projeto.
2. **Stack** (lista).
3. **Arquitetura** (o diagrama ASCII acima).
4. **Decisões técnicas** — um parágrafo para cada:
   - **Monorepo com front/back separados:** separação clara de responsabilidades, cada serviço com Dockerfile próprio, facilita raciocinar sobre deploy independente no futuro.
   - **Fastify em vez de Express:** mais performático, TypeScript-first, schema validation nativa, API mais moderna.
   - **Sem ORM:** escopo pequeno (duas tabelas), queries simples, driver `pg` parametrizado já é seguro e legível. ORM seria overhead sem ganho real aqui. Se o projeto crescesse, Drizzle seria o próximo passo natural.
   - **Migrations em SQL puro com `node-pg-migrate`:** versionar schema junto ao código é essencial. SQL puro mantém o controle no desenvolvedor, sem camadas mágicas.
   - **Docker Compose:** reprodutibilidade total. Qualquer pessoa clona e roda com um comando. Paridade dev/prod.
   - **Streaming de respostas:** UX melhor, percepção de resposta imediata. Vercel AI SDK abstrai a complexidade tanto do lado servidor (`streamText` + `toDataStream`) quanto do cliente (`useChat`).
   - **API key server-side:** chave do Gemini nunca toca o browser. Cliente só fala com o próprio backend.
5. **Como rodar** (os 4 passos do fluxo acima).
6. **Próximos passos** (mostra que você sabe o que falta):
   - Autenticação (hoje a conversa é identificada por `localStorage`, multi-usuário exigiria auth).
   - Rate limiting nas rotas (prevenir abuso da API key).
   - Testes (unit nos helpers de DB, integração na rota de chat).
   - Retry e tratamento de erro da Gemini com feedback visual no frontend.
   - Paginação no histórico (hoje carrega últimas 50, cresceria).

---

## Instruções específicas para o Claude Code

Ao executar este briefing:

1. **Siga a ordem dos commits exatamente.** Não adiante etapas. Cada commit na lista é uma unidade atômica de trabalho — um commit por vez, com teste mental do que foi feito antes de avançar.

2. **Faça `git init` logo no primeiro passo** e configure `.gitignore` antes de qualquer `npm install`, pra não commitar `node_modules` por acidente.

3. **Ao rodar `shadcn init`**, use os defaults (style: New York, color: Neutral, CSS variables: yes). Se perguntar sobre `src/` alias, confirme `@/*`.

4. **Nunca commite o `.env` real.** Só `.env.example`.

5. **Para a migration,** use o comando `npm run migrate -- create create_conversations_and_messages --migration-file-language sql` dentro da pasta `backend/`. O nome do arquivo terá timestamp automático — não edite o timestamp.

6. **Ao testar localmente,** depois do docker compose up, rode a migration ANTES de tentar usar o chat. A primeira mensagem vai falhar se as tabelas não existirem.

7. **Se algum passo falhar**, pare, reporte o erro, e pergunte antes de inventar solução. Não pule etapas para "fazer funcionar".

8. **Verifique as versões** das libs na hora da instalação: Tailwind v4 (não v3), shadcn mais recente, AI SDK mais recente. APIs podem ter mudado — se algo parecer diferente do código de referência, consulte a documentação oficial antes de improvisar.

9. **No final, teste o fluxo completo** antes do commit de docs: abrir modal, mandar mensagem, verificar resposta em streaming, fechar e reabrir modal, confirmar que histórico persistiu.

10. **O README é o último commit.** Escreva depois de tudo funcionar, refletindo o que foi realmente construído.
