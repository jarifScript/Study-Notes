import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BookOpen, LockKeyhole } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { questionTypes } from '../lib/data'
import { QuestionCard } from '../components/QuestionCard'
import type { SharedChapter, SharedPayload, SharedSubject } from '../types/shared'

function SharedQuestions({ chapter, shareImage }: { chapter: SharedChapter; shareImage: (path: string) => Promise<string> }) {
  return <section className="shared-chapter">
    <h2>{chapter.name}</h2>
    {chapter.questions.length ? questionTypes.map((type) => {
      const questions = chapter.questions.filter((question) => question.type === type.id).sort((a, b) => a.position - b.position)
      return questions.length ? <section className="shared-question-group" key={type.id}>
        <h3>{type.title} Questions</h3>
        {questions.map((question) => <QuestionCard key={question.id} question={question} readOnly shareImage={shareImage} />)}
      </section> : null
    }) : <p className="muted">No questions in this chapter yet.</p>}
  </section>
}

function SharedSubject({ subject, shareImage }: { subject: SharedSubject; shareImage: (path: string) => Promise<string> }) {
  return <section className="shared-subject">
    <h2>{subject.name}</h2>
    {subject.chapters.map((chapter) => <SharedQuestions key={chapter.id} chapter={chapter} shareImage={shareImage} />)}
  </section>
}

export function SharedView() {
  const { token = '' } = useParams()
  const [payload, setPayload] = useState<SharedPayload | null>(null)
  const imageUrls = useRef<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadError(false)
      setAvailable(false)
      setPayload(null)
      if (!supabase) {
        setLoading(false)
        return
      }
      try {
        const { data, error } = await supabase.rpc('get_shared_content', { share_token: token })
        if (!active) return
        if (error) {
          console.error('Could not load shared content:', error.message)
          setLoadError(true)
        }
        const result = data as SharedPayload | null
        if (!error && result) {
          setPayload(result)
          setAvailable(true)
        }
      } catch (error) {
        console.error('Could not load shared content:', error)
        if (active) setLoadError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [attempt, token])

  const shareImage = useCallback(async (path: string) => {
    const cached = imageUrls.current[path]
    if (cached) return cached
    if (!supabase) throw new Error('Image service is unavailable.')
    const { data, error } = await supabase.functions.invoke('shared-image', { body: { token, path } })
    if (error) throw error
    const url = (data as { signedUrl?: string } | null)?.signedUrl
    if (!url) throw new Error('Image link unavailable.')
    imageUrls.current[path] = url
    return url
  }, [token])

  if (loading) return <main className="shared-shell"><div className="loading-panel" aria-label="Loading shared notes" /></main>
  if (loadError) return <main className="shared-shell"><section className="link-unavailable"><span className="empty-icon"><LockKeyhole size={22} /></span><h1>Couldn’t check this link</h1><p>We couldn’t reach the notes service. Check your connection and try again.</p><button className="button outline-button" onClick={() => { setLoadError(false); setLoading(true); setAttempt((value) => value + 1) }}>Try again</button></section></main>
  if (!available || !payload) return <main className="shared-shell"><section className="link-unavailable"><span className="empty-icon"><LockKeyhole size={22} /></span><h1>Link not available</h1><p>This link may have expired, been revoked, or no longer exist.</p></section></main>

  const heading = payload.semester?.name ?? payload.subject?.name ?? payload.chapter?.name ?? payload.question?.question ?? 'Shared notes'

  return (
    <main className="shared-shell">
      <header className="shared-brand"><div><BookOpen size={19} /> Study<span>Notes</span></div><span className="read-only-tag">Read only</span></header>
      <article className="shared-document">
        <span className="eyebrow">SHARED STUDY NOTES</span>
        <h1>{heading}</h1>
        {payload.semester && <div className="shared-content">{payload.semester.subjects.map((subject) => <SharedSubject key={subject.id} subject={subject} shareImage={shareImage} />)}</div>}
        {payload.subject && <div className="shared-content"><SharedSubject subject={payload.subject} shareImage={shareImage} /></div>}
        {payload.chapter && <div className="shared-content"><SharedQuestions chapter={payload.chapter} shareImage={shareImage} /></div>}
        {payload.question && <div className="shared-content">
          <p className="shared-breadcrumb">{payload.question.chapter.subject.semester.name} / {payload.question.chapter.subject.name} / {payload.question.chapter.name}</p>
          <QuestionCard question={payload.question} readOnly shareImage={shareImage} />
        </div>}
        <footer className="shared-footer"><LockKeyhole size={15} /> This private link shows only the content its owner shared.</footer>
      </article>
    </main>
  )
}
