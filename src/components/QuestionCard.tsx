import DOMPurify from 'dompurify'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, MoreHorizontal, Pencil, Share2, Trash2 } from 'lucide-react'
import type { Question, ShareScope } from '../types/database'
import { client, friendlyError } from '../lib/data'
import { ShareDialog } from './ShareDialog'
import { useToast } from './Toast'

export function QuestionCard({ question, onEdit, onDelete, onMove, readOnly = false, shareImage }: {
  question: Pick<Question, 'id' | 'type' | 'question' | 'answer' | 'position'>
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
      const paths = [...html.matchAll(/storage:\/\/([^"]+)/g)].map((match) => match[1])
      for (const path of paths) {
        try {
          const url = shareImage
            ? await shareImage(path)
            : await client().storage.from('question-images').createSignedUrl(path, 3600).then(({ data, error }) => {
              if (error) throw error
              return data.signedUrl
            })
          if (url) html = html.replaceAll(`storage://${path}`, url)
        } catch (error) {
          if (active) setImageError(true)
          if (readOnly) console.error('Could not load shared question image:', error)
          else notify(friendlyError(error), 'error')
        }
      }
      if (active) setAnswer(DOMPurify.sanitize(html, { ADD_ATTR: ['target'], ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|storage:\/\/)/i }))
    }
    void resolveImages()
    return () => { active = false }
  }, [notify, question.answer, readOnly, shareImage])

  const typeLabel = question.type === 'very_short' ? 'Very Short' : question.type === 'short' ? 'Short' : 'Long'

  return (
    <article className="question-card" id={`question-${question.id}`}>
      <div className="question-card-heading">
        <button className="question-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          <span className="question-number">{typeLabel}</span>
          <span className="question-title">{question.question}</span>
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
