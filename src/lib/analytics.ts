import type {
  Answer,
  Chapter,
  ModelConfig,
  OverallProfile,
  SkillInsight,
  SkillTagInsight,
  SkillState,
  SubjectId,
} from "@/lib/types";
import { clamp, logistic } from "@/lib/math-utils";
import {
  confidenceOf,
  inferPriorTheta,
  masteryEstimate,
  retentionOf,
} from "@/lib/model";

/** Indicative grade boundaries as a weighted fraction of the specification. */
const GRADE_CUTS: Array<{ grade: string; cut: number }> = [
  { grade: "A*", cut: 0.87 },
  { grade: "A", cut: 0.8 },
  { grade: "B", cut: 0.7 },
  { grade: "C", cut: 0.58 },
  { grade: "D", cut: 0.47 },
  { grade: "E", cut: 0.37 },
];

/** Standard normal CDF via the Abramowitz-Stegun erf approximation. */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Weakness component weights. They sum to 1. */
const W_MASTERY = 0.3;
const W_ABILITY = 0.28;
const W_PROBE = 0.24;
const W_DECAY = 0.18;

export interface InsightOptions {
  chapters: Chapter[];
  skills: Record<string, SkillState>;
  enabledIds: Set<string>;
  config: ModelConfig;
  now?: number;
}

export function computeInsights({
  chapters,
  skills,
  enabledIds,
  config,
  now = Date.now(),
}: InsightOptions): SkillInsight[] {
  // Mean theta over tested chapters sets the neutral point for inference.
  const tested = chapters.filter((c) => (skills[c.id]?.attempts ?? 0) > 0);
  const subjectMean = tested.length
    ? tested.reduce((s, c) => s + skills[c.id].theta, 0) / tested.length
    : 0;

  const insights: SkillInsight[] = [];

  for (const chapter of chapters) {
    const state = skills[chapter.id];
    const hasEvidence = Boolean(state && state.attempts > 0);
    const confidence = state ? confidenceOf(state) : 0;
    const retention = state ? retentionOf(state, now, config) : 1;

    // Raw mastery posterior, decayed by how long ago it was earned.
    const rawMastery = state ? masteryEstimate(state) : 0.5;
    const mastery = hasEvidence ? rawMastery * retention : 0.5;

    const theta = state?.theta ?? subjectMean;
    const masteryDeficit = 1 - mastery;
    const abilityDeficit = logistic(-theta);

    // Ability implied by prerequisites, used when there is no direct evidence.
    const priorTheta = hasEvidence ? null : inferPriorTheta(chapter.id, skills);

    // Value of probing: high when we know little, scaled by how weak the spec
    // graph says this chapter probably is. Unknown-but-probably-fine chapters
    // are deprioritised, so exploration is not wasted on them.
    const probeValue =
      (1 - confidence) *
      (priorTheta === null ? 0.3 : 0.25 + 0.75 * logistic(-priorTheta));

    // Previously-strong-but-stale skills get re-tested.
    const decayRisk = hasEvidence ? (1 - retention) * (1 - abilityDeficit) : 0;

    const weakness = clamp(
      W_MASTERY * masteryDeficit +
        W_ABILITY * abilityDeficit +
        W_PROBE * probeValue +
        W_DECAY * decayRisk,
      0,
      1,
    );

    // Mean item difficulty minus ability: positive means we have been pushing
    // this skill harder than the learner can currently absorb.
    const difficultyGap =
      hasEvidence && state && state.attempts > 0
        ? state.difficultySum / state.attempts - state.theta
        : null;

    insights.push({
      chapterId: chapter.id,
      specRef: chapter.specRef,
      title: chapter.title,
      group: chapter.group,
      subject: chapter.subject,
      skills: chapter.skills,
      enabled: enabledIds.has(chapter.id),
      severity: classify(weakness, hasEvidence, enabledIds.has(chapter.id)),
      weakness,
      mastery,
      confidence,
      learned: state?.pLearned ?? config.bkt.pInitialLearned,
      retention,
      theta,
      priorTheta,
      attempts: state?.attempts ?? 0,
      accuracy: hasEvidence && state ? state.correct / state.attempts : null,
      difficultyGap,
      recommendation: recommend(chapter, weakness, hasEvidence, difficultyGap),
      evidence: evidenceLine(state, mastery, retention, priorTheta, hasEvidence),
    });
  }

  return insights;
}

