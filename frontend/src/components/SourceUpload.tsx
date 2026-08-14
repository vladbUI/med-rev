import { ChangeEvent, useEffect, useRef, useState } from 'react'
import {
  BookItem,
  ChapterItem,
  detectChapters,
  getBooks,
  getSourceStatus,
  importBookChapters,
  SourceStatus,
  uploadChapters,
  uploadSource,
} from '../lib/api'
import ChapterSplitModal from './ChapterSplitModal'
import './source-upload.css'

interface Props {
  notebookId?: string
  sources: SourceStatus[]
  onSourcesChange: (sources: SourceStatus[] | ((prev: SourceStatus[]) => SourceStatus[])) => void
  onSourceReady?: (sourceId: string) => void
}

const ALLOWED_EXTENSIONS = ['.pdf', '.pptx', '.docx', '.doc']

export default function SourceUpload({
  notebookId,
  sources,
  onSourcesChange,
  onSourceReady,
}: Props) {
  const [books, setBooks] = useState<BookItem[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatusText, setUploadStatusText] = useState('Uploading study file…')
  const [splitChaptersEnabled, setSplitChaptersEnabled] = useState(true)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [detectedChapters, setDetectedChapters] = useState<{
    file: File
    chapters: ChapterItem[]
  } | null>(null)
  const [activeBookForChapters, setActiveBookForChapters] = useState<BookItem | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load books for the notebook
  useEffect(() => {
    if (!notebookId) return
    getBooks(notebookId).then(setBooks).catch(() => {})
  }, [notebookId, sources.length])

  // Poll processing sources until they reach 'ready' or 'failed'
  useEffect(() => {
    const processing = sources.filter(
      s => !['ready', 'failed'].includes(s.upload_status)
    )
    if (!processing.length) return

    const timer = window.setInterval(() => {
      processing.forEach(src => {
        getSourceStatus(src.id)
          .then(updated => {
            onSourcesChange(prev =>
              prev.map(s => (s.id === updated.id ? updated : s))
            )
            if (updated.upload_status === 'ready') {
              setPendingIds(prev => {
                const next = new Set(prev)
                next.delete(updated.id)
                return next
              })
              onSourceReady?.(updated.id)
            }
            if (updated.upload_status === 'failed') {
              setPendingIds(prev => {
                const next = new Set(prev)
                next.delete(updated.id)
                return next
              })
            }
          })
          .catch(() => {})
      })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [sources, onSourcesChange, onSourceReady])

  async function selectFile(file?: File) {
    if (!file) return
    if (!notebookId) {
      setError('Please select or create a notebook first.')
      return
    }

    const filename = file.name.toLowerCase()
    const isAllowed = ALLOWED_EXTENSIONS.some(ext => filename.endsWith(ext))
    if (!isAllowed) {
      setError('Unsupported file type. Please choose a PDF, PPTX, or DOCX file.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (file.size > 200 * 1024 * 1024) {
      setError('File is too large. Maximum size is 200 MB.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setError('')
    setIsUploading(true)

    try {
      // Step 1: Detect chapters if enabled
      if (splitChaptersEnabled) {
        setUploadStatusText('Scanning document chapters and table of contents…')
        try {
          const detection = await detectChapters(file)
          if (detection.chapters && detection.chapters.length >= 2) {
            setIsUploading(false)
            setDetectedChapters({ file, chapters: detection.chapters })
            return
          }
        } catch {
          // If detection fails or timeout, fall back to direct single upload
        }
      }

      // Step 2: Single document upload
      setUploadStatusText('Uploading document and generating embeddings…')
      const newSource = await uploadSource(notebookId, file)
      onSourcesChange(prev => [newSource, ...prev.filter(s => s.id !== newSource.id)])
      setPendingIds(prev => new Set(prev).add(newSource.id))
      onSourceReady?.(newSource.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please check backend connection.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleImportChapters(selected: ChapterItem[]) {
    if (!detectedChapters || !notebookId) return
    const { file, chapters: allDetected } = detectedChapters
    setDetectedChapters(null)
    setIsUploading(true)
    setUploadStatusText(`Importing ${selected.length} chapters in parallel…`)

    try {
      const newSources = await uploadChapters(notebookId, file, selected, allDetected)
      onSourcesChange(prev => [...newSources, ...prev])
      setPendingIds(prev => {
        const next = new Set(prev)
        newSources.forEach(s => next.add(s.id))
        return next
      })
      if (newSources.length > 0) {
        onSourceReady?.(newSources[0].id)
      }
      getBooks(notebookId).then(setBooks).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import chapters')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleImportMoreFromExistingBook(selected: ChapterItem[]) {
    if (!activeBookForChapters || !notebookId) return
    const book = activeBookForChapters
    setActiveBookForChapters(null)
    setIsUploading(true)
    setUploadStatusText(`Importing ${selected.length} additional chapters from ${book.filename}…`)

    try {
      const newSources = await importBookChapters(book.id, selected)
      onSourcesChange(prev => [...newSources, ...prev])
      setPendingIds(prev => {
        const next = new Set(prev)
        newSources.forEach(s => next.add(s.id))
        return next
      })
      if (newSources.length > 0) {
        onSourceReady?.(newSources[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import chapters')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleImportSingleDocument() {
    if (!detectedChapters || !notebookId) return
    const { file } = detectedChapters
    setDetectedChapters(null)
    setIsUploading(true)
    setUploadStatusText('Uploading full document…')

    try {
      const newSource = await uploadSource(notebookId, file)
      onSourcesChange(prev => [newSource, ...prev.filter(s => s.id !== newSource.id)])
      setPendingIds(prev => new Set(prev).add(newSource.id))
      onSourceReady?.(newSource.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function statusLabel(s: SourceStatus): string {
    if (s.upload_status === 'ready') return 'Ready to study'
    if (s.upload_status === 'failed') return s.error_message ?? 'Processing failed'
    if (s.upload_status === 'embedding') return 'Creating vector embeddings…'
    if (s.upload_status === 'extracting') return 'Extracting chapter text…'
    return `Processing text… (${s.upload_status})`
  }

  function fileIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'pdf' || filename.includes('—')) return '📕'
    if (ext === 'pptx') return '📊'
    if (ext === 'docx' || ext === 'doc') return '📝'
    return '▤'
  }

  // Get imported chapter titles
  const importedTitles = new Set(
    sources.map(s => {
      const parts = s.filename.split('—')
      return parts.length > 1 ? parts.slice(1).join('—').toLowerCase().trim() : s.filename.toLowerCase().trim()
    })
  )

  return (
    <section className="sources-panel">
      {detectedChapters && (
        <ChapterSplitModal
          filename={detectedChapters.file.name}
          chapters={detectedChapters.chapters}
          alreadyImportedTitles={importedTitles}
          onConfirm={handleImportChapters}
          onImportSingle={handleImportSingleDocument}
          onCancel={() => setDetectedChapters(null)}
        />
      )}

      {activeBookForChapters && (
        <ChapterSplitModal
          filename={activeBookForChapters.filename}
          chapters={activeBookForChapters.chapters}
          alreadyImportedTitles={importedTitles}
          isExistingBook={true}
          onConfirm={handleImportMoreFromExistingBook}
          onCancel={() => setActiveBookForChapters(null)}
        />
      )}

      <div className="sources-heading">
        <div>
          <h2>Your sources</h2>
          <p>
            Add study materials to ground chats, cards, and quizzes in your own
            notes. Textbooks can be auto-split into chapters for faster indexing.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#2f4337', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={splitChaptersEnabled}
              onChange={e => setSplitChaptersEnabled(e.target.checked)}
              style={{ accentColor: '#196946', width: 15, height: 15 }}
            />
            Split book into chapters (Fast)
          </label>
          <span className="format-chip">PDF · PPTX · DOCX · up to 200 MB</span>
        </div>
      </div>

      <label
        className={dragging ? 'dropzone dragging' : isUploading ? 'dropzone uploading' : 'dropzone'}
        onDragOver={e => {
          e.preventDefault()
          if (!isUploading) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          if (!isUploading && e.dataTransfer.files?.[0]) {
            void selectFile(e.dataTransfer.files[0])
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.docx,.doc"
          disabled={isUploading}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            if (e.target.files?.[0]) {
              void selectFile(e.target.files[0])
            }
          }}
        />
        {isUploading ? (
          <div className="dropzone-uploading">
            <span className="spinner" />
            <p>{uploadStatusText}</p>
          </div>
        ) : (
          <div className="dropzone-idle">
            <span className="upload-icon">⬆</span>
            <p>
              <strong>Click to upload</strong> or drag and drop
            </p>
            <span>PDF, PPTX, or DOCX up to 200 MB</span>
          </div>
        )}
      </label>

      {error && <p className="source-error">{error}</p>}

      {/* Uploaded Textbooks section */}
      {books.length > 0 && (
        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a3325', margin: 0 }}>
              📚 Textbooks in Notebook ({books.length})
            </h3>
            <span style={{ fontSize: 12, color: '#52695c' }}>
              Add more chapters anytime without re-uploading
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {books.map(book => {
              const importedCount = book.chapters.filter(c =>
                importedTitles.has(c.title.toLowerCase().trim())
              ).length
              return (
                <div
                  key={book.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fcfa',
                    border: '1px solid #d1e7dd',
                    borderRadius: 10,
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 24 }}>📖</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#133e29' }}>{book.filename}</div>
                      <div style={{ fontSize: 12, color: '#4a6756', marginTop: 2 }}>
                        {importedCount} of {book.total_chapters} chapters imported
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveBookForChapters(book)}
                    disabled={isUploading}
                    style={{
                      background: '#196946',
                      color: '#fff',
                      border: 'none',
                      padding: '7px 14px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    + Add Chapters
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="source-list-header">
        <h3>Active Chapter & Study Sources ({sources.length})</h3>
        {pendingIds.size > 0 && (
          <span className="pending-badge">
            <span className="spinner-small" /> Processing {pendingIds.size} source{pendingIds.size > 1 ? 's' : ''}…
          </span>
        )}
      </div>

      <div className="source-list">
        {sources.length === 0 && !isUploading && (
          <p className="no-sources">No sources uploaded yet. Add a study file above to get started.</p>
        )}
        {sources.map(source => (
          <div key={source.id} className="source-item">
            <div className="source-meta">
              <span className="file-icon">{fileIcon(source.filename)}</span>
              <div>
                <strong>{source.filename}</strong>
                <span className={`status-pill ${source.upload_status}`}>
                  {statusLabel(source)}
                </span>
              </div>
            </div>
            {source.upload_status === 'processing' && (
              <span className="spinner-small" />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
