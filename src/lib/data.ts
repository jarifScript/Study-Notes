import { supabase } from './supabase'
import type { Chapter, Question, QuestionType, Semester, ShareLink, ShareScope, Subject } from '../types/database'

export function client() {
  if (!supabase) throw new Error('Supabase is not configured. Add the required environment variables.')
  return supabase
}

export async function listSemesters() {
  const { data, error } = await client().from('semesters').select('*').order('position').order('created_at')
  if (error) throw error
  return data as Semester[]
}

export async function listSubjects(semesterId: string) {
  const { data, error } = await client().from('subjects').select('*').eq('semester_id', semesterId).order('position').order('created_at')
  if (error) throw error
  return data as Subject[]
}

export async function listChapters(subjectId: string) {
  const { data, error } = await client().from('chapters').select('*').eq('subject_id', subjectId).order('position').order('created_at')
  if (error) throw error
  return data as Chapter[]
}

export async function listQuestions(chapterId: string) {
  const { data, error } = await client().from('questions').select('*, question_images(*)').eq('chapter_id', chapterId).order('position').order('created_at')
  if (error) throw error
  return data as Question[]
}

export async function listImagePaths(scopeType: 'semester' | 'subject' | 'chapter' | 'question', scopeId: string) {
  const database = client()
  let questionIds: string[] = []
  if (scopeType === 'question') {
    questionIds = [scopeId]
  } else {
    let chapterIds: string[] = []
    if (scopeType === 'chapter') {
      chapterIds = [scopeId]
    } else {
      let subjectIds: string[] = []
      if (scopeType === 'subject') {
        subjectIds = [scopeId]
      } else {
        const { data, error } = await database.from('subjects').select('id').eq('semester_id', scopeId)
        if (error) throw error
        subjectIds = (data ?? []).map((row) => String(row.id))
      }
      if (subjectIds.length) {
        const { data, error } = await database.from('chapters').select('id').in('subject_id', subjectIds)
        if (error) throw error
        chapterIds = (data ?? []).map((row) => String(row.id))
      }
    }
    if (chapterIds.length) {
      const { data, error } = await database.from('questions').select('id').in('chapter_id', chapterIds)
      if (error) throw error
      questionIds = (data ?? []).map((row) => String(row.id))
    }
  }
  if (!questionIds.length) return []
  const { data, error } = await database.from('question_images').select('storage_path').in('question_id', questionIds)
  if (error) throw error
  return (data ?? []).map((image) => String(image.storage_path))
}

export async function removeImageFiles(paths: string[]) {
  if (!paths.length) return
  const { error } = await client().storage.from('question-images').remove(paths)
  if (error) throw error
}

export async function createShare(scopeType: ShareScope, scopeId: string, expiresAt: string | null) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data, error } = await client().from('share_links').insert({
    token, scope_type: scopeType, scope_id: scopeId, expires_at: expiresAt,
  }).select('*').single()
  if (error) throw error
  return data as ShareLink
}

export function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export const questionTypes: { id: QuestionType; title: string }[] = [
  { id: 'very_short', title: 'Very Short' },
  { id: 'short', title: 'Short' },
  { id: 'long', title: 'Long' },
]
