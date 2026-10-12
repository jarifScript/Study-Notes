import { useCallback, useEffect, useState } from 'react'
import { BookOpen, ChevronRight, LibraryBig, Menu, PanelLeftClose, PanelLeftOpen, Settings2, X } from 'lucide-react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { friendlyError, listSemesters, listSubjects } from '../lib/data'
import type { AppLanguage, Semester, Subject } from '../types/database'
import { useToast } from '../components/Toast'

export function Home() {
  const { language } = useOutletContext<{ language: AppLanguage }>()
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('semester') ?? ''
  const [loading, setLoading] = useState(true)
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 700px)').matches)
  const notify = useToast()

  const refresh = useCallback(async () => {
    try {
      const rows = await listSemesters()
      setSemesters(rows)
      if (!rows.length) setSubjects([])
    } catch (error) {
      notify(friendlyError(error), 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (loading) return
    if (semesters.length && !semesters.some((semester) => semester.id === selectedId)) {
      setSearchParams({ semester: semesters[0].id }, { replace: true })
    } else if (!semesters.length && selectedId) {
      setSearchParams({}, { replace: true })
    }
  }, [loading, selectedId, semesters, setSearchParams])

  useEffect(() => {
    if (!selectedId) {
      setSubjects([])
      setLoadingSubjects(false)
      return
    }
    let active = true
    setSubjects([])
    setLoadingSubjects(true)
    listSubjects(selectedId).then((rows) => {
      if (active) setSubjects(rows)
    }).catch((error: unknown) => {
      if (active) notify(friendlyError(error), 'error')
    }).finally(() => {
      if (active) setLoadingSubjects(false)
    })
    return () => { active = false }
  }, [selectedId, notify])

  const selectedSemester = semesters.find((semester) => semester.id === selectedId)

  function selectSemester(semesterId: string) {
    setSearchParams({ semester: semesterId })
    if (window.matchMedia('(max-width: 700px)').matches) setSidebarOpen(false)
  }

  return <main className={`browse-workspace ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
    {sidebarOpen && <button className="browse-drawer-scrim" aria-label="Close semester menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={`browse-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Semester navigation">
      <div className="browse-sidebar-heading">
        <div><span className="eyebrow">{language === 'bn' ? 'আপনার লাইব্রেরি' : 'YOUR LIBRARY'}</span><h2>{language === 'bn' ? 'সেমিস্টার' : 'Semesters'}</h2></div>
        <button className="icon-button sidebar-close-mobile" onClick={() => setSidebarOpen(false)} aria-label="Close semester sidebar"><X size={18} /></button>
        <button className="icon-button sidebar-close-wide" onClick={() => setSidebarOpen(false)} aria-label="Close semester sidebar"><PanelLeftClose size={18} /></button>
      </div>
      {loading ? <div className="browse-sidebar-skeleton" aria-label="Loading semesters" /> : semesters.length ? (
        <nav className="browse-semesters" aria-label={language === 'bn' ? 'সেমিস্টার বেছে নিন' : 'Choose a semester'}>
          {semesters.map((semester, index) => <button key={semester.id} className={`browse-semester ${semester.id === selectedId ? 'selected' : ''}`} onClick={() => selectSemester(semester.id)}>
            <span className="semester-index">{String(index + 1).padStart(2, '0')}</span><span>{semester.name}</span><ChevronRight size={16} />
          </button>)}
        </nav>
      ) : <p className="browse-sidebar-empty">Your semesters will appear here.</p>}
      <Link className="browse-manage-link" to="/manage"><Settings2 size={16} /> Manage library</Link>
    </aside>
    <section className="browse-main">
      <header className="browse-main-heading">
        <button className="icon-button sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Close semester sidebar' : 'Open semester sidebar'} title={sidebarOpen ? 'Close semester sidebar' : 'Open semester sidebar'}>
          {sidebarOpen ? <PanelLeftClose size={19} /> : <><Menu size={19} /><PanelLeftOpen className="wide-sidebar-icon" size={18} /></>}
        </button>
        <div><span className="eyebrow">{selectedSemester?.name ?? (language === 'bn' ? 'আপনার লাইব্রেরি' : 'YOUR LIBRARY')}</span><h1>{language === 'bn' ? 'বিষয়' : 'Subjects'}</h1></div>
        {selectedSemester && <span className="browse-count">{subjects.length} {language === 'bn' ? 'বিষয়' : subjects.length === 1 ? 'subject' : 'subjects'}</span>}
      </header>
      {loading ? <div className="browse-subject-grid browse-subject-grid-loading" aria-label="Loading subjects">{[1, 2, 3].map((item) => <div className="browse-subject-skeleton" key={item} />)}</div>
        : semesters.length === 0 ? <section className="browse-empty">
          <span className="browse-icon"><LibraryBig size={24} /></span><h2>Your library is ready</h2>
          <p>There are no study notes here yet. Visit the library manager to add your first semester and begin building your collection.</p>
          <Link className="button primary" to="/manage">Open library manager <ChevronRight size={17} /></Link>
        </section>
        : loadingSubjects ? <div className="browse-subject-grid browse-subject-grid-loading" aria-label="Loading subjects">{[1, 2, 3].map((item) => <div className="browse-subject-skeleton" key={item} />)}</div>
          : subjects.length === 0 ? <section className="browse-empty-subject browse-no-subjects"><BookOpen size={23} /><h2>{language === 'bn' ? 'কোনো সাবজেক্ট নেই' : 'No subjects yet'}</h2><p>{language === 'bn' ? 'এই সেমিস্টারে এখনও কোনো সাবজেক্ট নেই।' : 'There are no subjects in this semester yet.'}</p></section>
            : <div className="browse-subject-grid browse-subject-grid-main">
              {subjects.map((subject) => <Link className="browse-subject" to={`/subject/${subject.id}`} key={subject.id}>
                <span className="browse-subject-icon"><BookOpen size={19} /></span><span className="browse-subject-name">{subject.name}</span><ChevronRight size={17} />
              </Link>)}
            </div>}
    </section>
  </main>
}
