import DOMPurify from 'dompurify'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, MoreHorizontal, Pencil, Share2, Trash2 } from 'lucide-react'
import type { Question, ShareScope } from '../types/database'
import { client, friendlyError } from '../lib/data'
import { parseFlowchart, flowchartImageSource } from '../lib/flowchart'
import { orderedListStyleForType, questionImagePath } from '../lib/richText'
import { ShareDialog } from './ShareDialog'
import { useToast } from './Toast'

DOMPurify.addHook('beforeSanitizeAttributes', (node) => {
  if (node.nodeName.toLowerCase() !== 'ol') return
  const listStyle = orderedListStyleForType(node.getAttribute('type'))
  if (listStyle) node.setAttribute('data-list-style', listStyle)
})

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  const tagName = node.nodeName.toLowerCase()
  const value = data.attrValue

  if (tagName === 'ol' && data.attrName === 'type' && /^(?:1|a|A|i|I)$/.test(value)) {
    data.forceKeepAttr = true
  } else if (tagName === 'ol' && data.attrName === 'start' && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
    data.forceKeepAttr = true
  } else if ((tagName === 'td' || tagName === 'th') && (data.attrName === 'colspan' || data.attrName === 'rowspan') &&
    /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= (data.attrName === 'colspan' ? 1 : 0)) {
    data.forceKeepAttr = true
  }
})

export function QuestionCard({ question, serialNumber, onEdit, onDelete, onMove, readOnly = false, shareImage }: {
  question: Pick<Question, 'id' | 'type' | 'question' | 'answer' | 'board_years' | 'position'>
  serialNumber?: number
  onEdit?: () => void
  onDelete?: () => void
  onMove?: (direction: -1 | 1) => void
  readOnly?: boolean
  shareImage?: (path: string) => Promise<string>
}) {
  const [expanded, setExpanded] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [answer, setAnswer] = useState(question.answer)
  const [imageError, setImageError] = useState(false)
  const notify = useToast()

  useEffect(() => {
    let active = true
    async function resolveImages() {
      let html = question.answer
      const sources = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1])
      for (const source of sources) {
        const path = questionImagePath(source)
        if (!path) continue
        try {
          const url = shareImage
            ? await shareImage(path)
            : await client().storage.from('question-images').createSignedUrl(path, 3600).then(({ data, error }) => {
              if (error) throw error
              return data.signedUrl
            })
          if (url) html = html.replaceAll(source, url)
        } catch (error) {
          if (active) setImageError(true)
          if (readOnly) console.error('Could not load shared question image:', error)
          else notify(friendlyError(error), 'error')
        }
      }
      if (!active) return
      const sanitized = DOMPurify.sanitize(html, {
        ADD_ATTR: ['target'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?:\/\/|mailto:|storage:\/\/).+|data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*)$/i,
      })
      const template = document.createElement('template')
      template.innerHTML = sanitized
      for (const container of template.content.querySelectorAll('[data-study-flowchart]')) {
        const image = container.querySelector<HTMLImageElement>('img.flowchart-image')
        if (!image) continue
        const chart = parseFlowchart(container.getAttribute('data-study-flowchart'))
        if (!chart) {
          console.error('Could not refresh saved flowchart connectors: chart data is invalid.')
          continue
        }
        image.src = flowchartImageSource(chart)
      }
      setAnswer(template.innerHTML)
    }
    void resolveImages()
    return () => { active = false }
  }, [notify, question.answer, readOnly, shareImage])

  return (
    <article className="question-card" id={`question-${question.id}`}>
      <div className="question-card-heading">
        <button className="question-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          {serialNumber !== undefined && <span className="question-serial">{String(serialNumber).padStart(2, '0')}</span>}
          <span className="question-title">{question.question}</span>
          {question.board_years?.length > 0 && <span className="board-year-badge">Board - {question.board_years.join(', ')}</span>}
        </button>
        {!readOnly && <div className="question-tools">
          {onMove && <button className="icon-button compact" onClick={() => onMove(-1)} aria-label="Move question up"><ChevronUp size={17} /></button>}
          {onMove && <button className="icon-button compact" onClick={() => onMove(1)} aria-label="Move question down"><ChevronDown size={17} /></button>}
          <details className="row-menu">
            <summary aria-label="Question actions"><MoreHorizontal size={18} /></summary>
            <div className="menu-popover">
              <button onClick={onEdit}><Pencil size={15} /> Edit question</button>
              {onMove && <button onClick={() => onMove(-1)}><ChevronUp size={15} /> Move up</button>}
              {onMove && <button onClick={() => onMove(1)}><ChevronDown size={15} /> Move down</button>}
              <button onClick={() => setSharing(true)}><Share2 size={15} /> Share</button>
              <button className="danger-text" onClick={onDelete}><Trash2 size={15} /> Delete</button>
            </div>
          </details>
        </div>}
      </div>
      {expanded && <div className="answer-content">{imageError && <p className="image-error" role="status">An image could not be loaded. Its share link may have expired.</p>}<div dangerouslySetInnerHTML={{ __html: answer || '<p class="muted">No answer added yet.</p>' }} /></div>}
      {sharing && <ShareDialog scopeType={'question' satisfies ShareScope} scopeId={question.id} title="question" onClose={() => setSharing(false)} />}
    </article>
  )
}
