import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import OrderedList from '@tiptap/extension-ordered-list'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table/kit'
import { AlignCenter, Bold, Code, Columns3, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Plus, Quote, Redo, Rows3, Subscript as SubscriptIcon, Superscript as SuperscriptIcon, Table2, Underline as UnderlineIcon, Undo, Workflow } from 'lucide-react'
import { client } from '../lib/data'
import { orderedListStyleForType } from '../lib/richText'
import { createFlowchart, FlowchartDialog, FlowchartExtension } from './Flowchart'
import type { FlowchartData } from './Flowchart'

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
  const [flowchartDialog, setFlowchartDialog] = useState<{ chart: FlowchartData; position?: number } | null>(null)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ orderedList: false }),
      FlowchartExtension.configure({
        onEdit: (chart, position) => setFlowchartDialog({ chart, position }),
      }),
      OrderedList.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            type: {
              default: null,
              parseHTML: (element) => element.getAttribute('type'),
              renderHTML: (attributes) => {
                if (!attributes.type) return {}
                const listStyle = orderedListStyleForType(attributes.type)
                return {
                  type: attributes.type,
                  ...(listStyle ? { 'data-list-style': listStyle } : {}),
                }
              },
            },
          }
        },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, protocols: ['http', 'https', 'mailto'] }),
      Subscript,
      Superscript,
      TableKit.configure({ table: { resizable: false } }),
    ],
    shouldRerenderOnTransaction: true,
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

  function saveFlowchart(chart: FlowchartData) {
    if (!editor || !flowchartDialog) return
    if (flowchartDialog.position === undefined) {
      editor.chain().focus().insertContent({ type: 'studyFlowchart', attrs: { chart } }).run()
    } else {
      const position = flowchartDialog.position
      editor.chain().focus().command(({ tr }) => {
        tr.setNodeMarkup(position, undefined, { chart })
        return true
      }).run()
    }
    setFlowchartDialog(null)
  }

  if (!editor) return <div className="editor-loading">Loading editor…</div>

  const isCellCentered = editor.isActive('tableCell', { align: 'center' }) || editor.isActive('tableHeader', { align: 'center' })
  const isRomanList = editor.isActive('orderedList', { type: 'i' })
  const isNumberedList = editor.isActive('orderedList') && !isRomanList

  function toggleNumberedList() {
    if (!editor.isActive('orderedList')) {
      editor.chain().focus().toggleOrderedList().run()
    } else if (isRomanList) {
      editor.chain().focus().updateAttributes('orderedList', { type: null }).run()
    } else {
      editor.chain().focus().toggleOrderedList().run()
    }
  }

  function toggleRomanList() {
    if (!editor.isActive('orderedList')) {
      editor.chain().focus().toggleOrderedList().updateAttributes('orderedList', { type: 'i' }).run()
    } else if (isRomanList) {
      editor.chain().focus().toggleOrderedList().run()
    } else {
      editor.chain().focus().updateAttributes('orderedList', { type: 'i' }).run()
    }
  }

  return (
    <div className="rich-editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Answer formatting" onMouseDown={(event) => event.preventDefault()}>
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold" title="Bold" aria-pressed={editor.isActive('bold')} className={editor.isActive('bold') ? 'active' : ''}><Bold size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic" title="Italic" aria-pressed={editor.isActive('italic')} className={editor.isActive('italic') ? 'active' : ''}><Italic size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="Underline" title="Underline" aria-pressed={editor.isActive('underline')} className={editor.isActive('underline') ? 'active' : ''}><UnderlineIcon size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleSubscript().run()} aria-label="Subscript" title="Subscript" aria-pressed={editor.isActive('subscript')} className={editor.isActive('subscript') ? 'active' : ''}><SubscriptIcon size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleSuperscript().run()} aria-label="Superscript" title="Superscript" aria-pressed={editor.isActive('superscript')} className={editor.isActive('superscript') ? 'active' : ''}><SuperscriptIcon size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Heading" title="Heading" aria-pressed={editor.isActive('heading', { level: 2 })} className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}><Heading2 size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bulleted list" title="Bulleted list" aria-pressed={editor.isActive('bulletList')} className={editor.isActive('bulletList') ? 'active' : ''}><List size={17} /></button>
        <button type="button" onClick={toggleNumberedList} aria-label="Numbered list" title="Numbered list" aria-pressed={isNumberedList} className={isNumberedList ? 'active' : ''}><ListOrdered size={17} /></button>
        <button type="button" onClick={toggleRomanList} aria-label="Roman numeral list" title="Roman numeral list" aria-pressed={isRomanList} className={isRomanList ? 'active' : ''}><span className="roman-list-icon" aria-hidden="true">i.</span></button>
        <button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} aria-label="Insert comparison grid" title="Insert comparison grid"><Table2 size={17} /></button>
        {editor.isActive('table') && <>
          <button type="button" onClick={() => editor.chain().focus().setCellAttribute('align', isCellCentered ? null : 'center').run()} aria-label="Center cell text" title="Center cell text" aria-pressed={isCellCentered} className={isCellCentered ? 'active' : ''}><AlignCenter size={17} /></button>
          <button className="table-adjust-button" type="button" onClick={() => editor.chain().focus().addRowAfter().run()} aria-label="Add table row" title="Add row"><Rows3 size={17} /><Plus size={12} /></button>
          <button className="table-adjust-button" type="button" onClick={() => editor.chain().focus().deleteRow().run()} aria-label="Remove table row" title="Remove row" disabled={!editor.can().deleteRow()}><Rows3 size={17} /><Minus size={12} /></button>
          <button className="table-adjust-button" type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} aria-label="Add table column" title="Add column"><Columns3 size={17} /><Plus size={12} /></button>
          <button className="table-adjust-button" type="button" onClick={() => editor.chain().focus().deleteColumn().run()} aria-label="Remove table column" title="Remove column" disabled={!editor.can().deleteColumn()}><Columns3 size={17} /><Minus size={12} /></button>
        </>}
        <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} aria-label="Code block" title="Code block"><Code size={17} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="Quote" title="Quote"><Quote size={17} /></button>
        <button type="button" onClick={() => setFlowchartDialog({ chart: createFlowchart() })} aria-label="Create flowchart" title="Create flowchart"><Workflow size={17} /></button>
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
      {flowchartDialog && <FlowchartDialog
        initial={flowchartDialog.position === undefined ? undefined : flowchartDialog.chart}
        onClose={() => setFlowchartDialog(null)}
        onSave={saveFlowchart}
      />}
    </div>
  )
}
