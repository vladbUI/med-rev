import { useCallback, useEffect, useState } from 'react'
import { FlashcardInQueue, getReviewQueue, gradeCard } from '../lib/api'
import './review-session.css'

interface Props {
  notebookId: string | undefined
}

const GRADE_LABELS = [
  { rating: 1, label: 'Again', key: '1', color: '#c94040' },
  { rating: 2, label: 'Hard', key: '2', color: '#c98a2e' },
  { rating: 3, label: 'Good', key: '3', color: '#2e8f5e' },
  { rating: 4, label: 'Easy', key: '4', color: '#2870a0' },
]

export default function ReviewSession({ notebookId }: Props) {
  const [queue, setQueue] = useState<FlashcardInQueue[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState('')

  const fetchQueue = useCallback(async () => {
    if (!notebookId) return
    setLoading(true); setError('')
    try {
      const data = await getReviewQueue(notebookId)
      setQueue(data)
      setCurrentIdx(0)
      setRevealed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue')
    } finally { setLoading(false) }
  }, [notebookId])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  async function handleGrade(rating: number) {
    const card = queue[currentIdx]
    if (!card || grading) return
    setGrading(true); setError('')
    try {
      await gradeCard(card.id, rating)
      // Move to next card
      if (currentIdx + 1 < queue.length) {
        setCurrentIdx(prev => prev + 1)
        setRevealed(false)
      } else {
        // Queue exhausted — refresh
        await fetchQueue()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grading failed')
    } finally { setGrading(false) }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        if (!revealed) setRevealed(true)
      }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        handleGrade(parseInt(e.key))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!notebookId) {
    return (
      <section className="review-panel">
        <div className="review-empty">
          <div className="review-empty-icon">📖</div>
          <h3>Review queue</h3>
          <p>Configure your notebook to start reviewing flashcards.</p>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="review-panel">
        <div className="review-loading">
          <div className="review-spinner"></div>
          <p>Loading review queue…</p>
        </div>
      </section>
    )
  }

  if (queue.length === 0) {
    return (
      <section className="review-panel">
        <div className="review-empty">
          <div className="review-empty-icon">🎉</div>
          <h3>All caught up!</h3>
          <p>No cards are due for review right now. Generate some flashcards from your sources to get started.</p>
        </div>
      </section>
    )
  }

  const card = queue[currentIdx]

  return (
    <section className="review-panel">
      <div className="review-header">
        <h2>Review</h2>
        <span className="review-progress">Card {currentIdx + 1} of {queue.length}</span>
      </div>

      {error && <p className="review-error">{error}</p>}

      <div className="review-card-container">
        <article className={`review-card ${revealed ? 'revealed' : ''}`}>
          {card.topic_tag && <span className="review-topic">{card.topic_tag}</span>}
          <div className="review-front">
            <span className="review-side-label">Front</span>
            <p>{card.front}</p>
          </div>

          {revealed && (
            <div className="review-back">
              <span className="review-side-label">Back</span>
              <p>{card.back}</p>
            </div>
          )}
        </article>

        {!revealed ? (
          <button className="review-reveal-btn" onClick={() => setRevealed(true)}>
            Reveal answer <span className="shortcut-hint">Space</span>
          </button>
        ) : (
          <div className="review-grade-bar">
            {GRADE_LABELS.map(g => (
              <button
                key={g.rating}
                className="review-grade-btn"
                style={{ '--grade-color': g.color } as React.CSSProperties}
                onClick={() => handleGrade(g.rating)}
                disabled={grading}
              >
                {g.label}
                <span className="shortcut-hint">{g.key}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="review-shortcuts-hint">
        Shortcuts: <kbd>Space</kbd> reveal · <kbd>1</kbd> Again · <kbd>2</kbd> Hard · <kbd>3</kbd> Good · <kbd>4</kbd> Easy
      </p>
    </section>
  )
}
