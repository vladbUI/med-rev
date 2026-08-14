import { useEffect, useState } from 'react'
import { generateHighlights, getHighlights, HighlightsData, SourceStatus } from '../lib/api'
import './highlights-panel.css'

interface Props {
  source: SourceStatus | undefined
}

type TabCategory = 'all' | 'takeaways' | 'labs' | 'terms' | 'passages'

export default function HighlightsPanel({ source }: Props) {
  const [data, setData] = useState<HighlightsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState<TabCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const sourceId = source?.id
  const isReady = source?.upload_status === 'ready'

  useEffect(() => {
    if (!sourceId || !isReady) {
      setData(null)
      return
    }
    setLoading(true)
    setError('')
    getHighlights(sourceId)
      .then(res => setData(res))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load highlights'))
      .finally(() => setLoading(false))
  }, [sourceId, isReady])

  async function handleExtract() {
    if (!sourceId) return
    setLoading(true)
    setError('')
    try {
      const res = await generateHighlights(sourceId)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract highlights')
    } finally {
      setLoading(false)
    }
  }

  function handleCopyAll() {
    if (!data) return
    let text = `# High-Yield Highlights — ${data.topic_tag || 'Study Notes'}\n\n`

    if (data.key_takeaways.length) {
      text += `## Key Takeaways\n${data.key_takeaways.map(t => `- ${t}`).join('\n')}\n\n`
    }

    if (data.lab_values.length) {
      text += `## Lab Values & Reference Ranges\n`
      data.lab_values.forEach(lv => {
        text += `- ${lv.analyte}: ${lv.range_or_value} ${lv.unit || ''} (${lv.significance || ''})\n`
      })
      text += '\n'
    }

    if (data.key_terms.length) {
      text += `## Key Terms & Diagnostic Criteria\n`
      data.key_terms.forEach(kt => {
        text += `- **${kt.term}**: ${kt.definition} ${kt.note ? `[Note: ${kt.note}]` : ''}\n`
      })
      text += '\n'
    }

    if (data.highlighted_passages.length) {
      text += `## Highlighted Passages\n`
      data.highlighted_passages.forEach(hp => {
        text += `> "${hp.highlight}" (Page ${hp.page_number || 'N/A'})\n\n`
      })
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function renderHighlightedText(context: string, highlight: string) {
    if (!highlight || !context.includes(highlight)) {
      return (
        <p className="passage-context">
          <mark className="hl-text">{highlight || context}</mark>
        </p>
      )
    }
    const parts = context.split(highlight)
    return (
      <p className="passage-context">
        {parts[0]}
        <mark className="hl-text">{highlight}</mark>
        {parts.slice(1).join(highlight)}
      </p>
    )
  }

  if (!source) {
    return (
      <section className="hl-panel">
        <div className="hl-empty">
          <div className="hl-empty-icon">✨</div>
          <h3>Select a Study Source</h3>
          <p>Upload a document in the <strong>Sources</strong> tab to extract high-yield concepts, lab values, and highlighted passages.</p>
        </div>
      </section>
    )
  }

  if (!isReady) {
    return (
      <section className="hl-panel">
        <div className="hl-empty">
          <div className="hl-spinner" />
          <h3>Processing {source.filename}…</h3>
          <p>
            Status: <span className="source-status">{source.upload_status}</span>
            <br />
            Analyzing source material. Highlights will be ready to view once complete!
          </p>
        </div>
      </section>
    )
  }

  const query = searchQuery.toLowerCase().trim()

  const filteredTakeaways = (data?.key_takeaways || []).filter(
    t => !query || t.toLowerCase().includes(query)
  )

  const filteredLabs = (data?.lab_values || []).filter(
    lv =>
      !query ||
      lv.analyte.toLowerCase().includes(query) ||
      (lv.significance && lv.significance.toLowerCase().includes(query)) ||
      lv.range_or_value.toLowerCase().includes(query)
  )

  const filteredTerms = (data?.key_terms || []).filter(
    kt =>
      !query ||
      kt.term.toLowerCase().includes(query) ||
      kt.definition.toLowerCase().includes(query) ||
      (kt.note && kt.note.toLowerCase().includes(query))
  )

  const filteredPassages = (data?.highlighted_passages || []).filter(
    hp =>
      !query ||
      hp.highlight.toLowerCase().includes(query) ||
      hp.context.toLowerCase().includes(query)
  )

  return (
    <section className="hl-panel">
      <div className="hl-header">
        <div>
          <div className="hl-title-row">
            <h2>High-Yield Highlights</h2>
            {data?.topic_tag && <span className="hl-topic-tag">{data.topic_tag}</span>}
          </div>
          <p className="hl-subtitle">
            Critical laboratory ranges, definitions, and highlighted study points extracted directly from your source.
          </p>
        </div>
        <div className="hl-header-actions">
          {data && (
            <button className="hl-action-btn secondary" onClick={handleCopyAll}>
              {copied ? '✓ Copied!' : '📋 Copy Notes'}
            </button>
          )}
          <button className="hl-action-btn primary" onClick={handleExtract} disabled={loading}>
            {loading ? 'Extracting…' : data ? '↻ Refresh Highlights' : '✦ Extract Highlights'}
          </button>
        </div>
      </div>

      {error && <p className="hl-error">{error}</p>}

      {loading && (
        <div className="hl-loading">
          <div className="hl-spinner"></div>
          <p>Analyzing document and extracting high-yield medical highlights…</p>
        </div>
      )}

      {!loading && !data && !error && (
        <div className="hl-empty">
          <div className="hl-empty-icon">📑</div>
          <h3>No Highlights Extracted Yet</h3>
          <p>Click "Extract Highlights" above to automatically pull key lab ranges, definitions, and critical passages.</p>
          <button className="hl-action-btn primary" onClick={handleExtract}>
            ✦ Extract Highlights
          </button>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Controls toolbar */}
          <div className="hl-controls">
            <div className="hl-category-tabs">
              <button
                className={`hl-cat-btn ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                All Concepts
              </button>
              <button
                className={`hl-cat-btn ${activeCategory === 'takeaways' ? 'active' : ''}`}
                onClick={() => setActiveCategory('takeaways')}
              >
                ⚡ Takeaways <span className="cat-count">{data.key_takeaways.length}</span>
              </button>
              <button
                className={`hl-cat-btn ${activeCategory === 'labs' ? 'active' : ''}`}
                onClick={() => setActiveCategory('labs')}
              >
                🧪 Lab Ranges <span className="cat-count">{data.lab_values.length}</span>
              </button>
              <button
                className={`hl-cat-btn ${activeCategory === 'terms' ? 'active' : ''}`}
                onClick={() => setActiveCategory('terms')}
              >
                🔑 Terminology <span className="cat-count">{data.key_terms.length}</span>
              </button>
              <button
                className={`hl-cat-btn ${activeCategory === 'passages' ? 'active' : ''}`}
                onClick={() => setActiveCategory('passages')}
              >
                📄 Excerpts <span className="cat-count">{data.highlighted_passages.length}</span>
              </button>
            </div>

            <div className="hl-search-box">
              <span className="hl-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Filter concepts or terms…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="hl-clear-search" onClick={() => setSearchQuery('')}>
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="hl-content-container">
            {/* 1. Key Takeaways Section */}
            {(activeCategory === 'all' || activeCategory === 'takeaways') && filteredTakeaways.length > 0 && (
              <section className="hl-section">
                <div className="hl-sec-header">
                  <span className="hl-sec-icon">⚡</span>
                  <h3>Key Takeaways & Core Concepts</h3>
                </div>
                <ul className="hl-takeaways-list">
                  {filteredTakeaways.map((takeaway, idx) => (
                    <li key={idx} className="hl-takeaway-item">
                      <span className="takeaway-bullet">●</span>
                      <p>{takeaway}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 2. Lab Values & Reference Ranges Section */}
            {(activeCategory === 'all' || activeCategory === 'labs') && filteredLabs.length > 0 && (
              <section className="hl-section">
                <div className="hl-sec-header">
                  <span className="hl-sec-icon">🧪</span>
                  <h3>Reference Intervals & Lab Values</h3>
                </div>
                <div className="hl-table-wrapper">
                  <table className="hl-lab-table">
                    <thead>
                      <tr>
                        <th>Analyte / Parameter</th>
                        <th>Reference Range</th>
                        <th>Clinical Significance / Critical Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLabs.map((lv, idx) => (
                        <tr key={idx}>
                          <td className="analyte-cell">
                            <strong>{lv.analyte}</strong>
                          </td>
                          <td className="range-cell">
                            <span className="range-badge">
                              {lv.range_or_value} {lv.unit && <span className="unit-text">{lv.unit}</span>}
                            </span>
                          </td>
                          <td className="sig-cell">{lv.significance || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 3. Key Terminology Section */}
            {(activeCategory === 'all' || activeCategory === 'terms') && filteredTerms.length > 0 && (
              <section className="hl-section">
                <div className="hl-sec-header">
                  <span className="hl-sec-icon">🔑</span>
                  <h3>Diagnostic Terminology & Criteria</h3>
                </div>
                <div className="hl-terms-grid">
                  {filteredTerms.map((term, idx) => (
                    <div key={idx} className="hl-term-card">
                      <div className="term-card-header">
                        <h4>{term.term}</h4>
                      </div>
                      <p className="term-def">{term.definition}</p>
                      {term.note && (
                        <div className="term-note">
                          <span className="note-badge">Tip</span>
                          <span>{term.note}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 4. Highlighted Passages Section */}
            {(activeCategory === 'all' || activeCategory === 'passages') && filteredPassages.length > 0 && (
              <section className="hl-section">
                <div className="hl-sec-header">
                  <span className="hl-sec-icon">📄</span>
                  <h3>Highlighted Source Excerpts</h3>
                </div>
                <div className="hl-passages-list">
                  {filteredPassages.map((passage, idx) => (
                    <article key={idx} className="hl-passage-card">
                      <div className="passage-header">
                        {passage.page_number ? (
                          <span className="page-tag">Page {passage.page_number}</span>
                        ) : (
                          <span className="page-tag">Excerpt #{idx + 1}</span>
                        )}
                      </div>
                      {renderHighlightedText(passage.context, passage.highlight)}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* No matches search state */}
            {query &&
              !filteredTakeaways.length &&
              !filteredLabs.length &&
              !filteredTerms.length &&
              !filteredPassages.length && (
                <div className="hl-no-results">
                  <p>No highlights matched "<strong>{searchQuery}</strong>".</p>
                </div>
              )}
          </div>
        </>
      )}
    </section>
  )
}
