import type { Chapter, ChapterKnowledge, Paper, SubjectId } from "@/lib/types";
import { KNOWLEDGE } from "./knowledge";
import { AQA_ECON_CHAPTERS, AQA_ECON_PAPERS } from "./aqa-economics";
import { OCR_CS_CHAPTERS, OCR_PAPERS } from "./ocr-computer-science";
import { EDEXCEL_MATH_CHAPTERS, EDXCEL_PAPERS } from "./edexcel-mathematics";

export interface SubjectMeta {
  id: SubjectId;
  shortName: string;
  name: string;
  board: string;
  code: string;
  /** Accent colour token used across the UI. */
  accent: string;
  specUrl: string;
  blurb: string;
}

export const SUBJECTS: Record<SubjectId, SubjectMeta> = {
  "aqa-economics": {
    id: "aqa-economics",
    shortName: "Econ",
    name: "AQA A-level Economics",
    board: "AQA",
    code: "7136",
    accent: "amber",
    specUrl: "https://www.aqa.org.uk/subjects/economics/economics-7136/specification",
    blurb:
      "Micro, macro, financial markets and the international economy. Section 4.1 to 4.4 of the A-level specification.",
  },
  "ocr-computer-science": {
    id: "ocr-computer-science",
    shortName: "CS",
    name: "OCR A-level Computer Science",
    board: "Cambridge OCR",
    code: "H446",
    accent: "cyan",
    specUrl: "https://www.ocr.org.uk/Images/170844-specification-accredited-a-level-gce-computer-science-h446.pdf",
    blurb:
      "Computer systems plus algorithms and programming, including data structures, big-O, Boolean algebra and trace tables.",
  },
  "edexcel-mathematics": {
    id: "edexcel-mathematics",
    shortName: "Maths",
    name: "Edexcel A-level Mathematics",
    board: "Pearson Edexcel",
    code: "9MA0",
    accent: "emerald",
    specUrl:
      "https://qualifications.pearson.com/en/qualifications/pearson-efq-uk/a-level/mathematics-2018",
    blurb:
      "Pure Mathematics, Mechanics and Statistics across Papers 1, 2 and 3. Topics 1 to 10 plus the applied strands.",
  },
};

export const SUBJECT_ORDER: SubjectId[] = [
  "edexcel-mathematics",
  "ocr-computer-science",
  "aqa-economics",
];

export const CHAPTERS_BY_SUBJECT: Record<SubjectId, Chapter[]> = {
  "aqa-economics": AQA_ECON_CHAPTERS,
  "ocr-computer-science": OCR_CS_CHAPTERS,
  "edexcel-mathematics": EDEXCEL_MATH_CHAPTERS,
};

/**
 * Attach authored teaching content to each chapter.
 *
 * Kept as a separate file so the specification data stays readable: the bullets
 * below each chapter are the board's own, and mixing them with authored teaching
 * notes would make it impossible to see which text came from the specification
 * and which came from us.
 */
for (const list of Object.values(CHAPTERS_BY_SUBJECT)) {
  for (const chapter of list) {
    const knowledge = KNOWLEDGE[chapter.id];
    if (knowledge) (chapter as { knowledge?: ChapterKnowledge }).knowledge = knowledge;
  }
}

export const PAPERS_BY_SUBJECT: Record<SubjectId, Paper[]> = {
  "aqa-economics": AQA_ECON_PAPERS,
  "ocr-computer-science": OCR_PAPERS,
  "edexcel-mathematics": EDXCEL_PAPERS,
};

export const ALL_CHAPTERS: Chapter[] = [
  ...EDEXCEL_MATH_CHAPTERS,
  ...OCR_CS_CHAPTERS,
  ...AQA_ECON_CHAPTERS,
];

const CHAPTER_INDEX = new Map(ALL_CHAPTERS.map((c) => [c.id, c]));

export function getChapter(id: string): Chapter | undefined {
  return CHAPTER_INDEX.get(id);
}

export function getChapters(subject: SubjectId): Chapter[] {
  return CHAPTERS_BY_SUBJECT[subject];
}

export function getPapers(subject: SubjectId): Paper[] {
  return PAPERS_BY_SUBJECT[subject];
}

/** All distinct skill tags across the specification, in stable order. */
export function allSkillTags(subject?: SubjectId): string[] {
  const chapters = subject ? CHAPTERS_BY_SUBJECT[subject] : ALL_CHAPTERS;
  const seen = new Set<string>();
  for (const c of chapters) for (const s of c.skills) seen.add(s);
  return [...seen].sort();
}

/** Chapters that a given chapter depends on, resolved transitively. */
export function prerequisiteClosure(id: string, limit = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length && out.length < limit) {
    const current = queue.shift();
    if (!current) break;
    const chapter = CHAPTER_INDEX.get(current);
    if (!chapter) continue;
    for (const pre of chapter.prerequisites) {
      if (seen.has(pre)) continue;
      seen.add(pre);
      out.push(pre);
      queue.push(pre);
    }
  }
  return out;
}

/** Chapters that list `id` as a prerequisite. */
export function dependents(id: string): string[] {
  return ALL_CHAPTERS.filter((c) => c.prerequisites.includes(id)).map((c) => c.id);
}

export function defaultEnabled(subject: SubjectId): string[] {
  return CHAPTERS_BY_SUBJECT[subject]
    .filter((c) => c.asLevel)
    .map((c) => c.id);
}
