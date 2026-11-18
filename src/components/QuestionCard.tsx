import DOMPurify from 'dompurify'
import { useEffect, useRef, useState } from 'react'
import { common, createLowlight } from 'lowlight'
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

const codeLowlight = createLowlight(common)

interface HighlightNode {
  type: 'root' | 'text' | 'element'
  value?: string
  tagName?: string
  properties?: { className?: string[] }
  children?: HighlightNode[]
}

function appendHighlightNodes(parent: HTMLElement, nodes: HighlightNode[]) {
  for (const node of nodes) {
    if (node.type === 'text') {
      parent.append(document.createTextNode(node.value ?? ''))
      continue
    }
    if (node.type === 'element') {
      const element = document.createElement(node.tagName || 'span')
      if (node.properties?.className?.length) element.className = node.properties.className.join(' ')
      appendHighlightNodes(element, node.children ?? [])
      parent.append(element)
    }
  }
}

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
  const cardRef = useRef<HTMLElement>(null)
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
        ADD_ATTR: ['target', 'data-language'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?:\/\/|mailto:|storage:\/\/).+|data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*)$/i,
      })
      const template = document.createElement('template')
      template.innerHTML = sanitized
      for (const pre of template.content.querySelectorAll<HTMLPreElement>('pre')) {
        if (pre.parentElement?.classList.contains('code-block-shell')) continue
        const code = pre.querySelector('code')
        const rawLanguage = pre.getAttribute('data-language') ||
          code?.getAttribute('data-language') ||
          code?.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1] ||
          'plaintext'
        const language = rawLanguage === 'plaintext' ? 'Plain text' : rawLanguage.toUpperCase()
        pre.setAttribute('data-language', rawLanguage)
        if (code && rawLanguage !== 'plaintext') {
          try {
            const highlighted = codeLowlight.highlight(rawLanguage, code.textContent ?? '') as unknown as HighlightNode
            code.replaceChildren()
            appendHighlightNodes(code, highlighted.children ?? [])
          } catch {
            console.warn(`Could not highlight code language: ${rawLanguage}`)
          }
        }
        const shell = document.createElement('div')
        shell.className = 'code-block-shell'
        const header = document.createElement('div')
        header.className = 'code-block-header'
        const label = document.createElement('span')
        label.className = 'code-block-language'
        label.textContent = language
        const copy = document.createElement('button')
        copy.type = 'button'
        copy.className = 'code-block-copy'
        copy.setAttribute('data-copy-code', '')
        copy.textContent = 'Copy'
        header.append(label, copy)
        shell.append(header)
        pre.parentNode?.insertBefore(shell, pre)
        shell.append(pre)
      }
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

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const buttons = card.querySelectorAll<HTMLButtonElement>('[data-copy-code]')
    const cleanups = [...buttons].map((button) => {
      const handler = async () => {
        const pre = button.closest('.code-block-shell')?.querySelector('pre')
        if (!pre) return
        try {
          await navigator.clipboard.writeText(pre.innerText)
          button.textContent = 'Copied!'
          window.setTimeout(() => { button.textContent = 'Copy' }, 1400)
        } catch {
          button.textContent = 'Could not copy'
          window.setTimeout(() => { button.textContent = 'Copy' }, 1400)
        }
      }
      button.addEventListener('click', handler)
      return () => button.removeEventListener('click', handler)
    })
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [answer])

  return (
    <article ref={cardRef} className="question-card" id={`question-${question.id}`}>
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
