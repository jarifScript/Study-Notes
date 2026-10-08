import { useState } from 'react'
import { Check, Copy, Link2, X } from 'lucide-react'
import { client, createShare, friendlyError } from '../lib/data'
import type { ShareScope } from '../types/database'
import { useToast } from './Toast'

export function ShareDialog({ scopeType, scopeId, title, onClose }: { scopeType: ShareScope; scopeId: string; title: string; onClose: () => void }) {
  const [expiry, setExpiry] = useState('')
  const [link, setLink] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const notify = useToast()

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const expiresAt = expiry ? new Date(expiry).toISOString() : null
      const share = await createShare(scopeType, scopeId, expiresAt)
      setLink(`${window.location.origin}/s/${share.token}`)
      notify('Share link created.')
    } catch (cause) {
      setError(friendlyError(cause))
    } finally {
      setCreating(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Could not access the clipboard. Select and copy the link instead.')
    }
  }

  async function deactivate() {
    if (!window.confirm('Revoke all active share links for this item? Existing links will stop working.')) return
    const { error: updateError } = await client().from('share_links').update({ is_active: false }).eq('scope_type', scopeType).eq('scope_id', scopeId).eq('is_active', true)
    if (updateError) setError(updateError.message)
    else {
      setLink('')
      notify('Active links revoked.')
    }
  }

  return (
    <div className="dialog-backdrop">
      <section className="dialog-card share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
        <header className="dialog-header"><div><span className="eyebrow">PRIVATE SHARING</span><h2 id="share-dialog-title">Share {title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        <p className="muted">Anyone with this unguessable link can view only this {scopeType}. No other notes are exposed.</p>
        {!link ? <form onSubmit={(event) => void generate(event)}>
          <label>Optional expiry<input type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full-width" disabled={creating}><Link2 size={17} />{creating ? 'Creating…' : 'Create share link'}</button>
        </form> : <>
          <div className="share-url-row"><input readOnly value={link} aria-label="Share link" /><button className="button primary" onClick={() => void copy()}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copied' : 'Copy'}</button></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button danger-button full-width" onClick={() => void deactivate()}>Revoke active links</button>
        </>}
      </section>
    </div>
  )
}
