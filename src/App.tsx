import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/Toast'
import { Home } from './pages/Home'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const ManageShares = lazy(() => import('./pages/ManageShares').then((module) => ({ default: module.ManageShares })))
const SearchPage = lazy(() => import('./pages/Search').then((module) => ({ default: module.SearchPage })))
const SharedView = lazy(() => import('./pages/SharedView').then((module) => ({ default: module.SharedView })))
const SubjectPage = lazy(() => import('./pages/Subject').then((module) => ({ default: module.SubjectPage })))
const ManageHome = lazy(() => import('./pages/ManageHome').then((module) => ({ default: module.ManageHome })))

function SetupNotice() {
  return <main className="auth-shell"><section className="auth-card"><span className="eyebrow">STUDY NOTES</span><h1>Connect your Supabase project</h1><p className="muted">Add your project URL and anon key to <code>.env.local</code>, then restart the development server.</p><pre>VITE_SUPABASE_URL=https://…{'\n'}VITE_SUPABASE_ANON_KEY=…</pre></section></main>
}

function Login({ accessDenied }: { accessDenied: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) setError(signInError.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-shell"><form className="auth-card" onSubmit={handleSubmit}>
    <span className="brand-mark">S</span><span className="eyebrow">YOUR PRIVATE LIBRARY</span><h1>Welcome back</h1>
    <p className="muted">Sign in to manage your college notes.</p>
    {accessDenied && <p className="form-error" role="alert">This account is not configured as the notes admin. Check the admin setup in the README.</p>}
    <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
    <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary full-width" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
    <p className="auth-footnote">Private access · Admin only</p>
  </form></main>
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [adminAllowed, setAdminAllowed] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false)
      return
    }
    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Could not restore the Supabase session:', error.message)
      if (active) {
        setSession(data.session)
        setAdminAllowed(false)
        setCheckingSession(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (active) {
        setSession(currentSession)
        setAdminAllowed(false)
        if (currentSession) setAccessDenied(false)
      }
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session || !supabase) {
      setAdminAllowed(false)
      return
    }
    const database = supabase
    let active = true
    void database.from('admin_config').select('user_id').eq('user_id', session.user.id).maybeSingle().then(async ({ data, error }) => {
      if (error) console.error('Could not verify admin access:', error.message)
      const allowed = !error && data?.user_id === session.user.id
      if (active) {
        setAdminAllowed(allowed)
        if (!allowed) setAccessDenied(true)
      }
      if (!allowed) {
        const { error: signOutError } = await database.auth.signOut()
        if (signOutError) console.error('Could not sign out a non-admin account:', signOutError.message)
      }
    })
    return () => { active = false }
  }, [session])

  if (!isSupabaseConfigured) return <SetupNotice />
  if (checkingSession) return <main className="auth-shell"><div className="loading-block" aria-label="Loading" /></main>
  if (session && !adminAllowed) return <main className="auth-shell"><div className="loading-block" aria-label="Verifying admin access" /></main>

  return <ToastProvider><Routes>
    <Route path="/s/:token" element={<Suspense fallback={<main className="shared-shell"><div className="loading-panel" /></main>}><SharedView /></Suspense>} />
    <Route path="/login" element={session && adminAllowed ? <Navigate to="/" replace /> : <Login accessDenied={accessDenied} />} />
    <Route element={session && adminAllowed ? <AppShell /> : <Navigate to="/login" replace />}>
      <Route path="/" element={<Home />} />
      <Route path="/subject/:id" element={<Suspense fallback={<main className="page-content"><div className="loading-panel" /></main>}><SubjectPage /></Suspense>} />
      <Route path="/manage" element={<Suspense fallback={<main className="page-content"><div className="loading-panel" /></main>}><ManageHome /></Suspense>} />
      <Route path="/manage/subject/:id" element={<Suspense fallback={<main className="page-content"><div className="loading-panel" /></main>}><SubjectPage manage /></Suspense>} />
      <Route path="/shares" element={<Suspense fallback={<main className="page-content"><div className="loading-panel" /></main>}><ManageShares /></Suspense>} />
      <Route path="/search" element={<Suspense fallback={<main className="page-content"><div className="loading-panel" /></main>}><SearchPage /></Suspense>} />
    </Route>
    <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
  </Routes></ToastProvider>
}

export default App
