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
