export function getApiUrl(): string {
  const custom = typeof window !== 'undefined' ? localStorage.getItem('medtech_api_url') : null
  if (custom && custom.trim()) return custom.trim().replace(/\/+$/, '')
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/+$/, '')
  return 'http://127.0.0.1:8000'
}

export function setCustomApiUrl(url: string) {
  if (url && url.trim()) {
    localStorage.setItem('medtech_api_url', url.trim().replace(/\/+$/, ''))
  } else {
    localStorage.removeItem('medtech_api_url')
  }
}

// ── Health ──────────────────────────────────────────────────

export async function getHealth(): Promise<{ status: string }> {
  const response = await fetch(`${getApiUrl()}/health`)
  if (!response.ok) throw new Error('API unavailable')
  return response.json()
}

// ── Notebooks ───────────────────────────────────────────────

export type NotebookItem = {
  id: string
  title: string
  subject_tag?: string | null
  created_at: string
}

export async function listNotebooks(): Promise<NotebookItem[]> {
  const response = await fetch(`${getApiUrl()}/notebooks`)
  if (!response.ok) throw new Error('Could not fetch notebooks')
  return response.json()
}

export async function createNotebook(title: string, subject_tag?: string): Promise<NotebookItem> {
  const response = await fetch(`${getApiUrl()}/notebooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, subject_tag }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Failed to create notebook')
  return response.json()
}

// ── Sources ─────────────────────────────────────────────────

export type SourceStatus = {
  id: string
  filename: string
  upload_status: 'processing' | 'extracting' | 'embedding' | 'ready' | 'failed'
  error_message?: string | null
}

export type ChapterItem = {
  index: number
  title: string
  start_page: number
  end_page: number
  page_count: number
}

export type DetectChaptersResponse = {
  filename: string
  chapters: ChapterItem[]
  total_chapters: number
}

export async function detectChapters(file: File): Promise<DetectChaptersResponse> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${getApiUrl()}/sources/detect-chapters`, { method: 'POST', body: form })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Chapter detection failed')
  return response.json()
}

export type BookItem = {
  id: string
  notebook_id: string
  filename: string
  storage_path: string
  total_chapters: number
  chapters: ChapterItem[]
  created_at?: string
}

export async function getBooks(notebookId: string): Promise<BookItem[]> {
  const response = await fetch(`${getApiUrl()}/sources/books/${notebookId}`)
  if (!response.ok) return []
  return response.json()
}

export async function importBookChapters(
  bookId: string,
  chapters: ChapterItem[]
): Promise<SourceStatus[]> {
  const response = await fetch(`${getApiUrl()}/sources/books/${bookId}/import-chapters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapters }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Failed to import chapters')
  return response.json()
}

export async function uploadChapters(
  notebookId: string,
  file: File,
  chapters: ChapterItem[],
  allChapters?: ChapterItem[]
): Promise<SourceStatus[]> {
  const form = new FormData()
  form.append('file', file)
  form.append('chapters_json', JSON.stringify(chapters))
  if (allChapters) {
    form.append('all_chapters_json', JSON.stringify(allChapters))
  }
  const response = await fetch(`${getApiUrl()}/sources/upload-chapters?notebook_id=${notebookId}`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Chapter upload failed')
  return response.json()
}

export async function uploadSource(notebookId: string, file: File): Promise<SourceStatus> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${getApiUrl()}/sources/upload?notebook_id=${notebookId}`, { method: 'POST', body: form })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Upload failed')
  return response.json()
}

export async function getSourceStatus(sourceId: string): Promise<SourceStatus> {
  const response = await fetch(`${getApiUrl()}/sources/${sourceId}/status`)
  if (!response.ok) throw new Error('Could not fetch source status')
  return response.json()
}

export async function listSources(notebookId: string): Promise<SourceStatus[]> {
  const response = await fetch(`${getApiUrl()}/sources/list/${notebookId}`)
  if (!response.ok) throw new Error('Could not fetch sources')
  return response.json()
}

// ── Chat ────────────────────────────────────────────────────

export type CitedChunk = {
  chunk_id: string
  source_id: string
  filename: string
  page_number: number | null
  similarity: number | null
}

