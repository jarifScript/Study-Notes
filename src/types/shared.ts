import type { QuestionType } from './database'

export interface SharedQuestion {
  id: string
  type: QuestionType
  question: string
  answer: string
  board_years: number[]
  position: number
  images: { id: string; storage_path: string }[]
}

export interface SharedChapter {
  id: string
  name: string
  questions: SharedQuestion[]
  subject?: { id: string; name: string }
}

export interface SharedSubject {
  id: string
  name: string
  chapters: SharedChapter[]
  semester?: { id: string; name: string }
}

export interface SharedPayload {
  scope_type: 'semester' | 'subject' | 'chapter' | 'question'
  semester?: { id: string; name: string; subjects: SharedSubject[] }
  subject?: SharedSubject
  chapter?: SharedChapter
  question?: SharedQuestion & { chapter: SharedChapter & { subject: { id: string; name: string; semester: { id: string; name: string } } } }
}
