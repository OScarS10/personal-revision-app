import type { Answer, Chapter, ModelConfig, SkillState } from "@/lib/types";
import { DEFAULT_MODEL_CONFIG } from "@/lib/types";
import { clamp, logistic } from "@/lib/math-utils";
import { getChapter } from "@/lib/specs";

export const THETA_MIN = -4;
export const THETA_MAX = 4;

/** Prior strength for the Beta-Bernoulli mastery posterior. */
const MASTERY_PRIOR_STRENGTH = 3;
/** Retention floor: memory never decays to zero. */
const RETENTION_FLOOR = 0.35;
/** Information at which confidence reaches roughly 63%. */
const CONFIDENCE_SCALE = 4;

export function createSkillState(): SkillState {
  return {
    theta: 0,
    alpha: 1,
    beta: 1,
    pLearned: DEFAULT_MODEL_CONFIG.bkt.pInitialLearned,
    attempts: 0,
    correct: 0,
    recent: [],
    information: 0,
    lastSeen: null,
    avgDurationMs: 0,
    difficultySum: 0,
    inferredOnly: true,
  };
}

export function getSkillState(
  skills: Record<string, SkillState>,
  chapterId: string,
): SkillState {
  return skills[chapterId] ?? createSkillState();
}

/** Probability of a correct response under a 2PL model, unit discrimination. */
export function probabilityCorrect(theta: number, difficulty: number): number {
  return logistic(theta - difficulty);
}

function fisherInformation(theta: number, difficulty: number): number {
  const p = probabilityCorrect(theta, difficulty);
  return p * (1 - p);
}

/** Shrunk Beta-Bernoulli posterior mean for mastery. */
export function masteryEstimate(state: SkillState): number {
  const { alpha, beta } = state;
  return (alpha + MASTERY_PRIOR_STRENGTH * 0.5) / (alpha + beta + MASTERY_PRIOR_STRENGTH);
}

/** 0..1 trust in the mastery estimate, driven by accumulated information. */
export function confidenceOf(state: SkillState): number {
  const byInfo = 1 - Math.exp(-state.information / CONFIDENCE_SCALE);
  const byCount = 1 - Math.exp(-state.attempts / 6);
  return clamp(Math.max(byInfo, byCount * 0.75), 0, 1);
}

/**
 * Ebbinghaus retention: how much of the learnt state survives a gap. Lets the
 * app re-test stale-but-once-strong skills rather than assume they are lost.
 */
export function retentionOf(state: SkillState, now: number, cfg: ModelConfig): number {
  // Compared against null explicitly: a truthiness check would treat a
  // lastSeen of 0 as "never seen" and silently disable forgetting.
  if (state.lastSeen === null || state.attempts === 0) return 1;
  const days = Math.max(0, (now - state.lastSeen) / 86_400_000);
  const decay = Math.exp(-days / Math.max(0.5, cfg.forgettingTauDays));
  return RETENTION_FLOOR + (1 - RETENTION_FLOOR) * decay;
}

/** Bayesian Knowledge Tracing: probability the skill is now learned. */
function updateBkt(state: SkillState, correct: boolean, cfg: ModelConfig): number {
  const { pInitialLearned, pTransition, pGuess, pSlip } = cfg.bkt;
  const prior = state.attempts === 0 ? pInitialLearned : state.pLearned;
  const posterior = correct
    ? (prior * (1 - pSlip)) /
      Math.max(1e-9, prior * (1 - pSlip) + (1 - prior) * pGuess)
    : (prior * pSlip) / Math.max(1e-9, prior * pSlip + (1 - prior) * (1 - pGuess));
  return clamp(posterior + (1 - posterior) * pTransition, 0, 1);
}

/**
 * Fold a single graded answer into the model.
 *
 * Three estimators update in parallel because they fail in different ways:
 *  - IRT theta tracks ability *relative to item difficulty* and is the only one
 *    that can justify making the next item harder.
 *  - The Beta-Bernoulli posterior tracks raw mastery and stays well-behaved
 *    when the learner only ever sees easy items.
 *  - BKT tracks the transition to learnt, which answers "have I actually learned
 *    this yet" rather than "am I good at it".
 */
