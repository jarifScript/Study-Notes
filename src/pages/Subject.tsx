import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, Menu, MoreHorizontal, Pencil, Plus, Share2, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { client, friendlyError, listChapters, listImagePaths, listQuestions, questionTypes, removeImageFiles } from '../lib/data'
import type { AppLanguage, Chapter, Question, QuestionType, ShareScope, Subject as SubjectRow } from '../types/database'
import { NameDialog } from '../components/NameDialog'
import { QuestionCard } from '../components/QuestionCard'
import { QuestionForm } from '../components/QuestionForm'
import { ShareDialog } from '../components/ShareDialog'
import { useToast } from '../components/Toast'

type Dialog = { title: string; placeholder: string; initialValue?: string; save: (name: string) => Promise<void> } | null

export function SubjectPage({ manage = false }: { manage?: boolean }) {
  const { language } = useOutletContext<{ language: AppLanguage }>()
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [subject, setSubject] = useState<SubjectRow | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [questionForm, setQuestionForm] = useState<{ initialType: QuestionType; question?: Question } | null>(null)
  const [sharing, setSharing] = useState<{ scopeType: ShareScope; scopeId: string; title: string } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [chapterSidebarCollapsed, setChapterSidebarCollapsed] = useState(false)
  const [activeType, setActiveType] = useState<QuestionType>('very_short')
  const navigationTarget = useRef<QuestionType | null>(null)
  const notify = useToast()
  const chapterId = params.get('chapter') ?? ''

  const refresh = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [{ data: subjectData, error: subjectError }, chapterRows] = await Promise.all([
        client().from('subjects').select('*').eq('id', id).single(),
        listChapters(id),
      ])
      if (subjectError) throw subjectError
      setSubject(subjectData as SubjectRow)
      setChapters(chapterRows)
      setQuestions([])
    } catch (error) {
      notify(friendlyError(error), 'error')
      setSubject(null)
    } finally {
      setLoading(false)
    }
  }, [id, notify])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (loading || !subject) return
    const validChapter = chapters.some((chapter) => chapter.id === chapterId)
    if (validChapter) return
    const first = chapters[0]?.id
    setQuestions([])
    setParams(first ? { chapter: first } : {}, { replace: true })
  }, [chapterId, chapters, loading, setParams, subject])

  useEffect(() => {
    if (loading || !chapterId || !chapters.some((chapter) => chapter.id === chapterId)) {
      setQuestions([])
      setLoadingQuestions(false)
      return
    }
    let active = true
    setQuestions([])
    setLoadingQuestions(true)
    listQuestions(chapterId).then((rows) => {
      if (active) setQuestions(rows)
    }).catch((error: unknown) => {
      if (active) notify(friendlyError(error), 'error')
    }).finally(() => {
      if (active) setLoadingQuestions(false)
    })
    return () => { active = false }
  }, [chapterId, chapters, loading, notify])

  useEffect(() => {
    navigationTarget.current = null
    const targets = questionTypes.map((type) => document.getElementById(`section-${type.id}`)).filter((element): element is HTMLElement => Boolean(element))
    if (!targets.length) return
    const observer = new IntersectionObserver((entries) => {
      if (navigationTarget.current) {
        const target = entries.find((entry) => entry.target.id === `section-${navigationTarget.current}` && entry.isIntersecting)
        if (target) {
          setActiveType(navigationTarget.current)
          navigationTarget.current = null
        }
        return
      }
      const activeLine = window.innerHeight * 0.23
      const sections = targets.map((target) => ({ target, bounds: target.getBoundingClientRect() }))
      const current = sections.find(({ bounds }) => bounds.top <= activeLine && bounds.bottom > activeLine)
      const nearest = current ?? sections.sort((a, b) =>
        Math.abs(a.bounds.top - activeLine) - Math.abs(b.bounds.top - activeLine),
      )[0]
      if (nearest) setActiveType(nearest.target.id.replace('section-', '') as QuestionType)
    }, { rootMargin: '-18% 0px -72% 0px' })
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [chapterId, questions.length])

  useEffect(() => {
    const targetId = (location.state as { scrollToQuestionId?: string } | null)?.scrollToQuestionId
    if (!targetId || loadingQuestions) return
    let cancelled = false
    let frame = 0
    void waitForQuestionImages().then(() => {
      if (cancelled) return
      frame = requestAnimationFrame(() => {
        if (cancelled) return
        document.getElementById(`question-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [loadingQuestions, location.pathname, location.search, location.state, navigate, questions.length])

  useLayoutEffect(() => {
    if (!location.hash.startsWith('#question-')) return
    window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}`)
    window.scrollTo(0, 0)
  }, [location.hash, location.pathname, location.search])

  async function saveChapter(name: string, existing?: Chapter) {
    const result = existing
      ? await client().from('chapters').update({ name }).eq('id', existing.id)
      : await client().from('chapters').insert({ name, subject_id: id, position: chapters.length })
    if (result.error) throw result.error
    const rows = await listChapters(id)
    setChapters(rows)
    if (!existing && rows.length) setParams({ chapter: rows[rows.length - 1].id })
    notify(existing ? 'Chapter renamed.' : 'Chapter added.')
  }

  async function deleteChapter(chapter: Chapter) {
    if (!window.confirm(`Delete "${chapter.name}" and all its questions and answers? This cannot be undone.`)) return
    try {
      const imagePaths = await listImagePaths('chapter', chapter.id)
      const { error } = await client().from('chapters').delete().eq('id', chapter.id)
      if (error) throw error
      try { await removeImageFiles(imagePaths) } catch (error) {
        console.error('Chapter deleted but image cleanup failed:', error)
        notify('Chapter deleted, but some private images could not be removed.', 'error')
      }
      const rows = await listChapters(id)
      setChapters(rows)
      setParams(rows[0] ? { chapter: rows[0].id } : {}, { replace: true })
      notify('Chapter deleted.')
    } catch (error) {
      notify(friendlyError(error), 'error')
    }
  }

  async function moveChapter(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= chapters.length) return
    const ordered = [...chapters]
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    const updates = await Promise.all(ordered.map((chapter, position) => client().from('chapters').update({ position }).eq('id', chapter.id)))
    const failed = updates.find((result) => result.error)
    if (failed?.error) notify(friendlyError(failed.error), 'error')
    else setChapters(ordered.map((chapter, position) => ({ ...chapter, position })))
  }

  async function deleteQuestion(question: Question) {
    if (!window.confirm('Delete this question and its answer? This cannot be undone.')) return
    try {
      const { data: images, error: imageError } = await client().from('question_images').select('storage_path').eq('question_id', question.id)
      if (imageError) throw imageError
      if (images?.length) {
        const { error: storageError } = await client().storage.from('question-images').remove(images.map((image) => image.storage_path))
        if (storageError) throw storageError
      }
      const { error } = await client().from('questions').delete().eq('id', question.id)
      if (error) throw error
      setQuestions(await listQuestions(chapterId))
      notify('Question deleted.')
    } catch (error) {
      notify(friendlyError(error), 'error')
    }
  }

  async function moveQuestion(question: Question, direction: -1 | 1) {
    const peers = questions.filter((item) => item.type === question.type).sort((a, b) => a.position - b.position)
    const index = peers.findIndex((item) => item.id === question.id)
    const other = peers[index + direction]
    if (!other) return
    const [first, second] = await Promise.all([
      client().from('questions').update({ position: other.position }).eq('id', question.id),
      client().from('questions').update({ position: question.position }).eq('id', other.id),
    ])
    if (first.error || second.error) notify(friendlyError(first.error ?? second.error), 'error')
    else setQuestions(await listQuestions(chapterId))
  }

  const grouped = useMemo(() => Object.fromEntries(questionTypes.map(({ id: type }) => [
    type, questions.filter((question) => question.type === type).sort((a, b) => a.position - b.position),
  ])) as Record<QuestionType, Question[]>, [questions])
  const questionNumbers = useMemo(() => new Map(
    questionTypes.flatMap(({ id: type }) => grouped[type].map((question, index) => [question.id, index + 1] as const)),
  ), [grouped])
  const activeChapter = chapters.find((chapter) => chapter.id === chapterId)

  return (
    <div className={`workspace subject-workspace ${chapterSidebarCollapsed ? 'chapter-sidebar-collapsed' : ''}`}>
      <aside className={`side-panel chapter-panel ${drawerOpen ? 'drawer-open' : ''}`}>
        <div className="chapter-sidebar-top"><Link to={`${manage ? '/manage' : '/'}${subject ? `?semester=${encodeURIComponent(subject.semester_id)}` : ''}`} className="back-link"><ArrowLeft size={16} /> {manage ? (language === 'bn' ? 'ম্যানেজ' : 'Manage') : (language === 'bn' ? 'লাইব্রেরি' : 'Library')}</Link><button className="icon-button mobile-close" onClick={() => setDrawerOpen(false)} aria-label="Close chapters"><XIcon /></button></div>
        <div className="panel-heading"><div><span className="eyebrow">{manage ? (language === 'bn' ? 'ম্যানেজ বিষয়' : 'MANAGE SUBJECT') : (language === 'bn' ? 'বিষয়' : 'SUBJECT')}</span><h2>{subject?.name ?? 'Chapters'}</h2></div>{manage && <button className="icon-button" onClick={() => setSharing({ scopeType: 'subject', scopeId: id, title: 'subject' })} aria-label="Share subject" title="Share subject"><Share2 size={17} /></button>}</div>
        <nav className="chapter-list" aria-label="Chapters">
          {chapters.map((chapter, index) => (
            <div className={`chapter-row ${chapter.id === chapterId ? 'selected' : ''}`} key={chapter.id}>
              <button className="chapter-select" onClick={() => { setParams({ chapter: chapter.id }); setDrawerOpen(false) }}><span className="chapter-serial">{String(index + 1).padStart(2, '0')}</span><span className="chapter-name">{chapter.name}</span></button>
              {manage && <details className="row-menu">
                <summary aria-label={`Actions for ${chapter.name}`}><MoreHorizontal size={17} /></summary>
                <div className="menu-popover">
                  <button disabled={index === 0} onClick={() => void moveChapter(index, -1)}><ChevronUp size={15} /> Move up</button>
                  <button disabled={index === chapters.length - 1} onClick={() => void moveChapter(index, 1)}><ChevronDown size={15} /> Move down</button>
                  <button onClick={() => setDialog({ title: 'Rename chapter', placeholder: 'Chapter name', initialValue: chapter.name, save: (name) => saveChapter(name, chapter) })}><Pencil size={15} /> Rename</button>
                  <button className="danger-text" onClick={() => void deleteChapter(chapter)}><Trash2 size={15} /> Delete</button>
                </div>
              </details>}
            </div>
          ))}
        </nav>
        {manage && <button className="button add-side-button" onClick={() => setDialog({ title: 'Add chapter', placeholder: 'e.g. Introduction', save: (name) => saveChapter(name) })}><Plus size={17} /> Add Chapter</button>}
      </aside>
      {drawerOpen && <button className="drawer-scrim" aria-label="Close chapter menu" onClick={() => setDrawerOpen(false)} />}
      <main className="page-content subject-content">
        {loading ? <div className="loading-panel" /> : !subject ? <section className="empty-state"><h2>Subject unavailable</h2><Link to="/">Return home</Link></section> : !activeChapter ? (
          <section className="empty-state large-empty"><div className="empty-icon"><BookOpenIcon /></div><span className="eyebrow">{subject.name.toUpperCase()}</span><h1>No chapters yet</h1><p>{manage ? 'Add your first chapter. Its question sections are ready automatically.' : 'There are no chapters in this subject yet.'}</p>{manage && <button className="button primary" onClick={() => setDialog({ title: 'Add chapter', placeholder: 'e.g. Introduction', save: (name) => saveChapter(name) })}><Plus size={17} /> Add Chapter</button>}</section>
        ) : (
          <>
            <header className="chapter-subheader">
              <button className="icon-button mobile-menu-button" onClick={() => {
                if (window.matchMedia('(max-width: 980px)').matches) setDrawerOpen(true)
                else setChapterSidebarCollapsed((collapsed) => !collapsed)
              }} aria-label={chapterSidebarCollapsed ? 'Show chapters' : 'Toggle chapter navigation'} title={chapterSidebarCollapsed ? 'Show chapters' : 'Toggle chapter navigation'}><Menu size={20} /></button>
              <div className="chapter-title-context"><span>{subject.name}</span><span className="chapter-title-divider" aria-hidden="true">/</span><h1>{activeChapter.name}</h1></div>
              {manage && <button className="icon-button chapter-share-button" aria-label="Share chapter" title="Share chapter" onClick={() => setSharing({ scopeType: 'chapter', scopeId: activeChapter.id, title: 'chapter' })}><Share2 size={18} /></button>}
            </header>
            <div className="chapter-details-row">
              <p className="chapter-question-count">{questions.length} {language === 'bn' ? 'প্রশ্ন' : questions.length === 1 ? 'question' : 'questions'}</p>
              <nav className="quick-nav" aria-label="Jump to question section">
                {questionTypes.map((item) => <a key={item.id} className={activeType === item.id ? 'active' : ''} href={`#section-${item.id}`} onClick={(event) => {
                  event.preventDefault()
                  setActiveType(item.id)
                  const target = document.getElementById(`section-${item.id}`)
                  const targetBounds = target?.getBoundingClientRect()
                  const isInActiveBand = targetBounds && targetBounds.top < window.innerHeight * 0.28 && targetBounds.bottom > window.innerHeight * 0.18
                  navigationTarget.current = isInActiveBand ? null : item.id
                  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}>{language === 'bn' ? item.banglaTitle : item.title}</a>)}
              </nav>
            </div>
            <div className="question-sections">
              {questionTypes.map((type) => (
                <section className="question-section" id={`section-${type.id}`} key={type.id}>
                  <div className="section-heading"><div><span className="eyebrow">{language === 'bn' ? 'প্রশ্নের ধরণ' : 'QUESTION TYPE'}</span><h2>{language === 'bn' ? type.banglaQuestionTitle : type.questionTitle} <span className="count-badge">{grouped[type.id].length}</span></h2></div>{manage && <button className="button outline-button" onClick={() => setQuestionForm({ initialType: type.id })}><Plus size={16} /> Add Question</button>}</div>
                  {loadingQuestions ? <div className="section-empty section-loading">Loading questions…</div> : grouped[type.id].length ? <div className="question-list">{grouped[type.id].map((question) => <QuestionCard key={question.id} question={question} serialNumber={questionNumbers.get(question.id)} readOnly={!manage} onEdit={manage ? () => setQuestionForm({ initialType: type.id, question }) : undefined} onDelete={manage ? () => void deleteQuestion(question) : undefined} onMove={manage ? (direction) => void moveQuestion(question, direction) : undefined} />)}</div> : <div className="section-empty">{manage ? `No ${type.title.toLowerCase()} questions yet.` : `No ${type.title.toLowerCase()} questions in this chapter.`}</div>}
                </section>
              ))}
            </div>
          </>
        )}
      </main>
      {dialog && <NameDialog title={dialog.title} placeholder={dialog.placeholder} initialValue={dialog.initialValue} onSave={dialog.save} onClose={() => setDialog(null)} />}
      {questionForm && <QuestionForm chapterId={chapterId} initial={questionForm.question} initialType={questionForm.initialType} language={language} onClose={() => setQuestionForm(null)} onSaved={async () => { setQuestions(await listQuestions(chapterId)); notify('Question saved.') }} />}
      {sharing && <ShareDialog scopeType={sharing.scopeType} scopeId={sharing.scopeId} title={sharing.title} onClose={() => setSharing(null)} />}
    </div>
  )
}

function XIcon() { return <span aria-hidden="true">×</span> }
function BookOpenIcon() { return <span aria-hidden="true">✳</span> }

function waitForQuestionImages() {
  const images = [...document.querySelectorAll<HTMLImageElement>('.question-card img')]
  return Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(finish, 3000)
      function finish() {
        window.clearTimeout(timer)
        image.removeEventListener('load', finish)
        image.removeEventListener('error', finish)
        resolve()
      }
      image.addEventListener('load', finish, { once: true })
      image.addEventListener('error', finish, { once: true })
    })
  }))
}
