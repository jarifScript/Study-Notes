import { supabaseUrl } from './supabase'

const orderedListStyles: Record<string, string> = {
  '1': 'decimal',
  a: 'lower-alpha',
  A: 'upper-alpha',
  i: 'lower-roman',
  I: 'upper-roman',
}

export function orderedListStyleForType(type: string | null): string | null {
  return type ? orderedListStyles[type] ?? null : null
}

export function questionImagePath(source: string): string | null {
  if (source.startsWith('storage://')) return source.slice('storage://'.length) || null
  if (!supabaseUrl) return null

  try {
    const imageUrl = new URL(source)
    const storageOrigin = new URL(supabaseUrl).origin
    const signedImagePrefix = '/storage/v1/object/sign/question-images/'
    if (imageUrl.origin !== storageOrigin || !imageUrl.pathname.startsWith(signedImagePrefix)) return null
    return decodeURIComponent(imageUrl.pathname.slice(signedImagePrefix.length)) || null
  } catch {
    return null
  }
}

export function canonicalizeQuestionImageSources(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  let changed = false
  for (const image of template.content.querySelectorAll<HTMLImageElement>('img[src]')) {
    const source = image.getAttribute('src')
    if (!source) continue
    const path = questionImagePath(source)
    if (!path || source === `storage://${path}`) continue
    image.setAttribute('src', `storage://${path}`)
    changed = true
  }
  return changed ? template.innerHTML : html
}
