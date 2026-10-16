import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronRight, LogOut, Search, Settings2, Share2 } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { client, friendlyError, getAppLanguage, isMissingAppSettingsTable, updateAppLanguage } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { AppLanguage, QuestionType } from '../types/database'
import { useToast } from './Toast'

type SubjectSuggestion = { kind: 'subject'; id: string; name: string }
type QuestionSuggestion = { kind: 'question'; id: string; type: QuestionType; question: string; answer: string; chapter_id: string }
type SearchSuggestion = SubjectSuggestion | QuestionSuggestion

const LAST_ROUTE_KEY = 'study-notes:last-route'
const LAST_SCROLL_KEY = 'study-notes:last-scroll'

function readLastRoute() {
  try {
    const route = localStorage.getItem(LAST_ROUTE_KEY)
    if (!route || route.startsWith('//') ||
      !/^\/(?:$|[?#]|subject\/|manage(?:\/|[?#]|$)|shares(?:[?#]|$)|search(?:[?#]|$))/.test(route)) return null
    return route
  } catch (error) {
    console.error('Could not restore the last Study Notes page:', error)
    return null
  }
}

export function AppShell() {
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [language, setLanguage] = useState<AppLanguage>('en')
  const [languageLoaded, setLanguageLoaded] = useState(false)
  const [languageAvailable, setLanguageAvailable] = useState(false)
  const [savingLanguage, setSavingLanguage] = useState(false)
  const [signOutConfirmationOpen, setSignOutConfirmationOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const searchBox = useRef<HTMLDivElement>(null)
  const initialRouteChecked = useRef(false)
  const initialPageRestorationPending = useRef(true)
  const restoreTarget = useRef<string | null>(null)
  const currentRoute = useRef('')
  const navigate = useNavigate()
  const location = useLocation()
  const notify = useToast()
  const subjectRoute = location.pathname.match(/^\/(?:manage\/)?subject\/[^/]+/)?.[0] ?? ''
  const manageRoute = location.pathname.startsWith('/manage')
  const chapterId = new URLSearchParams(location.search).get('chapter')

  useEffect(() => {
    const route = `${location.pathname}${location.search}${location.hash}`
    if (!initialRouteChecked.current) {
      initialRouteChecked.current = true
      if (location.pathname === '/') {
        restoreTarget.current = readLastRoute()
      }
    }
    if (restoreTarget.current) {
      if (location.pathname === '/' && route !== restoreTarget.current) {
        navigate(restoreTarget.current, { replace: true })
        return
      }
      restoreTarget.current = null
    }
    const shouldRestoreScroll = initialPageRestorationPending.current
    currentRoute.current = route
    try {
      localStorage.setItem(LAST_ROUTE_KEY, route)
    } catch (error) {
      console.error('Could not save the last Study Notes page:', error)
    }
    if (!shouldRestoreScroll) return

    let savedScroll = 0
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_SCROLL_KEY) ?? 'null') as { route?: unknown; y?: unknown } | null
      if (saved?.route === route && typeof saved.y === 'number' && Number.isFinite(saved.y) && saved.y > 0) {
        savedScroll = saved.y
      }
    } catch (error) {
      console.error('Could not restore the last page position:', error)
    }
    if (!savedScroll) {
      initialPageRestorationPending.current = false
      return
    }

    let attempts = 0
    let timer = 0
    const restore = () => {
      window.scrollTo(0, savedScroll)
      attempts += 1
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      if ((maxScroll >= savedScroll && window.scrollY >= savedScroll) || attempts >= 60) {
        initialPageRestorationPending.current = false
        return
      }
      timer = window.setTimeout(restore, 100)
    }
    timer = window.setTimeout(restore, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [location.hash, location.pathname, location.search, navigate])

  useEffect(() => {
    let timer = 0
    function saveScroll() {
      try {
        localStorage.setItem(LAST_SCROLL_KEY, JSON.stringify({
          route: currentRoute.current,
          y: window.scrollY,
        }))
      } catch (error) {
        console.error('Could not save the last page position:', error)
      }
    }
    function scheduleScrollSave() {
      window.clearTimeout(timer)
      timer = window.setTimeout(saveScroll, 250)
    }
    function saveWhenHidden() {
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(timer)
        saveScroll()
      }
    }
    window.addEventListener('scroll', scheduleScrollSave, { passive: true })
    window.addEventListener('pagehide', saveScroll)
    document.addEventListener('visibilitychange', saveWhenHidden)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', scheduleScrollSave)
      window.removeEventListener('pagehide', saveScroll)
      document.removeEventListener('visibilitychange', saveWhenHidden)
    }
  }, [])

  useEffect(() => {
    let active = true
    void getAppLanguage().then((savedLanguage) => {
      if (active) {
        setLanguage(savedLanguage)
        setLanguageAvailable(true)
      }
    }).catch((error: unknown) => {
      if (!active) return
      if (isMissingAppSettingsTable(error)) {
        setLanguageAvailable(false)
      } else {
        notify(friendlyError(error), 'error')
      }
    }).finally(() => {
      if (active) setLanguageLoaded(true)
    })
    return () => { active = false }
  }, [notify])

  useEffect(() => {
    if (!supabase || !languageAvailable) return
    const database = supabase
    const channel = database.channel('app-settings-language')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings', filter: 'id=eq.true' }, (payload) => {
        const savedLanguage = (payload.new as { language?: unknown }).language
        if (savedLanguage === 'en' || savedLanguage === 'bn') setLanguage(savedLanguage)
        else console.error('Received an invalid app language setting.')
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          notify(error?.message ?? 'Could not sync the language setting across devices.', 'error')
        }
      })
    return () => { void database.removeChannel(channel) }
  }, [languageAvailable, notify])

  async function changeLanguage(nextLanguage: AppLanguage) {
    setSavingLanguage(true)
    try {
      await updateAppLanguage(nextLanguage)
      setLanguage(nextLanguage)
    } catch (error) {
      notify(friendlyError(error), 'error')
    } finally {
      setSavingLanguage(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    setSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        notify(friendlyError(error), 'error')
        return
      }
      setSignOutConfirmationOpen(false)
    } catch (error) {
      notify(friendlyError(error), 'error')
    } finally {
      setSigningOut(false)
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = search.trim()
    if (value) {
      navigate(`/search?q=${encodeURIComponent(value)}`)
      setSuggestionsOpen(false)
    }
  }

  useEffect(() => {
    const term = search.trim()
    if (!term) {
      setSuggestions((current) => current.length ? [] : current)
      setSearching((current) => current ? false : current)
      return
    }
    let active = true
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        if (subjectRoute && chapterId) {
          const select = 'id, type, question, answer, chapter_id'
          const [questionMatches, answerMatches] = await Promise.all([
            client().from('questions').select(select).eq('chapter_id', chapterId).ilike('question', `%${term}%`).order('position').limit(6),
            client().from('questions').select(select).eq('chapter_id', chapterId).ilike('answer', `%${term}%`).order('position').limit(6),
          ])
          const error = questionMatches.error ?? answerMatches.error
          if (error) throw error
          const matches = new Map<string, QuestionSuggestion>()
          for (const row of [...questionMatches.data ?? [], ...answerMatches.data ?? []]) {
            const match = row as unknown as QuestionSuggestion
            matches.set(match.id, match)
          }
          if (active) setSuggestions([...matches.values()].slice(0, 6).map((item) => ({ ...item, kind: 'question' })))
        } else {
          const { data, error } = await client().from('subjects').select('id, name').ilike('name', `%${term}%`).limit(6)
          if (error) throw error
          if (active) setSuggestions((data ?? []).map((subject) => ({ kind: 'subject', id: String(subject.id), name: String(subject.name) })))
        }
      } catch (error) {
        if (active) notify(friendlyError(error), 'error')
      } finally {
        if (active) setSearching(false)
      }
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [chapterId, notify, search, subjectRoute])

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !searchBox.current?.contains(event.target)) setSuggestionsOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  useEffect(() => {
    function closeMenusOutsideTarget(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      document.querySelectorAll<HTMLDetailsElement>('details.row-menu[open]').forEach((menu) => {
        if (!menu.contains(target)) menu.open = false
      })
    }
    function keepOnlyOneMenuOpen(event: Event) {
      const openedMenu = event.target
      if (!(openedMenu instanceof HTMLDetailsElement) || !openedMenu.matches('details.row-menu') || !openedMenu.open) return
      document.querySelectorAll<HTMLDetailsElement>('details.row-menu[open]').forEach((menu) => {
        if (menu !== openedMenu) menu.open = false
      })
    }
    document.addEventListener('pointerdown', closeMenusOutsideTarget)
    document.addEventListener('toggle', keepOnlyOneMenuOpen, true)
    return () => {
      document.removeEventListener('pointerdown', closeMenusOutsideTarget)
      document.removeEventListener('toggle', keepOnlyOneMenuOpen, true)
    }
  }, [])

  function openSuggestion(suggestion: SearchSuggestion) {
    if (suggestion.kind === 'subject') {
      navigate(`/subject/${suggestion.id}`)
    } else if (subjectRoute) {
      navigate(`${subjectRoute}?chapter=${suggestion.chapter_id}`, { state: { scrollToQuestionId: suggestion.id } })
    }
    setSearch('')
    setSuggestions([])
    setSuggestionsOpen(false)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/"><span className="brand-icon"><BookOpen size={19} /></span><span className="brand-name">Study<span>Notes</span></span>{manageRoute && <span className="page-context">{language === 'bn' ? 'ম্যানেজ' : 'MANAGER'}</span>}</Link>
        <div className="topbar-actions">
          <div className="top-search-wrap" ref={searchBox}>
            <form className="top-search" onSubmit={submitSearch} role="search">
              <Search size={16} />
              <input value={search} onFocus={() => setSuggestionsOpen(true)} onChange={(event) => { setSearch(event.target.value); setSuggestions([]); setSearching(Boolean(event.target.value.trim())); setSuggestionsOpen(true) }} onKeyDown={(event) => { if (event.key === 'Escape') setSuggestionsOpen(false) }} placeholder={language === 'bn' ? 'অনুসন্ধান করুন' : 'Search your notes…'} aria-label="Search questions and answers" aria-autocomplete="list" aria-expanded={suggestionsOpen && Boolean(search.trim())} aria-controls="live-search-suggestions" />
            </form>
            {suggestionsOpen && search.trim() &&             <div className="live-search-suggestions" id="live-search-suggestions" role="listbox" aria-label={subjectRoute && chapterId ? 'Matching questions in this chapter' : 'Matching subjects'}>
              {searching ? <p className="search-suggestion-status">Searching…</p> : suggestions.length ? suggestions.map((suggestion) => suggestion.kind === 'subject' ? (
                <button className="search-suggestion" type="button" role="option" key={`subject-${suggestion.id}`} onClick={() => openSuggestion(suggestion)}>
                  <span><strong>{suggestion.name}</strong><small>{language === 'bn' ? 'বিষয়' : 'Subject'}</small></span><ChevronRight size={17} />
                </button>
              ) : (
                <button className="search-suggestion question-suggestion" type="button" role="option" key={`question-${suggestion.id}`} onClick={() => openSuggestion(suggestion)}>
                  <span><strong>{suggestion.question}</strong><small>{suggestion.type.replace('_', ' ')} · {plainText(suggestion.answer).slice(0, 90)}</small></span><ChevronRight size={17} />
                </button>
              )) : <p className="search-suggestion-status">No matches found.</p>}
            </div>}
          </div>
          <Link className="icon-button shares-link" to="/shares" aria-label="Manage shared links" title="Manage shared links"><Share2 size={18} /></Link>
          {manageRoute && <label className="language-picker"><select value={language} disabled={!languageLoaded || !languageAvailable || savingLanguage} onChange={(event) => void changeLanguage(event.target.value as AppLanguage)} aria-label="Question language"><option value="en">English</option><option value="bn">বাংলা</option></select></label>}
          <Link className={`button manager-link ${manageRoute ? 'active' : ''}`} to="/manage" aria-label="Manage study notes" title="Manage study notes"><Settings2 size={16} /><span>{language === 'bn' ? 'ম্যানেজ' : 'Manage'}</span></Link>
          <button className="icon-button" onClick={() => setSignOutConfirmationOpen(true)} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
        </div>
      </header>
      {!languageAvailable && languageLoaded && <p className="settings-migration-notice" role="alert">Language settings need setup. Run <code>supabase/migrations/20261010_app_language.sql</code> in your Supabase SQL Editor, then reload.</p>}
      <Outlet context={{ language }} />
      {signOutConfirmationOpen && <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !signingOut && setSignOutConfirmationOpen(false)}>
        <section className="dialog-card logout-dialog" role="dialog" aria-modal="true" aria-labelledby="sign-out-title">
          <span className="eyebrow">SIGN OUT</span>
          <h2 id="sign-out-title">Sign out of Study Notes?</h2>
          <p className="muted">You’ll need to sign in again to manage your notes.</p>
          <div className="dialog-actions">
            <button className="button subtle" type="button" onClick={() => setSignOutConfirmationOpen(false)} disabled={signingOut}>Cancel</button>
            <button className="button primary" type="button" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </div>
        </section>
      </div>}
    </div>
  )
}

function plainText(html: string) {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}
