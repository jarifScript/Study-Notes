import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Menu, MoreHorizontal, Plus, Pencil, Share2, Trash2, X } from 'lucide-react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { client, friendlyError, listImagePaths, listSemesters, listSubjects, removeImageFiles } from '../lib/data'
import type { AppLanguage, Semester, Subject } from '../types/database'
import { useToast } from '../components/Toast'
import { NameDialog } from '../components/NameDialog'
import { ShareDialog } from '../components/ShareDialog'
import type { ShareScope } from '../types/database'

type Dialog = { title: string; placeholder: string; initialValue?: string; save: (name: string) => Promise<void> } | null

export function ManageHome() {
  const { language } = useOutletContext<{ language: AppLanguage }>()
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('semester') ?? ''
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [sharing, setSharing] = useState<Semester | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const notify = useToast()

  const refreshSemesters = useCallback(async () => {
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

  useEffect(() => { void refreshSemesters() }, [refreshSemesters])

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
      return
    }
    let active = true
    listSubjects(selectedId).then((rows) => { if (active) setSubjects(rows) }).catch((error: unknown) => {
      if (active) notify(friendlyError(error), 'error')
    })
    return () => { active = false }
  }, [selectedId, notify])

  async function saveSemester(name: string, existing?: Semester) {
    const table = client().from('semesters')
    const result = existing
      ? await table.update({ name }).eq('id', existing.id)
      : await table.insert({ name, position: semesters.length })
    if (result.error) throw result.error
    await refreshSemesters()
    notify(existing ? 'Semester renamed.' : 'Semester added.')
  }

  async function deleteSemester(semester: Semester) {
    if (!window.confirm(`Delete "${semester.name}" and all of its subjects, chapters, and questions? This cannot be undone.`)) return
    try {
      const imagePaths = await listImagePaths('semester', semester.id)
      const { error } = await client().from('semesters').delete().eq('id', semester.id)
      if (error) throw error
      notify('Semester deleted.')
      try { await removeImageFiles(imagePaths) } catch (error) {
        console.error('Semester deleted but image cleanup failed:', error)
        notify('Semester deleted, but some private images could not be removed.', 'error')
      }
      await refreshSemesters()
    } catch (error) {
      notify(friendlyError(error), 'error')
    }
  }

  async function saveSubject(name: string, existing?: Subject) {
    const result = existing
      ? await client().from('subjects').update({ name }).eq('id', existing.id)
      : await client().from('subjects').insert({ name, semester_id: selectedId, position: subjects.length })
    if (result.error) throw result.error
    setSubjects(await listSubjects(selectedId))
    notify(existing ? 'Subject renamed.' : 'Subject added.')
  }

  async function deleteSubject(subject: Subject) {
    if (!window.confirm(`Delete "${subject.name}" and all of its chapters and questions? This cannot be undone.`)) return
    try {
      const imagePaths = await listImagePaths('subject', subject.id)
      const { error } = await client().from('subjects').delete().eq('id', subject.id)
      if (error) throw error
      try { await removeImageFiles(imagePaths) } catch (error) {
        console.error('Subject deleted but image cleanup failed:', error)
        notify('Subject deleted, but some private images could not be removed.', 'error')
      }
      setSubjects(await listSubjects(selectedId))
      notify('Subject deleted.')
    } catch (error) {
      notify(friendlyError(error), 'error')
    }
  }

  const selectedSemester = semesters.find((item) => item.id === selectedId)

  return (
    <div className="workspace">
      <aside className={`side-panel semester-panel ${drawerOpen ? 'drawer-open' : ''}`}>
        <div className="panel-heading"><div><span className="eyebrow">{language === 'bn' ? 'আপনার লাইব্রেরি' : 'YOUR LIBRARY'}</span><h2>{language === 'bn' ? 'সেমিস্টার' : 'Semesters'}</h2></div><button className="icon-button mobile-close" onClick={() => setDrawerOpen(false)} aria-label="Close semesters"><X size={18} /></button></div>
        <nav className="semester-list" aria-label={language === 'bn' ? 'সেমিস্টার' : 'Semesters'}>
          {semesters.map((semester) => (
            <div className={`semester-row ${semester.id === selectedId ? 'selected' : ''}`} key={semester.id}>
              <button className="semester-select" onClick={() => { setSearchParams({ semester: semester.id }); setDrawerOpen(false) }}>{semester.name}</button>
              <details className="row-menu">
                <summary aria-label={`Actions for ${semester.name}`}><MoreHorizontal size={18} /></summary>
                <div className="menu-popover">
                  <button onClick={() => setDialog({ title: 'Rename semester', placeholder: 'Semester name', initialValue: semester.name, save: (name) => saveSemester(name, semester) })}><Pencil size={15} /> Rename</button>
                  <button className="danger-text" onClick={() => void deleteSemester(semester)}><Trash2 size={15} /> Delete</button>
                </div>
              </details>
            </div>
          ))}
        </nav>
        <button className="button add-side-button" onClick={() => setDialog({ title: 'Add semester', placeholder: 'e.g. Semester 1', save: (name) => saveSemester(name) })}><Plus size={17} /> Add Semester</button>
      </aside>
      {drawerOpen && <button className="drawer-scrim" aria-label="Close semester menu" onClick={() => setDrawerOpen(false)} />}
      <main className="page-content">
        {loading ? <div className="skeleton-grid">{[1, 2, 3].map((item) => <div className="skeleton-card" key={item} />)}</div> : semesters.length === 0 ? (
          <section className="empty-state large-empty">
            <div className="empty-icon"><BookOpen size={22} /></div><span className="eyebrow">A FRESH START</span>
            <h1>No semesters yet</h1><p>Add your first semester to start organising your study notes.</p>
            <button className="button primary" onClick={() => setDialog({ title: 'Add semester', placeholder: 'e.g. Semester 1', save: (name) => saveSemester(name) })}><Plus size={17} /> Add your first semester</button>
          </section>
        ) : (
          <>
            <div className="page-heading">
              <div className="page-title-row"><button className="icon-button library-menu-button" onClick={() => setDrawerOpen(true)} aria-label="Open semesters"><Menu size={19} /></button><div><h1>{selectedSemester?.name ?? 'Your subjects'}</h1><p className="muted">{subjects.length} {language === 'bn' ? 'বিষয়' : subjects.length === 1 ? 'subject' : 'subjects'}</p></div></div>
              {selectedSemester && <div className="heading-actions"><button className="button outline-button" onClick={() => setSharing(selectedSemester)} aria-label="Share semester"><Share2 size={17} /> Share</button></div>}
            </div>
            {subjects.length === 0 ? (
              <section className="empty-state">
                <div className="empty-icon"><BookOpen size={21} /></div><h2>No subjects yet</h2><p>Add your first subject to this semester.</p>
                <button className="button primary" onClick={() => setDialog({ title: 'Add subject', placeholder: 'e.g. Physics', save: (name) => saveSubject(name) })}><Plus size={17} /> Add Subject</button>
              </section>
            ) : (
              <div className="subject-grid">
                {subjects.map((subject) => (
                  <article className="subject-card" key={subject.id}>
                    <Link to={`/manage/subject/${subject.id}`} className="subject-card-link">
                      <span className="subject-icon"><BookOpen size={21} /></span><h2>{subject.name}</h2><span className="muted">Open subject <span aria-hidden="true">→</span></span>
                    </Link>
                    <details className="row-menu card-menu">
                      <summary aria-label={`Actions for ${subject.name}`}><MoreHorizontal size={18} /></summary>
                      <div className="menu-popover">
                        <button onClick={() => setDialog({ title: 'Rename subject', placeholder: 'Subject name', initialValue: subject.name, save: (name) => saveSubject(name, subject) })}><Pencil size={15} /> Rename</button>
                        <button className="danger-text" onClick={() => void deleteSubject(subject)}><Trash2 size={15} /> Delete</button>
                      </div>
                    </details>
                  </article>
                ))}
                <button className="add-subject-card" onClick={() => setDialog({ title: 'Add subject', placeholder: 'e.g. Physics', save: (name) => saveSubject(name) })}><span><Plus size={19} /></span>Add Subject</button>
              </div>
            )}
          </>
        )}
      </main>
      {dialog && <NameDialog title={dialog.title} placeholder={dialog.placeholder} initialValue={dialog.initialValue} onSave={dialog.save} onClose={() => setDialog(null)} />}
      {sharing && <ShareDialog scopeType={'semester' satisfies ShareScope} scopeId={sharing.id} title="semester" onClose={() => setSharing(null)} />}
    </div>
  )
}
