# chat-gemini

Modal de chat interativo com Gemini via streaming, com persistência de conversas e mensagens em Postgres. Monorepo com frontend e backend separados, orquestrado por Docker Compose.

## Stack

- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix)
- **Backend:** Fastify 5 + TypeScript + driver `pg` (sem ORM)
- **Banco:** PostgreSQL 16 (em container)
- **Migrations:** `node-pg-migrate` (SQL puro versionado)
- **IA:** Gemini (`gemini-2.5-flash`) via Vercel AI SDK v6 (`ai` + `@ai-sdk/google` + `@ai-sdk/react`)
- **Orquestração:** Docker Compose (3 serviços: `db`, `backend`, `frontend`)

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

## Funcionalidades

- Modal com sidebar de conversas (lista, seleciona, apaga, cria nova, avalia 👍/👎)
- Histórico por conversa carregado automaticamente do banco
- Resposta do Gemini em streaming token-a-token
- Indicador visual de "pensando" + botão **Parar** para cancelar o stream
- Confirmação via `AlertDialog` antes de apagar conversa
- Modal não fecha por clique fora ou Esc (evita perder o stream por acidente)
- Auto-scroll pro fim a cada nova mensagem

## API do backend

| Método | Rota                                | Descrição                              |
|--------|-------------------------------------|----------------------------------------|
| GET    | `/health`                           | Healthcheck (`{ ok: true }`)           |
| GET    | `/conversations`                    | Lista conversas (mais recente primeiro)|
| POST   | `/conversations`                    | Cria conversa, retorna `{ id }`        |
| DELETE | `/conversations/:id`                | Apaga conversa (cascade nas mensagens) |
| PATCH  | `/conversations/:id/rating`         | Avalia conversa (`-1`, `1` ou `null`)  |
| GET    | `/conversations/:id/messages`       | Últimas 50 mensagens da conversa       |
| POST   | `/chat`                             | Envia mensagem, retorna stream         |

### Contrato do `POST /chat`

Request:
```json
{
  "conversationId": "uuid",
  "messages": [
    { "id": "...", "role": "user", "parts": [{ "type": "text", "text": "..." }] }
  ]
}
```

Response: `UIMessageStream` do AI SDK (eventos SSE tipo `data: {"type":"text-delta","delta":"..."}`).

Comportamento:
1. Salva a mensagem do usuário antes de chamar o Gemini.
2. Chama `streamText` do AI SDK com `gemini-2.5-flash`.
3. No `onFinish`, persiste a resposta completa do assistant.

## Schema do banco

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

## Decisões técnicas

**Monorepo com front/back separados.** Responsabilidades claras, cada serviço com `Dockerfile` próprio. Facilita raciocinar sobre deploy independente se crescer.

**Fastify em vez de Express.** Mais performático, TypeScript-first, schema validation nativa. API moderna (async/await + hooks).

**Sem ORM.** Escopo pequeno (duas tabelas), queries simples. Driver `pg` parametrizado já é seguro e legível — ORM seria overhead sem ganho real. Se o projeto crescesse, Drizzle seria o próximo passo natural.

**Migrations em SQL puro com `node-pg-migrate`.** Versionar schema junto ao código é essencial. SQL puro mantém o controle no desenvolvedor, sem camadas mágicas.

**Docker Compose.** Reprodutibilidade total — clone e sobe com um comando. Paridade dev/prod.

**Streaming.** UX melhor, percepção de resposta imediata. Vercel AI SDK abstrai a complexidade dos dois lados: servidor (`streamText` + `pipeUIMessageStreamToResponse`) e cliente (`useChat` + `DefaultChatTransport`).

**API key server-side.** `GOOGLE_GENERATIVE_AI_API_KEY` só existe no backend. O cliente só fala com o próprio backend.

**`reply.hijack()` + CORS manual no `/chat`.** Quando o handler usa `pipeUIMessageStreamToResponse(reply.raw)`, o Fastify pula o ciclo normal de resposta (incluindo o hook `onSend` do `@fastify/cors`). Como consequência, os headers CORS precisam ser injetados explicitamente via o parâmetro `headers` do pipe — senão o browser bloqueia a resposta.

## Como rodar

**Pré-requisito:** Docker Desktop instalado e rodando.

```bash
# 1. Clonar e preencher .env
cp .env.example .env
# edite .env e coloque sua GOOGLE_GENERATIVE_AI_API_KEY
# (pegar em https://aistudio.google.com/apikey)

# 2. Subir containers
docker compose up -d --build

# 3. Aplicar migrations
docker compose exec backend npm run migrate:up

# 4. Verificar
curl http://localhost:3001/health
# Abrir http://localhost:5173 no navegador
```

Inspecionar o banco manualmente:
```bash
docker compose exec db psql -U app -d chat -c "select * from messages;"
```

## Próximos passos

- **Autenticação.** Hoje todas as conversas ficam visíveis pra todos — é single-tenant. Com auth, basta adicionar `user_id` em `conversations` e filtrar por sessão.
- **Rate limiting** nas rotas do chat pra proteger a API key e o orçamento do Gemini.
- **Testes** — unit nos helpers de DB, integração na rota `/chat` (com o modelo mockado).
- **Retry e tratamento de erro do Gemini** com feedback visual no frontend (hoje só mostra a mensagem crua do erro).
- **Paginação no histórico.** Atualmente carrega últimas 50; conversas longas exigiriam lazy-load/infinite scroll.
- **Title autogerado** das conversas — hoje é sempre `null`. Dá pra resumir a primeira mensagem do usuário via Gemini, ou só usar a primeira linha truncada.
- **Produção.** Trocar o target `dev` dos Dockerfiles por um target `runtime` com build otimizado, Nginx servindo o bundle estático do frontend, e variáveis de ambiente via secret manager em vez de `.env` no host.
