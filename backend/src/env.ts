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