function classify(
  weakness: number,
  hasEvidence: boolean,
  enabled: boolean,
): SkillInsight["severity"] {
  if (!enabled) return "strong";
  if (!hasEvidence) return "untested";
  if (weakness >= 0.62) return "critical";
  if (weakness >= 0.5) return "weak";
  if (weakness >= 0.38) return "shaky";
  return "strong";
}

function recommend(
  chapter: Chapter,
  weakness: number,
  hasEvidence: boolean,
  difficultyGap: number | null,
): string {
  if (!hasEvidence) return `Start with a diagnostic on ${chapter.specRef} to calibrate.`;
  if (weakness >= 0.62) return `High priority. Work through ${chapter.title} methodically.`;
  if (weakness >= 0.5) return `Targeted practice on ${chapter.title}, then re-test.`;
  if (difficultyGap !== null && difficultyGap > 0.8) {
    return `Easy on the basics but stretched on harder items. Step difficulty up gradually.`;
  }
  if (weakness >= 0.38) return `Light revision of ${chapter.title} to lock it in.`;
  return `Maintain. Occasional mixed questions are enough.`;
}

function evidenceLine(
  state: SkillState | undefined,
  mastery: number,
  retention: number,
  priorTheta: number | null,
  hasEvidence: boolean,
): string {
  if (!hasEvidence || !state) {
    if (priorTheta !== null) {
      const implied = logistic(priorTheta);
      return `No attempts yet. Prerequisite ability implies about ${Math.round(
        implied * 100,
      )}% mastery, so this is an estimate rather than a measurement.`;
    }
    return "No attempts yet and no tested prerequisites. Completely unknown.";
  }
  const parts = [
    `${state.attempts} attempt${state.attempts === 1 ? "" : "s"}`,
    `${Math.round(state.correct / state.attempts * 100)}% correct`,
  ];
  if (retention < 0.92) parts.push(`retention down to ${Math.round(retention * 100)}%`);
  if (priorTheta !== null) parts.push("prerequisites imply a higher starting point");
  return parts.join(", ") + ".";
}

export function computeSkillTags(insights: SkillInsight[]): SkillTagInsight[] {
  const byTag = new Map<string, SkillTagInsight>();
  for (const insight of insights) {
    if (!insight.enabled) continue;
    for (const tag of insight.skills) {
      const existing = byTag.get(tag);
      // Weight by exam weight and by how much evidence we have for that chapter.
      const weight = 1 + insight.confidence * 2;
      if (!existing) {
        byTag.set(tag, {
          skill: tag,
          subject: insight.subject,
          mastery: insight.mastery * weight,
          confidence: insight.confidence * weight,
          attempts: insight.attempts,
          chapters: [insight.chapterId],
          weakness: insight.weakness * weight,
        });
      } else {
        existing.mastery += insight.mastery * weight;
        existing.confidence += insight.confidence * weight;
        existing.weakness += insight.weakness * weight;
        existing.attempts += insight.attempts;
        existing.chapters.push(insight.chapterId);
      }
    }
  }

  const out: SkillTagInsight[] = [];
  for (const entry of byTag.values()) {
    const totalWeight = entry.confidence + 1;
    out.push({
      skill: entry.skill,
      subject: entry.subject,
      mastery: clamp(entry.mastery / totalWeight, 0, 1),
      confidence: clamp(entry.confidence / totalWeight, 0, 1),
      attempts: entry.attempts,
      chapters: entry.chapters,
      weakness: clamp(entry.weakness / totalWeight, 0, 1),
    });
  }
  return out.sort((a, b) => b.weakness - a.weakness);
}

