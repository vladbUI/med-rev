import { useEffect, useState } from 'react'
import {
  createNotebook,
  getApiUrl,
  getHealth,
  getReviewQueue,
  listNotebooks,
  listSources,
  NotebookItem,
  setCustomApiUrl,
  SourceStatus,
} from './lib/api'
import SourceUpload from './components/SourceUpload'
import ChatPanel from './components/ChatPanel'
import HighlightsPanel from './components/HighlightsPanel'
import FlashcardReview from './components/FlashcardReview'
import QuizReview from './components/QuizReview'
import ReviewSession from './components/ReviewSession'

const envNotebookId = import.meta.env.VITE_DEMO_NOTEBOOK_ID as string | undefined

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null)
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([])
  const [activeNotebook, setActiveNotebook] = useState<NotebookItem | null>(null)
  const [tab, setTab] = useState<'ask' | 'sources' | 'highlights' | 'flashcards' | 'quizzes'>('ask')
  const [showReview, setShowReview] = useState(false)
  const [dueCount, setDueCount] = useState(0)
  const [sources, setSources] = useState<SourceStatus[]>([])
  const [activeSourceId, setActiveSourceId] = useState<string | undefined>(undefined)
  const [isCreatingNotebook, setIsCreatingNotebook] = useState(false)
  const [newNotebookTitle, setNewNotebookTitle] = useState('')
  const [showApiModal, setShowApiModal] = useState(false)
  const [apiUrlInput, setApiUrlInput] = useState('')

  // Periodic health check heartbeat
  useEffect(() => {
    function check() {
      getHealth()
        .then(() => setOnline(true))
        .catch(() => setOnline(false))
    }
    check()
    const timer = setInterval(check, 5_000)
    return () => clearInterval(timer)
  }, [])

  function loadNotebooks() {
    listNotebooks()
      .then(async nbs => {
        if (nbs.length === 0) {
          try {
            const initial = await createNotebook('Clinical Hematology & MLS Review')
            setNotebooks([initial])
            setActiveNotebook(initial)
            localStorage.setItem('medtech_active_notebook_id', initial.id)
            return
          } catch {
            // fallback
          }
        }
        setNotebooks(nbs)
        if (nbs.length > 0) {
          const savedId = localStorage.getItem('medtech_active_notebook_id')
          const matched = savedId
            ? nbs.find(n => n.id === savedId)
            : envNotebookId
            ? nbs.find(n => n.id === envNotebookId)
            : null
          const chosen = matched || nbs[0]
          setActiveNotebook(chosen)
          localStorage.setItem('medtech_active_notebook_id', chosen.id)
        }
      })
      .catch(() => {
        if (envNotebookId) {
          setActiveNotebook({ id: envNotebookId, title: 'Hematology', created_at: '' })
        } else {
          setActiveNotebook({ id: 'demo-notebook-local', title: 'Hematology & MLS Review', created_at: '' })
        }
      })
  }

  // Load notebooks on mount or when API reconnected
  useEffect(() => {
    loadNotebooks()
  }, [online])

  function handleSelectNotebook(nb: NotebookItem) {
    setActiveNotebook(nb)
    localStorage.setItem('medtech_active_notebook_id', nb.id)
    setShowReview(false)
  }

  function handleSelectSource(id: string | undefined) {
    setActiveSourceId(id)
    if (activeNotebook?.id && id) {
      localStorage.setItem(`medtech_active_source_${activeNotebook.id}`, id)
    }
  }

  // Fetch sources list whenever activeNotebook changes
  useEffect(() => {
    if (!activeNotebook?.id) return
    function fetchSources() {
      listSources(activeNotebook!.id)
        .then(list => {
          setSources(list)
          if (list.length > 0) {
            const savedSrcId = localStorage.getItem(`medtech_active_source_${activeNotebook!.id}`)
            setActiveSourceId(prev => {
              if (prev && list.some(s => s.id === prev)) return prev
              if (savedSrcId && list.some(s => s.id === savedSrcId)) return savedSrcId
              return list[0].id
            })
          } else {
            setActiveSourceId(undefined)
          }
        })
        .catch(() => {})
    }
    fetchSources()
    const timer = setInterval(fetchSources, 3_000)
    return () => clearInterval(timer)
  }, [activeNotebook?.id])

  // Fetch review queue count whenever activeNotebook changes
  useEffect(() => {
    if (!activeNotebook?.id) return
    function fetchCount() {
      getReviewQueue(activeNotebook!.id)
        .then(q => setDueCount(q.length))
        .catch(() => {})
    }
    fetchCount()
    const timer = setInterval(fetchCount, 20_000)
    return () => clearInterval(timer)
  }, [activeNotebook?.id])

  async function handleCreateNotebook() {
    if (!newNotebookTitle.trim()) return
    try {
      const created = await createNotebook(newNotebookTitle.trim())
      setNotebooks(prev => [...prev, created])
      setActiveNotebook(created)
      localStorage.setItem('medtech_active_notebook_id', created.id)
      setNewNotebookTitle('')
      setIsCreatingNotebook(false)
      setShowReview(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create notebook')
    }
  }

  function handleSourceReady(id: string) {
    handleSelectSource(id)
    if (activeNotebook?.id) {
      listSources(activeNotebook.id).then(setSources).catch(() => {})
    }
  }

  const activeSource = sources.find(s => s.id === activeSourceId) || sources[0]
  const sourceCount = sources.length
  const notebookId = activeNotebook?.id || envNotebookId

  if (showReview) {
    return (
      <main className="shell">
        <aside className="sidebar">
          <div className="brand"><span className="brand-mark">M</span><span>MedTech Review</span></div>
          <button className="new-notebook" onClick={() => setIsCreatingNotebook(true)}>+ New notebook</button>

          {isCreatingNotebook && (
            <div style={{ marginBottom: 16, padding: '0 8px' }}>
              <input
                autoFocus
                placeholder="Notebook title…"
                value={newNotebookTitle}
                onChange={e => setNewNotebookTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateNotebook()}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 7,
                  border: '1px solid #c8d6cb',
                  marginBottom: 6,
                  font: 'inherit',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleCreateNotebook}
                  style={{
                    flex: 1,
                    background: '#196946',
                    color: '#fff',
                    border: 0,
                    borderRadius: 6,
                    padding: '6px',
                    fontSize: 12,
                    fontWeight: 650,
                    cursor: 'pointer',
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => setIsCreatingNotebook(false)}
                  style={{
                    background: '#e9ede9',
                    color: '#556159',
                    border: 0,
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <p className="label">YOUR NOTEBOOKS</p>
          <nav>
            {notebooks.map(item => (
              <button
                key={item.id}
                onClick={() => handleSelectNotebook(item)}
                className={activeNotebook?.id === item.id && !showReview ? 'nav-item active' : 'nav-item'}
              >
                <span>◫</span>
                {item.title}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button className="nav-item active" onClick={() => setShowReview(true)}>
              ◷ Review queue <b>{dueCount}</b>
            </button>
            <button className="nav-item">◌ Progress</button>
          </div>
        </aside>

        <section className="workspace">
          <header>
            <div>
              <p className="eyebrow">REVIEW · {activeNotebook?.title || 'GENERAL'}</p>
              <h1>Spaced Repetition</h1>
            </div>
            <div className="status">
              <i className={online ? 'ok' : 'off'}></i>
              {online === null ? 'Connecting…' : online ? 'API connected' : 'API offline'}
            </div>
          </header>
          <ReviewSession notebookId={notebookId} />
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">M</span><span>MedTech Review</span></div>
        <button className="new-notebook" onClick={() => setIsCreatingNotebook(true)}>+ New notebook</button>

        {isCreatingNotebook && (
          <div style={{ marginBottom: 16, padding: '0 8px' }}>
            <input
              autoFocus
              placeholder="Notebook title…"
              value={newNotebookTitle}
              onChange={e => setNewNotebookTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateNotebook()}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 7,
                border: '1px solid #c8d6cb',
                marginBottom: 6,
                font: 'inherit',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleCreateNotebook}
                style={{
                  flex: 1,
                  background: '#196946',
                  color: '#fff',
                  border: 0,
                  borderRadius: 6,
                  padding: '6px',
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                Create
              </button>
              <button
                onClick={() => setIsCreatingNotebook(false)}
                style={{
                  background: '#e9ede9',
                  color: '#556159',
                  border: 0,
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className="label">YOUR NOTEBOOKS</p>
        <nav>
          {notebooks.map(item => (
            <button
              key={item.id}
              onClick={() => handleSelectNotebook(item)}
              className={activeNotebook?.id === item.id ? 'nav-item active' : 'nav-item'}
            >
              <span>◫</span>
              {item.title}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setShowReview(true)}>
            ◷ Review queue <b>{dueCount}</b>
          </button>
          <button className="nav-item">◌ Progress</button>
        </div>
      </aside>

      <section className="workspace">
        <header>
          <div>
            <p className="eyebrow">NOTEBOOK</p>
            <h1>{activeNotebook?.title || 'Loading…'}</h1>
          </div>
          <button
            type="button"
            className="status-pill-btn"
            onClick={() => {
              setApiUrlInput(getApiUrl())
              setShowApiModal(true)
            }}
            title="Click to configure backend API URL"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: online ? 'rgba(25, 105, 70, 0.08)' : 'rgba(220, 53, 69, 0.08)',
              border: `1px solid ${online ? '#a3cfbb' : '#f5c2c7'}`,
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 650,
              color: online ? '#0f5132' : '#842029',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: online ? '#198754' : '#dc3545',
                display: 'inline-block',
              }}
            />
            {online === null ? 'Connecting…' : online ? '● API connected' : '● API offline (Configure)'}
          </button>
        </header>

        {showApiModal && (
          <div className="modal-backdrop" onClick={() => setShowApiModal(false)}>
            <div className="chapter-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <div className="modal-icon">⚙️</div>
                <div className="modal-title-wrap">
                  <h3>Backend Server Connection</h3>
                  <p className="modal-filename">Connect to your Laptop or Cloud Server</p>
                </div>
                <button className="modal-close-btn" onClick={() => setShowApiModal(false)}>✕</button>
              </div>
              <div style={{ padding: '16px 0' }}>
                <p style={{ fontSize: 13, color: '#3d4d42', marginBottom: 10, lineHeight: 1.5 }}>
                  Enter your backend API URL (e.g. Cloudflare tunnel or local server):
                </p>
                <input
                  value={apiUrlInput}
                  onChange={e => setApiUrlInput(e.target.value)}
                  placeholder="https://xxx.trycloudflare.com or http://127.0.0.1:8000"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #c8d6cb',
                    fontSize: 13,
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setApiUrlInput('https://stan-kyle-see-settlement.trycloudflare.com')}
                    style={{ fontSize: 11, background: '#eef6f2', color: '#133e29', border: '1px solid #c8d6cb', padding: '5px 9px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                  >
                    ⚡ Use Active Laptop Tunnel
                  </button>
                  <button
                    type="button"
                    onClick={() => setApiUrlInput('http://127.0.0.1:8000')}
                    style={{ fontSize: 11, background: '#eef6f2', color: '#133e29', border: '1px solid #c8d6cb', padding: '5px 9px', borderRadius: 6, cursor: 'pointer' }}
                  >
                    Use Localhost
                  </button>
                </div>
              </div>
              <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
                <button className="modal-btn secondary" onClick={() => setShowApiModal(false)}>Cancel</button>
                <button
                  className="modal-btn primary"
                  onClick={() => {
                    setCustomApiUrl(apiUrlInput)
                    setShowApiModal(false)
                    getHealth().then(() => setOnline(true)).catch(() => setOnline(false))
                    loadNotebooks()
                  }}
                >
                  Save & Connect
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="tabs">
          <button onClick={() => setTab('ask')} className={tab === 'ask' ? 'tab selected' : 'tab'}>
            Ask
          </button>
          <button onClick={() => setTab('sources')} className={tab === 'sources' ? 'tab selected' : 'tab'}>
            Sources <span>{sourceCount}</span>
          </button>
          <button onClick={() => setTab('highlights')} className={tab === 'highlights' ? 'tab selected' : 'tab'}>
            Highlights
          </button>
          <button onClick={() => setTab('flashcards')} className={tab === 'flashcards' ? 'tab selected' : 'tab'}>
            Flashcards
          </button>
          <button onClick={() => setTab('quizzes')} className={tab === 'quizzes' ? 'tab selected' : 'tab'}>
            Quizzes
          </button>
        </div>

        {/* Source picker & status bar for highlights, flashcards, and quizzes */}
        {(tab === 'highlights' || tab === 'flashcards' || tab === 'quizzes') && sources.length > 0 && (
          <div className="source-picker">
            <label className="source-picker-label">Active Source:</label>
            {sources.length > 1 ? (
              <select
                className="source-picker-select"
                value={activeSource?.id ?? ''}
                onChange={e => handleSelectSource(e.target.value || undefined)}
              >
                {sources.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.filename} ({s.upload_status})
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <strong>{activeSource?.filename}</strong>
                <span className={`source-status ${activeSource?.upload_status}`}>
                  {activeSource?.upload_status}
                </span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: tab === 'ask' ? 'contents' : 'none' }}>
          <ChatPanel notebookId={notebookId} />
        </div>
        <div style={{ display: tab === 'sources' ? 'contents' : 'none' }}>
          <SourceUpload
            notebookId={notebookId}
            sources={sources}
            onSourcesChange={setSources}
            onSourceReady={handleSourceReady}
          />
        </div>
        <div style={{ display: tab === 'highlights' ? 'contents' : 'none' }}>
          <HighlightsPanel source={activeSource} />
        </div>
        <div style={{ display: tab === 'flashcards' ? 'contents' : 'none' }}>
          <FlashcardReview source={activeSource} />
        </div>
        <div style={{ display: tab === 'quizzes' ? 'contents' : 'none' }}>
          <QuizReview source={activeSource} />
        </div>
      </section>
    </main>
  )
}
