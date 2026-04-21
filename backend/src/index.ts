import Fastify from 'fastify'
import cors from '@fastify/cors'
import { chatRoutes } from './routes/chat.js'
import { env } from './env.js'

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
})
await app.register(chatRoutes)

app.get('/health', async () => ({ ok: true }))

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
