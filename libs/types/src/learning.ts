import type { RichTextDocument } from './article';
/** Public course data never includes lesson bodies, media paths or answer keys. */
export interface CourseSummary {
  id: string;
  title: string;
  description: string;
  descriptionDocument?: RichTextDocument;
  descriptionHtml?: string;
  overviewDocument?: RichTextDocument;
  overviewHtml?: string;
  overview?: string;
  audience?: string;
  hasTrailer?: boolean;
  category: string;
  skill: string;
  level: string;
  instructor: string;
  price: number;
  durationMinutes: number;
  published: boolean;
  lessonCount: number;
}
export interface CourseResource {
  id: string;
  title: string;
  file: string;
}
export interface CourseQuestion {
  id: string;
  prompt: string;
  options: string[];
  correct?: number;
}
export interface CourseQuiz {
  id: string;
  title: string;
  passPercent: number;
  maxAttempts: number;
  questions: CourseQuestion[];
}
export interface CourseAssignment {
  id: string;
  title: string;
  instructions: string;
  required: boolean;
  file: string;
}
export interface CourseLesson {
  id: string;
  title: string;
  body: string;
  bodyDocument?: RichTextDocument;
  bodyHtml?: string;
  video: string;
  durationSeconds: number;
  resources: CourseResource[];
  quiz?: CourseQuiz;
  assignment?: CourseAssignment;
}
export interface CourseDefinition extends CourseSummary {
  trailer?: string;
  lessons: CourseLesson[];
  resources: CourseResource[];
  quiz?: CourseQuiz;
  assignment?: CourseAssignment;
}
export interface CourseProgress {
  readPercent?: number;
  position: number;
  watched: number;
  complete: boolean;
}
export interface CourseEnrollment {
  courseId: string;
  lastLesson: string | null;
  bookmarks?: Record<string, { lessonId: string; position: number; note: string }>;
  progress: Record<string, CourseProgress>;
  quizzes: Record<string, { attempts: number; passed: boolean; percentage: number }>;
  assignments: Record<string, { id: string; status: string; comments: string; answer?: string }>;
  certificate: { id: string; issuedAt: string; member: string } | null;
  order: { id: string; amount: number; mode: 'simulation'; createdAt: string };
}
export interface CourseWorkspace {
  course: CourseDefinition;
  enrollment: CourseEnrollment;
}
export interface CourseRosterEntry {
  member: string;
  name: string;
  enrollment: CourseEnrollment;
}
