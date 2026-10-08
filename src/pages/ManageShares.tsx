import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Link2, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { client, friendlyError } from '../lib/data'
import type { ShareLink } from '../types/database'
import { useToast } from '../components/Toast'

interface ShareRow extends ShareLink {
  name: string
}

export function ManageShares() {
  const [links, setLinks] = useState<ShareRow[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState('')
  const notify = useToast()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const database = client()
      const [{ data: rawLinks, error }, { data: semesters, error: semestersError }, { data: subjects, error: subjectsError }, { data: chapters, error: chaptersError }, { data: questions, error: questionsError }] = await Promise.all([
        database.from('share_links').select('*').order('created_at', { ascending: false }),
        database.from('semesters').select('id, name'),
        database.from('subjects').select('id, name'),
        database.from('chapters').select('id, name'),
        database.from('questions').select('id, question'),
      ])
      const failure = error ?? semestersError ?? subjectsError ?? chaptersError ?? questionsError
      if (failure) throw failure
      const names = new Map<string, string>()
      for (const row of semesters ?? []) names.set(row.id as string, row.name as string)
      for (const row of subjects ?? []) names.set(row.id as string, row.name as string)
      for (const row of chapters ?? []) names.set(row.id as string, row.name as string)
      for (const row of questions ?? []) names.set(row.id as string, row.question as string)
      setLinks(((rawLinks ?? []) as ShareLink[]).map((link) => ({ ...link, name: names.get(link.scope_id) ?? 'Removed content' })))
    } catch (error) {
      notify(friendlyError(error), 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { void refresh() }, [refresh])

  async function revoke(link: ShareRow) {
    if (!window.confirm(`Revoke the link for "${link.name}"? Anyone with it will lose access.`)) return
    try {
      const { error } = await client().from('share_links').update({ is_active: false }).eq('id', link.id)
      if (error) throw error
      notify('Share link revoked.')
      await refresh()
    } catch (error) {
      notify(friendlyError(error), 'error')
    }
  }

  async function copy(link: ShareRow) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${link.token}`)
      setCopiedId(link.id)
      window.setTimeout(() => setCopiedId(''), 1500)
    } catch {
      notify('Could not access the clipboard. Open the link to copy it manually.', 'error')
    }
  }

  const activeLinks = links.filter((link) => link.is_active)

  return <main className="page-content manage-content">
    <div className="page-heading"><div><span className="eyebrow">PRIVACY</span><h1>Shared links</h1><p className="muted">Manage the notes accessible through your private links.</p></div><Link className="button outline-button" to="/"><ExternalLink size={16} /> My library</Link></div>
    {loading ? <div className="loading-panel" /> : activeLinks.length === 0 ? <section className="empty-state"><div className="empty-icon"><Link2 size={21} /></div><h2>No active links</h2><p>Share a semester, subject, chapter, or question to create a private link.</p><Link className="button primary" to="/">Browse my notes</Link></section> : (
      <div className="share-table">
        {activeLinks.map((link) => <article className="share-row" key={link.id}>
          <div className="share-row-main"><span className={`share-scope ${link.expires_at && new Date(link.expires_at).getTime() <= Date.now() ? 'expired' : ''}`}>{link.expires_at && new Date(link.expires_at).getTime() <= Date.now() ? 'Expired' : link.scope_type}</span><h2>{link.name}</h2><p className="muted">{link.expires_at ? `Expires ${new Date(link.expires_at).toLocaleString()}` : 'No expiry'} · Created {new Date(link.created_at).toLocaleDateString()}</p></div>
          <div className="share-row-actions"><a className="icon-button" href={`/s/${link.token}`} target="_blank" rel="noreferrer" aria-label="Open shared page"><ExternalLink size={17} /></a><button className="icon-button" onClick={() => void copy(link)} aria-label="Copy share link" title="Copy link">{copiedId === link.id ? <Check size={17} /> : <Copy size={17} />}</button><button className="icon-button danger-icon" onClick={() => void revoke(link)} aria-label="Revoke share link" title="Revoke"><Trash2 size={17} /></button></div>
        </article>)}
      </div>
    )}
    {links.length > activeLinks.length && <p className="muted revoked-count">{links.length - activeLinks.length} revoked link{links.length - activeLinks.length === 1 ? '' : 's'} hidden.</p>}
  </main>
}
