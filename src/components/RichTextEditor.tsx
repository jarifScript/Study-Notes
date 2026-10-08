import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Bold, Code, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Undo, Redo } from 'lucide-react'
import { client } from '../lib/data'

interface ImageUpload {
  url: string
  path: string
}

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  onUploadImage: (file: File) => Promise<ImageUpload>
  onImageUrlsReady: (images: ImageUpload[]) => void
  onInsertTextRef: (insert: ((text: string) => void) | null) => void
}

export function RichTextEditor({ value, onChange, onUploadImage, onImageUrlsReady, onInsertTextRef }: RichTextEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const imageMappings = useRef<ImageUpload[]>([])
  const [uploadError, setUploadError] = useState('')
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, protocols: ['http', 'https', 'mailto'] }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'rich-editor-area', 'aria-label': 'Answer content' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
        if (files.length) {
          event.preventDefault()
          void uploadFiles(files)
          return true
        }
        return false
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('image/'))
        if (files.length) {
          event.preventDefault()
          void uploadFiles(files)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: updated }) => onChange(updated.getHTML()),
  })

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!editor) return
    setUploadError('')
    for (const file of files) {
      try {
        const image = await onUploadImage(file)
        imageMappings.current = [...imageMappings.current.filter((item) => item.path !== image.path), image]
        onImageUrlsReady(imageMappings.current)
        editor.chain().focus().setImage({ src: image.url, alt: file.name }).run()
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Could not upload image. Please try again.')
      }
    }
  }, [editor, onImageUrlsReady, onUploadImage])

  useEffect(() => {
    if (!editor) return
    const insertText = (text: string) => editor.chain().focus().insertContent(`${text} `).run()
    onInsertTextRef(insertText)
    return () => onInsertTextRef(null)
  }, [editor, onInsertTextRef])

  useEffect(() => {
    if (!editor) return
    const paths = [...value.matchAll(/src="storage:\/\/([^"]+)"/g)].map((match) => match[1])
    if (!paths.length) {
      if (value !== editor.getHTML()) editor.commands.setContent(value || '', { emitUpdate: false })
      return
    }
    let cancelled = false
    void Promise.all(paths.map(async (path) => {
      const { data, error } = await client().storage.from('question-images').createSignedUrl(path, 3600)
      if (error) throw error
      return { path, url: data.signedUrl }
    })).then((mappings) => {
      if (cancelled) return
      imageMappings.current = mappings
      onImageUrlsReady(mappings)
      let html = value
      for (const item of mappings) html = html.replaceAll(`storage://${item.path}`, item.url)
      if (html !== editor.getHTML()) editor.commands.setContent(html || '', { emitUpdate: false })
    }).catch((error: unknown) => console.error('Could not load existing answer images:', error))
    return () => { cancelled = true }
  }, [editor, onImageUrlsReady])

  async function chooseImages(files: FileList | null) {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'))
    if (images.length) await uploadFiles(images)
    if (fileRef.current) fileRef.current.value = ''
  }

  function addLink() {
    const url = window.prompt('Enter a link (https://…)')
    if (url && /^https?:\/\//i.test(url)) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  if (!editor) return <div className="editor-loading">Loading editor…</div>

  return (
    <div className="rich-editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Answer formatting">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold" title="Bold" className={editor.isActive('bold') ? 'active' : ''}><Bold size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic" title="Italic" className={editor.isActive('italic') ? 'active' : ''}><Italic size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Heading" title="Heading"><Heading2 size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bulleted list" title="Bulleted list"><List size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list" title="Numbered list"><ListOrdered size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} aria-label="Code block" title="Code block"><Code size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="Quote" title="Quote"><Quote size={17} /></button>
        <button type="button" onClick={addLink} aria-label="Add link" title="Add link"><Link2 size={17} /></button>
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Upload image" title="Upload image"><ImagePlus size={17} /></button>
        <span className="toolbar-spacer" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()} aria-label="Undo" title="Undo"><Undo size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} aria-label="Redo" title="Redo"><Redo size={17} /></button>
        <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => void chooseImages(event.target.files)} />
      </div>
      <EditorContent editor={editor} />
      {uploadError && <p className="form-error image-upload-error" role="alert">{uploadError}</p>}
      <p className="editor-hint">Paste, drop, or upload an image. Images are private and shown only in this question's shared links.</p>
    </div>
  )
}
