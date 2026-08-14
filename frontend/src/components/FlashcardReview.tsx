import { useState } from 'react'
import { FlashcardDraft, generateFlashcards, saveFlashcards, SourceStatus } from '../lib/api'
import './flashcard-review.css'

interface Props {
  source: SourceStatus | undefined
}

export default function FlashcardReview({ source }: Props) {
  const [drafts, setDrafts] = useState<FlashcardDraft[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const sourceId = source?.id
  const isReady = source?.upload_status === 'ready'

  async function handleGenerate() {
    if (!sourceId) {
      setError('No source available. Upload a study file first.')
      return
    }
    if (!isReady) {
      setError(`Source is currently ${source?.upload_status}. Please wait until it is ready.`)
      return
    }
    setError('')
    setSuccess('')
    setDrafts([])
    setSelected(new Set())
    setLoading(true)
    try {
      const result = await generateFlashcards(sourceId)
      setDrafts(result.drafts)
      setSelected(new Set(result.drafts.map((_, i) => i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!sourceId) return
    const toSave = drafts.filter((_, i) => selected.has(i))
    if (!toSave.length) {
      setError('Select at least one flashcard to save.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const result = await saveFlashcards(sourceId, toSave)
      setSuccess(`Saved ${result.saved_count} flashcard${result.saved_count > 1 ? 's' : ''}!`)
      setDrafts([])
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function toggleSelect(idx: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === drafts.length) setSelected(new Set())
    else setSelected(new Set(drafts.map((_, i) => i)))
  }

  function deleteDraft(idx: number) {
    setDrafts(prev => prev.filter((_, i) => i !== idx))
    setSelected(prev => {
      const next = new Set<number>()
      drafts.forEach((_, i) => {
        if (i < idx && prev.has(i)) next.add(i)
        if (i > idx && prev.has(i)) next.add(i - 1)
      })
      return next
    })
    if (editIdx === idx) setEditIdx(null)
  }

  function updateDraft(idx: number, field: string, value: string) {
    setDrafts(prev => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)))
  }

  if (!source) {
    return (
      <section className="flashcard-panel">
        <div className="fc-empty">
          <div className="fc-empty-icon">🎴</div>
          <h3>Generate flashcards</h3>
          <p>Upload a study source first in the <strong>Sources</strong> tab, then generate flashcards from it.</p>
        </div>
      </section>
    )
  }

  if (!isReady) {
    return (
      <section className="flashcard-panel">
        <div className="fc-empty">
          <div className="fc-spinner" />
          <h3>Processing {source.filename}…</h3>
          <p>
            Status: <span className="source-status">{source.upload_status}</span>
            <br />
            Analyzing chunks and creating vector index. Cards will be ready to generate shortly!
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flashcard-panel">
      <div className="fc-header">
        <div>
          <h2>Flashcards</h2>
          <p className="fc-subtitle">
            Generating study cards from <strong>{source.filename}</strong>
          </p>
        </div>
        <button className="fc-generate-btn" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Generating…' : '✦ Generate flashcards'}
        </button>
      </div>

      {error && <p className="fc-error">{error}</p>}
      {success && <p className="fc-success">{success}</p>}

      {loading && (
        <div className="fc-loading">
          <div className="fc-spinner"></div>
          <p>Analyzing {source.filename} and generating high-yield cards…</p>
        </div>
      )}

      {!loading && drafts.length === 0 && !success && (
        <div className="fc-empty">
          <div className="fc-empty-icon">🎴</div>
          <h3>Ready to generate</h3>
          <p>Click "Generate flashcards" to create basic & cloze cards from {source.filename}.</p>
          <button className="fc-generate-btn" onClick={handleGenerate}>
            ✦ Generate flashcards
          </button>
        </div>
      )}

      {drafts.length > 0 && (
        <>
          <div className="fc-toolbar">
            <label className="fc-select-all">
              <input
                type="checkbox"
                checked={selected.size === drafts.length && drafts.length > 0}
                onChange={toggleAll}
              />
              Select all ({selected.size}/{drafts.length})
            </label>
            <span className="fc-ai-badge">✦ AI Draft — review and edit before saving</span>
            <button className="fc-save-btn" onClick={handleSave} disabled={saving || !selected.size}>
              {saving ? 'Saving…' : `Save ${selected.size} card${selected.size > 1 ? 's' : ''}`}
            </button>
          </div>

          <div className="fc-list">
            {drafts.map((card, idx) => (
              <article
                key={idx}
                className={`fc-card ${selected.has(idx) ? 'selected' : ''} ${editIdx === idx ? 'editing' : ''}`}
              >
                <div className="fc-card-header">
                  <input
                    type="checkbox"
                    checked={selected.has(idx)}
                    onChange={() => toggleSelect(idx)}
                  />
                  <span className="fc-type-badge">{card.card_type}</span>
                  {card.topic_tag && <span className="fc-topic">{card.topic_tag}</span>}
                  <div className="fc-card-actions">
                    <button
                      className="fc-icon-btn"
                      onClick={() => setEditIdx(editIdx === idx ? null : idx)}
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      className="fc-icon-btn danger"
                      onClick={() => deleteDraft(idx)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {editIdx === idx ? (
                  <div className="fc-edit-fields">
                    <label>
                      Front
                      <textarea
                        value={card.front}
                        onChange={e => updateDraft(idx, 'front', e.target.value)}
                      />
                    </label>
                    <label>
                      Back
                      <textarea
                        value={card.back}
                        onChange={e => updateDraft(idx, 'back', e.target.value)}
                      />
                    </label>
                    <label>
                      Topic
                      <input
                        value={card.topic_tag ?? ''}
                        onChange={e => updateDraft(idx, 'topic_tag', e.target.value)}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="fc-card-body">
                    <div className="fc-front">
                      <strong>Front</strong>
                      <p>{card.front}</p>
                    </div>
                    <div className="fc-back">
                      <strong>Back</strong>
                      <p>{card.back}</p>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
