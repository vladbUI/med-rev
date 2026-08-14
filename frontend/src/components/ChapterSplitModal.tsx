import { useState } from 'react'
import { ChapterItem } from '../lib/api'
import './chapter-split-modal.css'

interface Props {
  filename: string
  chapters: ChapterItem[]
  onConfirm: (selectedChapters: ChapterItem[]) => void
  onImportSingle: () => void
  onCancel: () => void
}

export default function ChapterSplitModal({
  filename,
  chapters,
  onConfirm,
  onImportSingle,
  onCancel,
}: Props) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(chapters.map(c => c.index))
  )

  function toggleChapter(index: number) {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAll() {
    if (selectedIndices.size === chapters.length) {
      setSelectedIndices(new Set())
    } else {
      setSelectedIndices(new Set(chapters.map(c => c.index)))
    }
  }

  function handleImport() {
    const selected = chapters.filter(c => selectedIndices.has(c.index))
    if (!selected.length) return
    onConfirm(selected)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="chapter-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon">📖</div>
          <div className="modal-title-wrap">
            <h3>Chapters Detected</h3>
            <p className="modal-filename">{filename}</p>
          </div>
          <button className="modal-close-btn" onClick={onCancel} title="Close">
            ✕
          </button>
        </div>

        <p className="modal-description">
          We found <strong>{chapters.length} chapters/sections</strong> in this book.
          Importing chapter-by-chapter makes text processing <strong>10x faster</strong> and lets you generate targeted quizzes and flashcards for specific chapters.
        </p>

        <div className="modal-toolbar">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={selectedIndices.size === chapters.length && chapters.length > 0}
              onChange={toggleAll}
            />
            <span>Select all ({selectedIndices.size}/{chapters.length})</span>
          </label>
        </div>

        <div className="chapter-list">
          {chapters.map(ch => (
            <label
              key={ch.index}
              className={`chapter-item ${selectedIndices.has(ch.index) ? 'selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedIndices.has(ch.index)}
                onChange={() => toggleChapter(ch.index)}
              />
              <div className="chapter-info">
                <strong>{ch.title}</strong>
                <span className="chapter-pages">
                  Pages {ch.start_page}–{ch.end_page} ({ch.page_count} {ch.page_count === 1 ? 'page' : 'pages'})
                </span>
              </div>
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button className="modal-btn ghost" onClick={onImportSingle}>
            Import as 1 full document
          </button>
          <div className="action-right">
            <button className="modal-btn secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="modal-btn primary"
              onClick={handleImport}
              disabled={selectedIndices.size === 0}
            >
              Import {selectedIndices.size} Chapter{selectedIndices.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
