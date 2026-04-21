const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export type Rating = -1 | 1 | null

export type Conversation = {
  id: string
  title: string | null
  rating: Rating
  created_at: string
  last_message_at: string | null
  preview: string | null
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_URL}/conversations`)
  if (!res.ok) throw new Error('Failed to list conversations')
  return res.json()
}

export async function createConversation(): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/conversations`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create conversation')
  return res.json()
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/conversations/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete conversation')
}

export async function setConversationRating(
  id: string,
  rating: Rating
): Promise<{ id: string; rating: Rating }> {
  const res = await fetch(`${API_URL}/conversations/${id}/rating`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  })
  if (!res.ok) throw new Error('Failed to set rating')
  return res.json()
}

export async function fetchMessages(id: string) {
  const res = await fetch(`${API_URL}/conversations/${id}/messages`)
  if (!res.ok) throw new Error('Failed to fetch messages')
  return res.json() as Promise<{ role: 'user' | 'assistant'; content: string }[]>
}

export const CHAT_ENDPOINT = `${API_URL}/chat`