function gradeProbabilities(weightedMastery: number): OverallProfile["gradeProbabilities"] {
  // A logistic noise term of ~0.11 turns a point estimate into a distribution.
  const noise = 0.11;
  const boundaries = [...GRADE_CUTS].reverse();
  const probs: OverallProfile["gradeProbabilities"] = [];
  let previous = 0;
  const above: Array<{ grade: string; p: number }> = [];
  for (const b of boundaries) {
    const below = normalCdf((b.cut - weightedMastery) / noise);
    above.push({ grade: b.grade, p: below - previous });
    previous = below;
  }
  above.push({ grade: "U", p: 1 - previous });
  for (const a of above) probs.push({ grade: a.grade, probability: Math.max(0, a.p) });
  return probs;
}

export interface ProfileOptions {
  subject: SubjectId;
  chapters: Chapter[];
  insights: SkillInsight[];
  answers: Answer[];
  daily: Record<string, { attempted: number; correct: number }>;
  now?: number;
}

/**
 * Aggregate every enabled chapter into one picture of the learner.
 *
 * The weighted mastery figure blends the shrunk mastery posterior with the IRT
 * ability estimate, because either alone is misleading: a chapter you always
 * get right for trivial reasons looks strong on mastery but weak on ability,
 * and vice versa for a chapter you only ever guessed.
 */
export function buildProfile({
  subject,
  chapters,
  insights,
  answers,
  daily,
  now = Date.now(),
}: ProfileOptions): OverallProfile {
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const active = insights.filter((i) => i.enabled && byId.has(i.chapterId));
  const tested = active.filter((i) => i.attempts > 0);

  let weightTotal = 0;
  let masterySum = 0;
  let abilitySum = 0;
  let infoSum = 0;
  for (const insight of active) {
    const chapter = byId.get(insight.chapterId);
    const w = chapter?.weight ?? 1;
    weightTotal += w;
    masterySum += insight.mastery * w;
    const abilityFromMastery = (insight.mastery - 0.5) * 2;
    abilitySum += clamp(insight.theta * 0.6 + abilityFromMastery * 0.4, -1, 1) * w;
    infoSum += insight.confidence * w;
  }

  const mastery = weightTotal > 0 ? masterySum / weightTotal : 0.5;
  const ability = weightTotal > 0 ? abilitySum / weightTotal : 0;
  const confidence = weightTotal > 0 ? clamp(infoSum / weightTotal, 0, 1) : 0;

  const subjectAnswers = answers.filter((a) => byId.has(a.chapterId));
  const totalAttempts = subjectAnswers.length;
  const accuracy = totalAttempts > 0
    ? subjectAnswers.filter((a) => a.correct).length / totalAttempts
    : null;

  const coverage = active.length > 0 ? tested.length / active.length : 0;

  // Readiness blends how much is known, how well it is known, and how much of
  // the enabled specification has actually been touched.
  const readiness = Math.round(
    100 *
      clamp(
        0.45 * mastery +
          0.25 * confidence +
          0.2 * coverage +
          0.1 * (accuracy ?? mastery),
        0,
        1,
      ),
  );

  return {
    subject,
    mastery,
    confidence,
    theta: ability,
    grade: gradeProbabilities(mastery).reduce((best, p) =>
      p.probability > best.probability ? p : best,
    ).grade,
    gradeProbabilities: gradeProbabilities(mastery),
    coverage,
    chaptersTested: tested.length,
    chaptersEnabled: active.length,
    totalAttempts,
    accuracy,
    percentile: Math.round(normalCdf(ability / 1.15) * 100),
    streak: computeStreak(daily, now),
    readiness,
  };
}

function computeStreak(
  daily: Record<string, { attempted: number; correct: number }>,
  now: number,
): number {
  let streak = 0;
  const dayMs = 86_400_000;
  // Allow the streak to start today or yesterday, so it survives until bedtime.
  let cursor = Math.floor(now / dayMs);
  for (let i = 0; i < 400; i++) {
    const key = new Date(cursor * dayMs).toISOString().slice(0, 10);
    const entry = daily[key];
    if (entry && entry.attempted > 0) {
      streak++;
      cursor--;
      continue;
    }
    if (i === 0) {
      cursor--;
      continue;
    }
    break;
  }
  return streak;
}


