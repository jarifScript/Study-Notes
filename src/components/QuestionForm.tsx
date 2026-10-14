import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { client } from '../lib/data'
import type { AppLanguage, Question, QuestionType } from '../types/database'
import { questionTypes } from '../lib/data'
import { VoiceInput } from './VoiceInput'
import { useToast } from './Toast'

const RichTextEditor = lazy(async () => ({ default: (await import('./RichTextEditor')).RichTextEditor }))

interface QuestionFormProps {
  chapterId: string
  initial?: Question
  initialType: QuestionType
  language: AppLanguage
  onClose: () => void
  onSaved: () => Promise<void>
}

interface QuestionDraft {
  type: QuestionType
  question: string
  answer: string
  boardYears: number[]
  uploaded: { path: string; url: string }[]
  readyForSave: { path: string; url: string }[]
}

function readDraft(key: string): { draft: QuestionDraft | null; error: string } {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { draft: null, error: '' }
    const value = JSON.parse(raw) as Partial<QuestionDraft>
    const validType = value.type === 'very_short' || value.type === 'short' || value.type === 'long'
    const validImages = (images: unknown): images is { path: string; url: string }[] =>
      Array.isArray(images) && images.every((image) =>
        image && typeof image.path === 'string' && typeof image.url === 'string')
    const validBoardYears = value.boardYears === undefined ||
      (Array.isArray(value.boardYears) && value.boardYears.every((year) => Number.isInteger(year) && year >= 1900 && year <= 2100))
    if (!validType || typeof value.question !== 'string' || typeof value.answer !== 'string' || !validBoardYears ||
      !validImages(value.uploaded) || !validImages(value.readyForSave)) {
      return { draft: null, error: 'Your saved draft could not be restored. You can still enter and save your notes.' }
    }
    return { draft: value as QuestionDraft, error: '' }
  } catch {
    return { draft: null, error: 'Your saved draft could not be restored. You can still enter and save your notes.' }
  }
}

