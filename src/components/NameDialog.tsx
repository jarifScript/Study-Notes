import { useEffect, useState } from 'react'

interface NameDialogProps {
  title: string
  initialValue?: string
  placeholder: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}

export function NameDialog({ title, initialValue = '', placeholder, onClose, onSave }: NameDialogProps) {
  const [name, setName] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name to continue.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(trimmed)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form className="dialog-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="name-dialog-title">
        <h2 id="name-dialog-title">{title}</h2>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={placeholder} maxLength={120} aria-label="Name" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button className="button subtle" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
