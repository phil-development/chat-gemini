import type { FastifyInstance } from 'fastify'
import { google } from '@ai-sdk/google'
import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { createConversation, getMessages, saveMessage } from '../db.js'

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
    Body: { conversationId: string; messages: UIMessage[] }
  }>('/chat', async (req, reply) => {
    const { conversationId, messages } = req.body

    const last = messages[messages.length - 1]
    if (!last || last.role !== 'user') {
      return reply.status(400).send({ error: 'Last message must be from user' })
    }

    const lastText = last.parts
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('')
    await saveMessage(conversationId, 'user', lastText)

    const result = streamText({
      model: google('gemini-2.0-flash'),
      messages: await convertToModelMessages(messages),
      onFinish: async ({ text }) => {
        await saveMessage(conversationId, 'assistant', text)
      },
    })

    reply.hijack()
    result.pipeUIMessageStreamToResponse(reply.raw)
  })
}