export function QuestionForm({ chapterId, initial, initialType, language, onClose, onSaved }: QuestionFormProps) {
  const idRef = useRef(initial?.id ?? crypto.randomUUID())
  const draftKey = `study-notes:question-draft:${chapterId}:${initial?.id ?? `new:${initialType}`}`
  const [draftState] = useState(() => readDraft(draftKey))
  const [type, setType] = useState<QuestionType>(draftState.draft?.type ?? initial?.type ?? initialType)
  const [question, setQuestion] = useState(draftState.draft?.question ?? initial?.question ?? '')
  const [answer, setAnswer] = useState(draftState.draft?.answer ?? initial?.answer ?? '')
  const [boardYears, setBoardYears] = useState(draftState.draft?.boardYears ?? initial?.board_years ?? [])
  const [yearInput, setYearInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftError, setDraftError] = useState(draftState.error)
  const [uploaded, setUploaded] = useState(draftState.draft?.uploaded ?? [])
  const [readyForSave, setReadyForSave] = useState(draftState.draft?.readyForSave ?? [])
  const questionRef = useRef<HTMLTextAreaElement>(null)
  const insertAnswerText = useRef<((text: string) => void) | null>(null)
  const committed = useRef(false)
  const notify = useToast()

  useEffect(() => {
    let draftAnswer = answer
    for (const image of readyForSave) draftAnswer = draftAnswer.replaceAll(image.url, `storage://${image.path}`)
    try {
      localStorage.setItem(draftKey, JSON.stringify({ type, question, answer: draftAnswer, boardYears, uploaded, readyForSave }))
      setDraftError('')
    } catch {
      setDraftError('Your draft could not be saved in this browser. Keep this page open until you save your question.')
    }
  }, [answer, boardYears, draftKey, question, readyForSave, type, uploaded])

  async function uploadImage(file: File) {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      throw new Error('Choose an image smaller than 10 MB.')
    }
    const path = `${idRef.current}/${crypto.randomUUID()}`
    const { error: uploadError } = await client().storage.from('question-images').upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const { data, error: urlError } = await client().storage.from('question-images').createSignedUrl(path, 3600)
    if (urlError) {
      const { error: removeError } = await client().storage.from('question-images').remove([path])
      if (removeError) console.error('Could not remove image after signed URL failure:', removeError.message)
      throw urlError
    }
    const uploadedImage = { path, url: data.signedUrl }
    setUploaded((current) => [...current, uploadedImage])
    return uploadedImage
  }

  async function cleanupUncommittedImages() {
    if (committed.current || !uploaded.length) return
    const { error: removeError } = await client().storage.from('question-images').remove(uploaded.map((image) => image.path))
    if (removeError) {
      console.error('Could not clean up unused question images:', removeError.message)
      notify('Some unused images could not be removed from storage.', 'error')
    }
  }

  async function close() {
    await cleanupUncommittedImages()
    try {
      localStorage.removeItem(draftKey)
      setDraftError('')
    } catch {
      notify('The saved draft could not be removed from this browser.', 'error')
    }
    onClose()
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim()) {
      setError('Enter a question before saving.')
      questionRef.current?.focus()
      return
    }
    setSaving(true)
    setError('')
    try {
      let storedAnswer = answer
      for (const image of readyForSave) storedAnswer = storedAnswer.replaceAll(image.url, `storage://${image.path}`)
      let position = initial?.position
      if (!initial || type !== initial.type) {
        const { data: lastQuestion, error: positionError } = await client().from('questions')
          .select('position')
          .eq('chapter_id', chapterId)
          .eq('type', type)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (positionError) throw positionError
        position = (lastQuestion?.position ?? -1) + 1
      }
      const { error: questionError } = await client().from('questions').upsert({
        id: idRef.current, chapter_id: chapterId, type, question: question.trim(), answer: storedAnswer, board_years: boardYears,
        position,
      })
      if (questionError) throw questionError
      if (readyForSave.length) {
        const { error: imageError } = await client().from('question_images').upsert(
          readyForSave.map((image) => ({ question_id: idRef.current, storage_path: image.path })),
          { onConflict: 'storage_path' },
        )
        if (imageError) throw imageError
      }
      const referencedPaths = new Set([...storedAnswer.matchAll(/storage:\/\/([^"]+)/g)].map((match) => match[1]))
      const { data: existingImages, error: existingError } = await client().from('question_images').select('id, storage_path').eq('question_id', idRef.current)
      if (existingError) throw existingError
      const removed = (existingImages ?? []).filter((image) => !referencedPaths.has(image.storage_path))
      if (removed.length) {
        const { error: deleteMetadataError } = await client().from('question_images').delete().in('id', removed.map((image) => image.id))
        if (deleteMetadataError) throw deleteMetadataError
        const { error: deleteStorageError } = await client().storage.from('question-images').remove(removed.map((image) => image.storage_path))
        if (deleteStorageError) throw deleteStorageError
      }
      committed.current = true
      try {
        localStorage.removeItem(draftKey)
        setDraftError('')
      } catch {
        notify('Question saved, but its local draft could not be removed from this browser.', 'error')
      }
      await onSaved()
      onClose()
    } catch (cause) {
      if (committed.current) {
        notify('Question saved, but the list could not refresh. Reopen the subject to see the latest notes.', 'error')
        onClose()
      } else {
        setError(cause instanceof Error ? cause.message : 'Could not save this question. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  function insertQuestionText(text: string) {
    const input = questionRef.current
    if (!input) {
      setQuestion((current) => `${current}${current ? ' ' : ''}${text}`)
      return
    }
    const start = input.selectionStart
    const end = input.selectionEnd
    const next = `${question.slice(0, start)}${text} ${question.slice(end)}`
    setQuestion(next)
    requestAnimationFrame(() => input.setSelectionRange(start + text.length + 1, start + text.length + 1))
  }

  function addBoardYear() {
    const year = Number(yearInput)
    if (!/^\d{4}$/.test(yearInput) || year < 1900 || year > 2100) {
      setError('Enter a valid year between 1900 and 2100.')
      return
    }
    if (boardYears.includes(year)) {
      setError('That board year has already been added.')
      return
    }
    setBoardYears((current) => [...current, year].sort((a, b) => a - b))
    setYearInput('')
    setError('')
  }

  return (
    <div className="dialog-backdrop question-backdrop">
      <form className="question-dialog" onSubmit={(event) => void save(event)} role="dialog" aria-modal="true" aria-labelledby="question-form-title">
        <header className="dialog-header"><div><span className="eyebrow">{initial ? 'EDIT QUESTION' : 'NEW QUESTION'}</span><h2 id="question-form-title">{initial ? 'Update your notes' : 'Add a question'}</h2></div><button className="icon-button" type="button" onClick={() => void close()} disabled={saving} aria-label="Close"><X size={19} /></button></header>
        <div className="question-form-body">
          <label>Question type<select value={type} onChange={(event) => setType(event.target.value as QuestionType)}>{questionTypes.map((item) => <option key={item.id} value={item.id}>{language === 'bn' ? item.banglaTitle : item.title}</option>)}</select></label>
          <label className="voice-field-label">Question <VoiceInput onText={insertQuestionText} /></label>
          <textarea ref={questionRef} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Write your question…" rows={3} maxLength={10000} required />
          <label htmlFor="board-year-input">Board years</label>
          <div className="board-year-entry">
            <input id="board-year-input" type="number" inputMode="numeric" min="1900" max="2100" step="1" value={yearInput} onChange={(event) => setYearInput(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addBoardYear()
              }
            }} placeholder="e.g. 2026" aria-label="Board exam year" />
            <button className="button outline-button" type="button" onClick={addBoardYear}>Add year</button>
          </div>
          {boardYears.length > 0 && <ul className="board-year-list" aria-label="Added board years">
            {boardYears.map((year) => <li key={year}><span>{year}</span><button type="button" aria-label={`Remove ${year}`} onClick={() => setBoardYears((current) => current.filter((item) => item !== year))}>×</button></li>)}
          </ul>}
          <label className="voice-field-label answer-label">Answer <VoiceInput onText={(text) => insertAnswerText.current?.(text)} /></label>
          <Suspense fallback={<div className="editor-loading">Loading editor…</div>}>
            <RichTextEditor value={answer} onChange={setAnswer} onUploadImage={uploadImage} onImageUrlsReady={setReadyForSave} onInsertTextRef={(insert) => { insertAnswerText.current = insert }} />
          </Suspense>
          {error && <p className="form-error" role="alert">{error}</p>}
          {draftError && <p className="form-error" role="alert">{draftError}</p>}
        </div>
        <footer className="dialog-footer"><button className="button subtle" type="button" onClick={() => void close()} disabled={saving}>Cancel</button><button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save question'}</button></footer>
      </form>
    </div>
  )
}
