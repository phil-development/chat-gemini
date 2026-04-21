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
