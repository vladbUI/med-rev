import { useState } from 'react'
import { QuizQuestionDraft, generateQuiz, saveQuiz, SourceStatus } from '../lib/api'
import './quiz-review.css'

interface Props {
  source: SourceStatus | undefined
}

export default function QuizReview({ source }: Props) {
  const [drafts, setDrafts] = useState<QuizQuestionDraft[]>([])
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
    setLoading(true)
    try {
      const result = await generateQuiz(sourceId)
      setDrafts(result.drafts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!sourceId || !drafts.length) return
    setError('')
    setSaving(true)
    try {
      const result = await saveQuiz(sourceId, drafts)
      setSuccess(`Saved ${result.saved_count} question${result.saved_count > 1 ? 's' : ''}!`)
      setDrafts([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function deleteDraft(idx: number) {
    setDrafts(prev => prev.filter((_, i) => i !== idx))
    if (editIdx === idx) setEditIdx(null)
  }

  function updateDraft(idx: number, field: string, value: unknown) {
    setDrafts(prev => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)))
  }

  function updateChoice(idx: number, key: string, value: string) {
    setDrafts(prev =>
      prev.map((d, i) => {
        if (i !== idx) return d
        return { ...d, choices: { ...d.choices, [key]: value } }
      })
    )
  }

  if (!source) {
    return (
      <section className="quiz-panel">
        <div className="quiz-empty">
          <div className="quiz-empty-icon">📋</div>
          <h3>Generate quiz questions</h3>
          <p>Upload a study source first in the <strong>Sources</strong> tab, then generate board-style MCQs from it.</p>
        </div>
      </section>
    )
  }

  if (!isReady) {
    return (
      <section className="quiz-panel">
        <div className="quiz-empty">
          <div className="quiz-spinner" />
          <h3>Processing {source.filename}…</h3>
          <p>
            Status: <span className="source-status">{source.upload_status}</span>
            <br />
            Creating chunk embeddings. Quizzes will be ready to generate once complete!
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="quiz-panel">
      <div className="quiz-header">
        <div>
          <h2>Board-Style Quizzes</h2>
          <p className="quiz-subtitle">
            Generating MCQs from <strong>{source.filename}</strong>
          </p>
        </div>
        <button className="quiz-generate-btn" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Generating…' : '✦ Generate quiz'}
        </button>
      </div>

      {error && <p className="quiz-error">{error}</p>}
      {success && <p className="quiz-success">{success}</p>}

      {loading && (
        <div className="quiz-loading">
          <div className="quiz-spinner"></div>
          <p>Generating board-style questions from {source.filename}…</p>
        </div>
      )}

      {!loading && drafts.length === 0 && !success && (
        <div className="quiz-empty">
          <div className="quiz-empty-icon">📝</div>
          <h3>Ready to generate</h3>
          <p>Click "Generate quiz" to pull board-exam multiple-choice questions from {source.filename}.</p>
          <button className="quiz-generate-btn" onClick={handleGenerate}>
            ✦ Generate quiz
          </button>
        </div>
      )}

      {drafts.length > 0 && (
        <>
          <div className="quiz-toolbar">
            <span className="quiz-ai-badge">✦ AI Draft — review and edit before saving</span>
            <button className="quiz-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : `Save ${drafts.length} question${drafts.length > 1 ? 's' : ''}`}
            </button>
          </div>

          <div className="quiz-list">
            {drafts.map((q, idx) => (
              <article key={idx} className="quiz-card">
                <div className="quiz-card-header">
                  <span className="quiz-num">Q{idx + 1}</span>
                  {q.topic_tag && <span className="quiz-topic">{q.topic_tag}</span>}
                  <div className="quiz-card-actions">
                    <button
                      className="quiz-icon-btn"
                      onClick={() => setEditIdx(editIdx === idx ? null : idx)}
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      className="quiz-icon-btn danger"
                      onClick={() => deleteDraft(idx)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {editIdx === idx ? (
                  <div className="quiz-edit-fields">
                    <label>
                      Question
                      <textarea
                        value={q.question}
                        onChange={e => updateDraft(idx, 'question', e.target.value)}
                      />
                    </label>
                    {Object.entries(q.choices).map(([key, val]) => (
                      <label key={key} className={key === q.correct_answer ? 'correct-choice' : ''}>
                        Choice {key}
                        <input
                          value={val}
                          onChange={e => updateChoice(idx, key, e.target.value)}
                        />
                      </label>
                    ))}
                    <label>
                      Correct answer
                      <select
                        value={q.correct_answer}
                        onChange={e => updateDraft(idx, 'correct_answer', e.target.value)}
                      >
                        {Object.keys(q.choices).map(k => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Rationale
                      <textarea
                        value={q.rationale ?? ''}
                        onChange={e => updateDraft(idx, 'rationale', e.target.value)}
                      />
                    </label>
                    <label>
                      Topic
                      <input
                        value={q.topic_tag ?? ''}
                        onChange={e => updateDraft(idx, 'topic_tag', e.target.value)}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="quiz-card-body">
                    <p className="quiz-question">{q.question}</p>
                    <div className="quiz-choices">
                      {Object.entries(q.choices).map(([key, val]) => (
                        <div
                          key={key}
                          className={`quiz-choice ${key === q.correct_answer ? 'correct' : ''}`}
                        >
                          <span className="choice-key">{key}</span>
                          <span>{val}</span>
                        </div>
                      ))}
                    </div>
                    {q.rationale && (
                      <div className="quiz-rationale">
                        <span className="rationale-label">Rationale</span>
                        <p>{q.rationale}</p>
                      </div>
                    )}
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
