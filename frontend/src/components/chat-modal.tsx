import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
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
import { CHAT_ENDPOINT } from '@/lib/api'

export function ChatModal() {
  const [conversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')

  const conversationIdRef = useRef<string | null>(null)
  conversationIdRef.current = conversationId

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_ENDPOINT,
        body: () => ({ conversationId: conversationIdRef.current }),
      }),
    []
  )

  const { messages, sendMessage, status } = useChat({ transport })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || !conversationId) return
    sendMessage({ text: input })
    setInput('')
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Abrir chat</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Chat com Gemini</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
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
                  {m.parts.map((p, i) =>
                    p.type === 'text' ? <span key={i}>{p.text}</span> : null
                  )}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua mensagem..."
          />
          <Button
            type="submit"
            disabled={!conversationId || status === 'streaming'}
          >
            Enviar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
