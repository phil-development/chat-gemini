import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CHAT_ENDPOINT,
  createConversation,
  deleteConversation,
  fetchMessages,
  listConversations,
  type Conversation,
} from '@/lib/api'

const STORAGE_KEY = 'conversationId'

export function ChatModal() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteCandidate, setDeleteCandidate] = useState<Conversation | null>(
    null
  )
  const endRef = useRef<HTMLDivElement>(null)

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

  const { messages, sendMessage, setMessages, status, stop, error } = useChat({
    transport,
  })

  const refreshConversations = useCallback(async () => {
    const list = await listConversations()
    setConversations(list)
    return list
  }, [])

  const loadConversation = useCallback(
    async (id: string) => {
      setLoading(true)
      setConversationId(id)
      localStorage.setItem(STORAGE_KEY, id)
      const history = await fetchMessages(id)
      setMessages(
        history.map((m, i) => ({
          id: String(i),
          role: m.role,
          parts: [{ type: 'text', text: m.content }],
        }))
      )
      setLoading(false)
    },
    [setMessages]
  )

  useEffect(() => {
    async function init() {
      const list = await refreshConversations()
      const stored = localStorage.getItem(STORAGE_KEY)
      const exists = stored && list.some((c) => c.id === stored)
      if (exists && stored) {
        await loadConversation(stored)
      } else if (list.length > 0) {
        await loadConversation(list[0].id)
      } else {
        const conv = await createConversation()
        await refreshConversations()
        await loadConversation(conv.id)
      }
    }
    init()
  }, [refreshConversations, loadConversation])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  const busy = status === 'submitted' || status === 'streaming'

  async function handleNew() {
    if (busy) stop()
    const conv = await createConversation()
    await refreshConversations()
    await loadConversation(conv.id)
  }

  async function handleSelect(id: string) {
    if (id === conversationId) return
    if (busy) stop()
    await loadConversation(id)
  }

  async function confirmDelete() {
    if (!deleteCandidate) return
    const id = deleteCandidate.id
    setDeleteCandidate(null)
    if (busy && id === conversationId) stop()
    await deleteConversation(id)
    const list = await refreshConversations()
    if (id === conversationId) {
      if (list.length > 0) {
        await loadConversation(list[0].id)
      } else {
        const conv = await createConversation()
        await refreshConversations()
        await loadConversation(conv.id)
      }
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || !conversationId || busy) return
    sendMessage({ text: input })
    setInput('')
    setTimeout(refreshConversations, 500)
  }

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Abrir chat</Button>
        </DialogTrigger>
        <DialogContent
          className="!max-w-3xl w-[900px] h-[640px] p-0 gap-0 overflow-hidden flex flex-col sm:!max-w-3xl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle>Chat com Gemini</DialogTitle>
            <DialogDescription className="sr-only">
              Converse com o Gemini; conversas e histórico persistidos no banco.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex">
            <aside className="w-56 shrink-0 border-r flex flex-col min-h-0">
              <div className="p-2 border-b">
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  onClick={handleNew}
                  disabled={loading}
                >
                  + Nova conversa
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 p-1">
                {conversations.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    Nenhuma conversa.
                  </p>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      className={`group relative w-full px-2 py-2 rounded-md text-sm flex items-start gap-2 cursor-pointer ${
                        c.id === conversationId
                          ? 'bg-muted'
                          : 'hover:bg-muted/60'
                      }`}
                      onClick={() => handleSelect(c.id)}
                    >
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="truncate">
                          {c.preview || 'Conversa vazia'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {new Date(
                            c.last_message_at || c.created_at
                          ).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteCandidate(c)
                        }}
                        className="absolute right-1 top-1 size-6 rounded hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-sm"
                        aria-label="Apagar conversa"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </aside>
            <section className="flex-1 min-w-0 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mensagem ainda. Diga oi pro Gemini.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={
                          m.role === 'user' ? 'text-right' : 'text-left'
                        }
                      >
                        <span
                          className={`inline-block max-w-[85%] px-3 py-2 rounded-lg whitespace-pre-wrap break-words text-left ${
                            m.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          {m.parts.map((p, i) =>
                            p.type === 'text' ? (
                              <span key={i}>{p.text}</span>
                            ) : null
                          )}
                        </span>
                      </div>
                    ))}
                    {status === 'submitted' && <TypingIndicator />}
                    <div ref={endRef} />
                  </div>
                )}
              </div>
              {error && (
                <p className="px-4 py-2 text-sm text-destructive border-t">
                  Erro: {error.message}
                </p>
              )}
              <form
                onSubmit={onSubmit}
                className="flex gap-2 px-4 py-3 border-t"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  disabled={busy || loading}
                />
                {busy ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => stop()}
                  >
                    Parar
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!conversationId || loading || !input.trim()}
                  >
                    Enviar
                  </Button>
                )}
              </form>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteCandidate !== null}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação remove todas as mensagens da conversa
              {deleteCandidate?.preview
                ? ` "${truncate(deleteCandidate.preview, 40)}"`
                : ''}
              . Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '...' : s
}

function TypingIndicator() {
  return (
    <div className="text-left">
      <span className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-muted">
        <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
        <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
        <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce" />
      </span>
    </div>
  )
}