export function applyAnswer(
  skills: Record<string, SkillState>,
  answer: Answer,
  cfg: ModelConfig,
  now = Date.now(),
): Record<string, SkillState> {
  const next: Record<string, SkillState> = { ...skills };
  const targets = new Set<string>(answer.skillIds);
  targets.add(answer.chapterId);

  /*
    An item that does not assess the chapter must not estimate the chapter.
    Self-marked extended answers, a learner's own confidence, or a question
    about where the content sits in the specification all produce a score, and
    letting those feed theta inflates mastery for exactly the knowledge-heavy
    chapters that are hardest to measure automatically.
  */
  if (answer.assessesMastery === false) return next;

  /*
    Self-assessed extended answers are the one form of evidence that does count,
    because the alternative is not assessing the extended-answer skills at all.
    But marking your own work against a scheme runs generous in a predictable
    direction, so the weight is cut. Configurable because the size of the bias
    is an assumption, not a measured fact, and it should be visible as one.
  */
  const selfWeight = cfg.selfAssessedWeight;

  for (const chapterId of targets) {
    const primary = chapterId === answer.chapterId;
    const score = clamp(answer.score, 0, 1);
    const prev = next[chapterId] ? { ...next[chapterId] } : createSkillState();
    const info = fisherInformation(prev.theta, answer.difficulty);
    // Linked chapters see the same outcome but with reduced confidence weight.
    let weight = primary ? 1 : 0.4;
    if (answer.selfAssessed) weight *= selfWeight;

    const p = probabilityCorrect(prev.theta, answer.difficulty);
    // Information-scaled step size: strong evidence moves theta a lot, while a
    // run of easy items barely moves it at all.
    const k = (cfg.learningRate * weight) / (1 + prev.information / 2);
    const theta = clamp(prev.theta + k * (score - p), THETA_MIN, THETA_MAX);

    next[chapterId] = {
      ...prev,
      theta,
      alpha: prev.alpha + score * weight,
      beta: prev.beta + (1 - score) * weight,
      pLearned: updateBkt(prev, score >= 0.999, cfg),
      attempts: prev.attempts + (primary ? 1 : 0),
      correct: prev.correct + (primary && answer.correct ? 1 : 0),
      recent: [...prev.recent, score].slice(-8),
      information: prev.information + info * weight,
      lastSeen: primary ? now : prev.lastSeen,
      avgDurationMs: primary
        ? prev.attempts === 0
          ? answer.durationMs
          : 0.7 * prev.avgDurationMs + 0.3 * answer.durationMs
        : prev.avgDurationMs,
      difficultySum: prev.difficultySum + (primary ? answer.difficulty : 0),
      inferredOnly: primary ? false : prev.inferredOnly,
    };
  }
  return next;
}

/**
 * Ability implied by a chapter's prerequisites, for chapters with no evidence.
 *
 * This is what lets the app flag integration as a suspected weakness *before*
 * you have attempted an integration question, because weak algebra and weak
 * calculus both drag the inferred value down.
 */
export function inferPriorTheta(
  chapterId: string,
  skills: Record<string, SkillState>,
): number | null {
  const chapter = getChapter(chapterId);
  if (!chapter) return null;

  let total = 0;
  let weightSum = 0;
  for (const depId of chapter.prerequisites) {
    const dep = skills[depId];
    if (!dep || dep.attempts === 0) continue;
    const conf = confidenceOf(dep);
    total += dep.theta * conf;
    weightSum += conf;
  }
  if (weightSum === 0) return null;
  return clamp(total / weightSum, THETA_MIN, THETA_MAX);
}

/**
 * Cross-skill propagation: smooth inferred abilities along the spec graph.
 *
 * Iterates graph diffusion across the prerequisite/dependent edges. Skills with
 * direct evidence act as anchors and barely move; skills with none are pulled
 * toward the consensus of the chapters that sit next to them in the
 * specification. This is the "what else might be weak" detector: it can only
 * reach a conclusion once at least one neighbouring skill has been tested.
 */
export function propagateAbilities(
  skills: Record<string, SkillState>,
  chapters: Chapter[],
  cfg: ModelConfig,
  iterations = 3,
): Record<string, SkillState> {
  if (cfg.propagation <= 0) return skills;
  const lambda = clamp(cfg.propagation, 0, 0.9);

  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  };
  for (const c of chapters) for (const pre of c.prerequisites) link(c.id, pre);

  // Anchors are skills with real evidence; everything else is a free variable.
  const anchors = new Set<string>();
  for (const c of chapters) {
    const s = skills[c.id];
    if (s && s.attempts > 0) anchors.add(c.id);
  }
  if (anchors.size === 0) return skills;

  const field: Record<string, number> = {};
  for (const c of chapters) field[c.id] = skills[c.id]?.theta ?? 0;

  for (let iter = 0; iter < iterations; iter++) {
    const nextField: Record<string, number> = {};
    for (const c of chapters) {
      if (anchors.has(c.id)) {
        nextField[c.id] = field[c.id];
        continue;
      }
      const neighbours = [...(adjacency.get(c.id) ?? [])];
      const anchorNeighbours = neighbours.filter((n) => anchors.has(n));
      if (anchorNeighbours.length === 0) {
        nextField[c.id] = field[c.id];
        continue;
      }
      const mean =
        anchorNeighbours.reduce((sum, n) => sum + field[n], 0) / anchorNeighbours.length;
      // Saturating pull: more anchor neighbours means more confidence, never more than lambda.
      const strength = lambda * (anchorNeighbours.length / (anchorNeighbours.length + 1));
      nextField[c.id] = field[c.id] * (1 - strength) + mean * strength;
    }
    Object.assign(field, nextField);
  }

  const result: Record<string, SkillState> = { ...skills };
  for (const c of chapters) {
    if (anchors.has(c.id)) continue;
    const current = result[c.id] ?? createSkillState();
    if (current.attempts > 0) continue;
    const target = clamp(field[c.id], THETA_MIN, THETA_MAX);
    if (Math.abs(target - current.theta) < 0.01) continue;
    result[c.id] = { ...current, theta: target };
  }
  return result;
}

/**
 * Normalise theta onto 0..1 for display, relative to a mid-point of the scale.
 */
export function thetaToPercent(theta: number): number {
  return clamp((theta - THETA_MIN) / (THETA_MAX - THETA_MIN), 0, 1);
}