export type ChatMessage = {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  cited_chunk_ids: string[]
  cited_chunks: CitedChunk[]
  created_at: string
}

export type ChatSession = {
  id: string
  notebook_id: string
  title: string | null
  created_at: string
}

export async function createChatSession(notebookId: string): Promise<ChatSession> {
  const response = await fetch(`${getApiUrl()}/chat/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notebook_id: notebookId }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Failed to create session')
  return response.json()
}

export async function sendMessage(sessionId: string, content: string): Promise<ChatMessage> {
  const response = await fetch(`${getApiUrl()}/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Failed to send message')
  return response.json()
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const response = await fetch(`${getApiUrl()}/chat/sessions/${sessionId}/messages`)
  if (!response.ok) throw new Error('Could not fetch messages')
  return response.json()
}

// ── Generation ──────────────────────────────────────────────

export type FlashcardDraft = {
  card_type: 'basic' | 'cloze'
  front: string
  back: string
  topic_tag: string | null
}

export type QuizQuestionDraft = {
  question: string
  choices: Record<string, string>
  correct_answer: string
  rationale: string | null
  topic_tag: string | null
}

export async function generateFlashcards(sourceId: string): Promise<{ source_id: string; drafts: FlashcardDraft[] }> {
  const response = await fetch(`${getApiUrl()}/sources/${sourceId}/generate-flashcards`, { method: 'POST' })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Generation failed')
  return response.json()
}

export async function saveFlashcards(sourceId: string, flashcards: FlashcardDraft[]): Promise<{ saved_count: number }> {
  const response = await fetch(`${getApiUrl()}/sources/${sourceId}/save-flashcards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flashcards }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Save failed')
  return response.json()
}

export async function generateQuiz(sourceId: string): Promise<{ source_id: string; drafts: QuizQuestionDraft[] }> {
  const response = await fetch(`${getApiUrl()}/sources/${sourceId}/generate-quiz`, { method: 'POST' })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Generation failed')
  return response.json()
}

export async function saveQuiz(sourceId: string, questions: QuizQuestionDraft[]): Promise<{ saved_count: number }> {
  const response = await fetch(`${getApiUrl()}/sources/${sourceId}/save-quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Save failed')
  return response.json()
}

// ── Review (SRS) ────────────────────────────────────────────

export type FlashcardInQueue = {
  id: string
  source_id: string
  card_type: string
  front: string
  back: string
  topic_tag: string | null
  due: string
  state: number
  reps: number
  lapses: number
}

export async function getReviewQueue(notebookId: string): Promise<FlashcardInQueue[]> {
  const response = await fetch(`${getApiUrl()}/review/queue?notebook_id=${notebookId}`)
  if (!response.ok) throw new Error('Could not fetch review queue')
  return response.json()
}

export async function gradeCard(flashcardId: string, rating: number): Promise<FlashcardInQueue> {
  const response = await fetch(`${getApiUrl()}/review/${flashcardId}/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Grading failed')
  return response.json()
}

// ── Highlights & Key Concepts ───────────────────────────────

export type LabValueItem = {
  analyte: string
  range_or_value: string
  unit?: string | null
  significance?: string | null
}

export type KeyTermItem = {
  term: string
  definition: string
  note?: string | null
}

export type PassageItem = {
  chunk_index?: number | null
  page_number?: number | null
  context: string
  highlight: string
}

export type HighlightsData = {
  topic_tag?: string | null
  key_takeaways: string[]
  lab_values: LabValueItem[]
  key_terms: KeyTermItem[]
  highlighted_passages: PassageItem[]
}

export async function getHighlights(sourceId: string): Promise<HighlightsData | null> {
  const response = await fetch(`${getApiUrl()}/sources/${sourceId}/highlights`)
  if (!response.ok) throw new Error('Could not fetch highlights')
  return response.json()
}

export async function generateHighlights(sourceId: string): Promise<HighlightsData> {
  const response = await fetch(`${getApiUrl()}/sources/${sourceId}/highlights/generate`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Failed to extract highlights')
  return response.json()
}

