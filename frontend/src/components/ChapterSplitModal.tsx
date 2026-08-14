import { useState } from 'react'
import { ChapterItem } from '../lib/api'
import './chapter-split-modal.css'

interface Props {
  filename: string
  chapters: ChapterItem[]
  alreadyImportedTitles?: Set<string>
  isExistingBook?: boolean
  onConfirm: (selectedChapters: ChapterItem[]) => void
  onImportSingle?: () => void
  onCancel: () => void
}

export default function ChapterSplitModal({
  filename,
  chapters,
  alreadyImportedTitles = new Set(),
  isExistingBook = false,
  onConfirm,
  onImportSingle,
  onCancel,
}: Props) {
  // By default, select all unimported chapters
  const initialSelected = new Set(
    chapters
      .filter(c => !alreadyImportedTitles.has(c.title.toLowerCase().trim()))
      .map(c => c.index)
  )

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(initialSelected)

  function isImported(ch: ChapterItem) {
    return alreadyImportedTitles.has(ch.title.toLowerCase().trim())
  }

  function toggleChapter(index: number) {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAll() {
    const selectable = chapters.filter(c => !isImported(c))
    if (selectedIndices.size === selectable.length) {
      setSelectedIndices(new Set())
    } else {
      setSelectedIndices(new Set(selectable.map(c => c.index)))
    }
  }

  function handleImport() {
    const selected = chapters.filter(c => selectedIndices.has(c.index))
    if (!selected.length) return
    onConfirm(selected)
  }

  const unimportedCount = chapters.filter(c => !isImported(c)).length

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="chapter-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon">📖</div>
          <div className="modal-title-wrap">
            <h3>{isExistingBook ? 'Add More Chapters' : 'Chapters Detected'}</h3>
            <p className="modal-filename">{filename}</p>
          </div>
          <button className="modal-close-btn" onClick={onCancel} title="Close">
            ✕
          </button>
        </div>

        <p className="modal-description">
          {isExistingBook ? (
            <>
              Select which additional chapters from <strong>{filename}</strong> you want to import into this notebook.
            </>
          ) : (
            <>
              We found <strong>{chapters.length} chapters/sections</strong> in this book.
              Importing chapter-by-chapter makes text processing <strong>10x faster</strong> and lets you generate targeted quizzes and flashcards for specific chapters.
            </>
          )}
        </p>

        <div className="modal-toolbar">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={selectedIndices.size === unimportedCount && unimportedCount > 0}
              onChange={toggleAll}
            />
            <span>Select all available ({selectedIndices.size}/{unimportedCount})</span>
          </label>
          {alreadyImportedTitles.size > 0 && (
            <span style={{ fontSize: 12, color: '#1b6e4b', fontWeight: 600 }}>
              ✓ {alreadyImportedTitles.size} chapter{alreadyImportedTitles.size !== 1 ? 's' : ''} already in notebook
            </span>
          )}
        </div>

        <div className="chapter-list">
          {chapters.map(ch => {
            const imported = isImported(ch)
            return (
              <label
                key={ch.index}
                className={`chapter-item ${selectedIndices.has(ch.index) ? 'selected' : ''} ${imported ? 'already-imported' : ''}`}
                style={imported ? { opacity: 0.65, background: '#f6fbf8', borderColor: '#d1e7dd' } : {}}
              >
                <input
                  type="checkbox"
                  disabled={imported}
                  checked={imported || selectedIndices.has(ch.index)}
                  onChange={() => !imported && toggleChapter(ch.index)}
                />
                <div className="chapter-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>{ch.title}</strong>
                    {imported && (
                      <span style={{ fontSize: 11, background: '#d1e7dd', color: '#0f5132', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                        ✓ In notebook
                      </span>
                    )}
                  </div>
                  <span className="chapter-pages">
                    Pages {ch.start_page}–{ch.end_page} ({ch.page_count} {ch.page_count === 1 ? 'page' : 'pages'})
                  </span>
                </div>
              </label>
            )
          })}
        </div>

        <div className="modal-actions">
          {!isExistingBook && onImportSingle ? (
            <button className="modal-btn ghost" onClick={onImportSingle}>
              Import as 1 full document
            </button>
          ) : (
            <div />
          )}
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
