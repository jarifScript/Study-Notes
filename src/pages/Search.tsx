import { useEffect, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { client, friendlyError } from '../lib/data'
import type { AppLanguage, QuestionType } from '../types/database'
import { useToast } from '../components/Toast'

interface SearchResult {
  id: string
  type: QuestionType
  question: string
  answer: string
  chapter_id: string
  chapters: { name: string; subject_id: string; subjects: { id: string; name: string; semester_id: string; semesters: { name: string } | null } | null } | null
}

export function SearchPage() {
  const { language } = useOutletContext<{ language: AppLanguage }>()
  const [params] = useSearchParams()
  const term = params.get('q')?.trim() ?? ''
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const notify = useToast()

  useEffect(() => {
    if (!term) {
      setResults([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    async function search() {
      const select = 'id, type, question, answer, chapter_id, chapters(id, name, subject_id, subjects(id, name, semester_id, semesters(name)))'
      const [questionMatches, answerMatches] = await Promise.all([
        client().from('questions').select(select).ilike('question', `%${term}%`).limit(100),
        client().from('questions').select(select).ilike('answer', `%${term}%`).limit(100),
      ])
      const error = questionMatches.error ?? answerMatches.error
      if (error) throw error
      const combined = new Map<string, SearchResult>()
      for (const item of [...questionMatches.data ?? [], ...answerMatches.data ?? []]) combined.set(item.id as string, item as unknown as SearchResult)
      if (active) setResults([...combined.values()])
    }
    void search().catch((error: unknown) => { if (active) notify(friendlyError(error), 'error') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [notify, term])

  return <main className="page-content search-content">
    <div className="page-heading"><div><span className="eyebrow">{language === 'bn' ? 'আপনার লাইব্রেরি' : 'YOUR LIBRARY'}</span><h1>Search notes</h1><p className="muted">{term ? `Results for “${term}”` : 'Search across your questions and answers.'}</p></div></div>
    {!term ? <section className="empty-state"><div className="empty-icon"><SearchIcon size={21} /></div><h2>Start searching</h2><p>Type in the search box above to find questions and answers.</p></section> : loading ? <div className="loading-panel" /> : results.length === 0 ? <section className="empty-state"><h2>No matches found</h2><p>Try another word or phrase.</p></section> : (
      <div className="search-results">{results.map((result) => {
        const subject = result.chapters?.subjects
        const semester = subject?.semesters
        return <Link className="search-result" key={result.id} to={`/subject/${subject?.id ?? ''}?chapter=${result.chapter_id}`}>
          <span className="eyebrow">{semester?.name ?? (language === 'bn' ? 'সেমিস্টার' : 'Semester')} / {subject?.name ?? (language === 'bn' ? 'বিষয়' : 'Subject')} / {result.chapters?.name ?? 'Chapter'}</span>
          <h2>{result.question}</h2><p>{result.answer.replace(/<[^>]*>/g, ' ').slice(0, 240)}</p>
        </Link>
      })}</div>
    )}
  </main>
}
