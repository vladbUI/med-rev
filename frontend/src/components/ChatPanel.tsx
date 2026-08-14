import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatMessage, CitedChunk, createChatSession, sendMessage, getMessages } from '../lib/api'
import './chat-panel.css'

interface Props {
  notebookId: string | undefined
}

export default function ChatPanel({ notebookId }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeChunk, setActiveChunk] = useState<CitedChunk | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, loading])

  async function handleSend() {
    if (!input.trim() || loading) return
    if (!notebookId) {
      setError('Set VITE_DEMO_NOTEBOOK_ID to a notebook UUID in frontend/.env.')
      return
    }

    setError('')
    const question = input.trim()
    setInput('')

    // Add an optimistic user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId ?? '',
      role: 'user',
      content: question,
      cited_chunk_ids: [],
      cited_chunks: [],
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])
    setLoading(true)

    try {
      // Create session on first message
      let sid = sessionId
      if (!sid) {
        const session = await createChatSession(notebookId)
        sid = session.id
        setSessionId(sid)
      }

      const assistantMsg = await sendMessage(sid, question)
      // Replace temp user msg with real messages from server
      const allMessages = await getMessages(sid)
      setMessages(allMessages.map((m, i) => {
        // Merge cited_chunks from the send response into the last assistant message
        if (i === allMessages.length - 1 && m.role === 'assistant') {
          return { ...m, cited_chunks: assistantMsg.cited_chunks }
        }
        return m
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get a response')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCitationClick = useCallback((chunk: CitedChunk) => {
    setActiveChunk(prev => prev?.chunk_id === chunk.chunk_id ? null : chunk)
  }, [])

  // Close popover when clicking outside
  useEffect(() => {
    if (!activeChunk) return
    function onClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.citation-chip, .citation-popover')) setActiveChunk(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [activeChunk])

  function renderCitations(chunks: CitedChunk[]) {
    if (!chunks.length) return null
    return (
      <div className="chat-citations">
        {chunks.map(c => (
          <span key={c.chunk_id} className="citation-chip-wrapper">
            <button
              className={`citation-chip ${activeChunk?.chunk_id === c.chunk_id ? 'active' : ''}`}
              onClick={() => handleCitationClick(c)}
            >
              <span className="citation-icon">📄</span>
              {c.filename}{c.page_number ? ` · p.${c.page_number}` : ''}
            </button>
            {activeChunk?.chunk_id === c.chunk_id && (
              <div className="citation-popover">
                <div className="popover-row"><span className="popover-label">Source</span><span>{c.filename}</span></div>
                {c.page_number && <div className="popover-row"><span className="popover-label">Page</span><span>{c.page_number}</span></div>}
                {c.similarity != null && <div className="popover-row"><span className="popover-label">Relevance</span><span>{(c.similarity * 100).toFixed(0)}%</span></div>}
                <div className="popover-row"><span className="popover-label">Chunk ID</span><span className="popover-mono">{c.chunk_id.slice(0, 8)}…</span></div>
              </div>
            )}
          </span>
        ))}
      </div>
    )
  }

  function formatContent(content: string) {
    // Remove chunk citation markers from display text for cleaner reading
    return content.replace(/\[chunk_[a-f0-9-]+\]/g, '').trim()
  }

  if (!notebookId) {
    return (
      <section className="chat-panel">
        <div className="chat-empty">
          <div className="chat-empty-icon">💬</div>
          <h3>Configure your notebook</h3>
          <p>Set <code>VITE_DEMO_NOTEBOOK_ID</code> in your frontend <code>.env</code> file to start chatting.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="chat-panel">
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            <div className="chat-empty-icon">⌬</div>
            <h3>Ask about your sources</h3>
            <p>Your answers will be grounded in the study materials you've uploaded — with citations.</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble ${msg.role}`}>
            <div className="bubble-role">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="bubble-content">{formatContent(msg.content)}</div>
            {msg.role === 'assistant' && renderCitations(msg.cited_chunks || [])}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble assistant">
            <div className="bubble-role">Assistant</div>
            <div className="bubble-content typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
      </div>
      {error && <p className="chat-error">{error}</p>}
      <div className="chat-composer">
        <input
          aria-label="Ask a question"
          placeholder="Ask anything about your sources…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? '…' : 'Send ↑'}
        </button>
      </div>
    </section>
  )
}
