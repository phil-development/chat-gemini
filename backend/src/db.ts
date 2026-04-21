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
