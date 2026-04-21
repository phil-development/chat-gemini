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

export async function listConversations() {
  const { rows } = await pool.query<{
    id: string
    title: string | null
    rating: -1 | 1 | null
    created_at: string
    last_message_at: string | null
    preview: string | null
  }>(
    `select
       c.id,
       c.title,
       c.rating,
       c.created_at,
       max(m.created_at) as last_message_at,
       (select content from messages
         where conversation_id = c.id
         order by created_at asc limit 1) as preview
     from conversations c
     left join messages m on m.conversation_id = c.id
     group by c.id
     order by coalesce(max(m.created_at), c.created_at) desc`
  )
  return rows
}

export async function deleteConversation(id: string) {
  await pool.query('delete from conversations where id = $1', [id])
}

export async function setConversationRating(
  id: string,
  rating: -1 | 1 | null
) {
  const { rows } = await pool.query<{ id: string; rating: -1 | 1 | null }>(
    'update conversations set rating = $2 where id = $1 returning id, rating',
    [id, rating]
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
