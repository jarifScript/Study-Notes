export type QuestionType = 'very_short' | 'short' | 'long'
export type ShareScope = 'semester' | 'subject' | 'chapter' | 'question'

export interface Semester {
  id: string
  name: string
  position: number
  created_at: string
}

export interface Subject {
  id: string
  semester_id: string
  name: string
  position: number
  created_at: string
}

export interface Chapter {
  id: string
  subject_id: string
  name: string
  position: number
  created_at: string
}

export interface Question {
  id: string
  chapter_id: string
  type: QuestionType
  question: string
  answer: string
  position: number
  created_at: string
  updated_at: string
  question_images?: QuestionImage[]
}

export interface QuestionImage {
  id: string
  question_id: string
  storage_path: string
  created_at: string
}

export interface ShareLink {
  id: string
  token: string
  scope_type: ShareScope
  scope_id: string
  is_active: boolean
  expires_at: string | null
  created_at: string
}
