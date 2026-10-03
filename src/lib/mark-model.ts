import { type MarkCorpus, corpusStats } from "./mark-corpus";

/*
  A small, honest classifier over marking decisions.

  The model does one job: predict whether a given mark scheme point was awarded,
  from the answer text. It does not decide what the learner deserves.

  That distinction is the whole design. Automatic marking in this app is allowed
  only where a decision is certain, and a classifier is never certain. So the
  model's output is not a mark - it is evidence about the model itself. For each
  kind of point, the model is trained, cross-validated, and measured. If a point
  kind reaches the precision bar, that kind may be auto-marked; if it does not,
  it stays with the learner. The model therefore cannot talk its way into
  awarding marks it is not reliably right about, because its accuracy is the gate
  rather than a claim about it.

  Logistic regression over sparse unigrams, chosen because the answer is trained
  on a handful of examples and a model with more capacity would memorise them
  while looking excellent on the training set.
*/

export interface Features {
  /** Term counts, vocabulary-indexed. */
  terms: Map<number, number>;
  /** Extra dense features appended after the term block. */
  dense: number[];
}

export interface Vocabulary {
  index: Map<string, number>;
  size: number;
}

const DENSE_FEATURES = 4;
const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "it", "that", "this",
  "for", "on", "with", "as", "be", "by", "at", "from", "was", "were", "has", "have",
  "not", "but", "they", "their", "there", "which", "when", "than", "so", "if",
]);

/** Lowercased alphanumeric runs, minus stopwords. */
export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function buildVocabulary(docs: string[]): Vocabulary {
  const index = new Map<string, number>();
  for (const doc of docs) {
    for (const term of tokenise(doc)) {
      if (!index.has(term)) index.set(term, index.size);
    }
  }
  return { index, size: index.size };
}

/**
 * Turn a document into features.
 *
 * Term presence is kept as a count, because "marginal twice" means something
 * different from "marginal once" in a written answer, alongside length and
 * vocabulary breadth so the model can tell a two-word answer from a paragraph.
 */
export function featurise(text: string, vocab: Vocabulary): Features {
  const counts = new Map<number, number>();
  const tokens = tokenise(text);
  let unique = 0;
  for (const token of tokens) {
    const idx = vocab.index.get(token);
    if (idx === undefined) continue;
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
    unique++;
  }
  return {
    terms: counts,
    dense: [
      Math.min(tokens.length / 120, 1),
      Math.min(unique / 60, 1),
      tokens.length > 0 ? tokens.length / (unique || 1) : 0,
      /(because|therefore|so that|which means|this leads to|thus|hence)/.test(text.toLowerCase()) ? 1 : 0,
    ],
  };
}

function featureValue(f: Features, i: number): number {
  if (i < DENSE_FEATURES) return f.dense[i] ?? 0;
  return f.terms.get(i - DENSE_FEATURES) ?? 0;
}

/** Number of weights, one per feature plus the bias. */
export function weightCount(vocab: Vocabulary): number {
  return vocab.size + DENSE_FEATURES + 1;
}

/**
 * Score one document.
 *
 * The bias is always the final weight, so its index comes from the array length
 * rather than being passed in. Reading the wrong index here would make the bias
 * act on a random vocabulary term, which trains to a plausible-looking nonsense.
 */
function dot(w: Float64Array, f: Features): number {
  let sum = w[w.length - 1]!;
  for (let i = 0; i < DENSE_FEATURES; i++) sum += w[i]! * (f.dense[i] ?? 0);
  for (const [idx, count] of f.terms) sum += w[DENSE_FEATURES + idx]! * count;
  return sum;
}

function sigmoid(z: number): number {
  // Clamped so exp cannot overflow on a long document.
  if (z >= 0) return 1 / (1 + Math.exp(-Math.min(z, 60)));
  const e = Math.exp(Math.max(z, -60));
  return e / (1 + e);
}

export interface TrainOptions {
  epochs?: number;
  learningRate?: number;
  l2?: number;
}

export interface Weights {
  values: Float64Array;
  vocab: Vocabulary;
}

/**
 * Fit by gradient descent on log loss.
 *
 * The regulariser is not optional. With a few hundred examples and a vocabulary
 * in the tens of thousands, the unregularised fit drives every observed term to a
 * large weight and every unobserved one to zero, which scores perfectly on the
 * training set and on nothing else.
 */
export function train(features: Features[], labels: number[], vocab: Vocabulary, opts: TrainOptions = {}): Weights {
  const epochs = opts.epochs ?? 400;
  const lr = opts.learningRate ?? 0.5;
  const l2 = opts.l2 ?? 0.01;
  const n = weightCount(vocab);
  const w = new Float64Array(n);

  if (features.length === 0) return { values: w, vocab };

  for (let epoch = 0; epoch < epochs; epoch++) {
    const grad = new Float64Array(n);
    for (let i = 0; i < features.length; i++) {
      const f = features[i]!;
      const p = sigmoid(dot(w, f));
      // Gradient of log loss is (actual - predicted), scaled by the feature later.
      const err = labels[i]! - p;
      // Dense block.
      for (let d = 0; d < DENSE_FEATURES; d++) {
        grad[d]! += err * (f.dense[d] ?? 0);
      }
      // Term block.
      for (const [idx, count] of f.terms) {
        grad[DENSE_FEATURES + idx]! += err * count;
      }
      // Bias is last and is never regularised: shrinking it would bias predictions.
      grad[n - 1]! += err;
    }

    const scale = 1 / features.length;
    for (let i = 0; i < n; i++) {
      const isBias = i === n - 1;
      const decay = isBias ? 0 : l2;
      w[i] = w[i]! + lr * (grad[i]! * scale - decay * w[i]!);
    }
  }

  return { values: w, vocab };
}

export function predict(weights: Weights, f: Features): number {
  return sigmoid(dot(weights.values, f));
}

export interface Metrics {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  support: number;
}

export function metrics(pairs: Array<{ actual: number; predicted: number }>, threshold = 0.5): Metrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const { actual, predicted } of pairs) {
    const guess = predicted >= threshold ? 1 : 0;
    if (actual === 1 && guess === 1) tp++;
    else if (actual === 0 && guess === 1) fp++;
    else if (actual === 1 && guess === 0) fn++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  return {
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    f1: precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0,
    accuracy: pairs.length > 0 ? (tp + tn) / pairs.length : 0,
    support: tp + fn,
  };
}

/**
 * Stratified k-fold cross-validation.
 *
 * Stratified, because an unbalanced label would otherwise put every awarded point
 * in one fold and leave another with nothing but negatives, which flatters the
 * result exactly where it matters least.
 */
export function crossValidate(
  features: Features[],
  labels: number[],
  vocab: Vocabulary,
  folds = 5,
  opts: TrainOptions = {},
): Metrics {
  const positives = labels.filter((l) => l === 1).length;
  if (features.length < folds * 2 || positives === 0 || positives === labels.length) {
    // Too little data, or only one class: a score here would be meaningless.
    return metrics([]);
  }

  /*
    Fold assignment walks the labels once, keeping a separate running count per
    class so every fifth positive goes to fold 0 and so on. Splitting on index
    alone would put all the positives in the early folds whenever the data was
    ordered by label, which is how most exports arrive.
  */
  const testIdx = new Set<number>();
  const perClassCount = [0, 0];
  labels.forEach((label, i) => {
    const cls = label === 1 ? 0 : 1;
    if (perClassCount[cls]! % folds === 0) testIdx.add(i);
    perClassCount[cls]!++;
  });

  const trainX: Features[] = [];
  const trainY: number[] = [];
  const testX: Features[] = [];
  const testY: number[] = [];
  features.forEach((feat, i) => {
    if (testIdx.has(i)) {
      testX.push(feat);
      testY.push(labels[i]!);
    } else {
      trainX.push(feat);
      trainY.push(labels[i]!);
    }
  });
  if (trainX.length === 0) return metrics([]);

  const w = train(trainX, trainY, vocab, opts);
  const out: Array<{ actual: number; predicted: number }> = [];
  testX.forEach((feat, i) => {
    out.push({ actual: testY[i]!, predicted: predict(w, feat) });
  });

  return metrics(out);
}

/**
 * The bar a point kind has to clear before the app will mark it by itself.
 *
 * Precision, not accuracy, and not F1. Accuracy on an unbalanced label is
 * dominated by the majority class, so a model that never says "awarded" scores
 * well and is useless. Precision is the number that answers the question that
 * matters here: when the app awards a mark on its own, how often is it right.
 */
export const TRUST_PRECISION = 0.98;

/** Below this many examples, precision is not distinguishable from a guess. */
export const MIN_SUPPORT_FOR_TRUST = 40;

export interface PointTypeReport {
  label: string;
  support: number;
  cv: Metrics;
  trusted: boolean;
  reason: string;
}

export interface ModelReport {
  byLabel: PointTypeReport[];
  trusted: string[];
  /** Set when nothing could be trained at all, with the reason. */
  limitation: string | null;
}

/**
 * Train and score every kind of point, then decide what may be marked automatically.
 *
 * The trust decision is per label rather than global, because a model can be
 * reliable at spotting a named definition and hopeless at spotting an implicit
 * chain of reasoning. One number for the whole model would hide that, and the
 * conservative reading is to award nothing that was not individually measured.
 */
export function evaluateCorpus(corpus: MarkCorpus, folds = 5): ModelReport {
  const stats = corpusStats(corpus);
  const reports: PointTypeReport[] = [];

  for (const { label, total } of stats.byLabel) {
    const docs: string[] = [];
    const labels: number[] = [];
    for (const item of corpus.items) {
      for (const p of item.points) {
        if (p.label !== label) continue;
        docs.push(`${item.prompt}\n${item.reference}`);
        labels.push(p.awarded ? 1 : 0);
      }
    }
    if (docs.length === 0) continue;

    const vocab = buildVocabulary(docs);
    const features = docs.map((d) => featurise(d, vocab));
    const cv = crossValidate(features, labels, vocab, folds);

    let reason: string;
    let trusted = false;
    if (cv.support < MIN_SUPPORT_FOR_TRUST) {
      reason = `Only ${cv.support} awarded examples, below the ${MIN_SUPPORT_FOR_TRUST} needed to measure precision.`;
    } else if (cv.precision >= TRUST_PRECISION) {
      reason = `Cross-validated precision ${(cv.precision * 100).toFixed(1)}%, at or above the ${(TRUST_PRECISION * 100).toFixed(0)}% bar.`;
      trusted = true;
    } else {
      reason = `Cross-validated precision ${(cv.precision * 100).toFixed(1)}%, below the ${(TRUST_PRECISION * 100).toFixed(0)}% bar. Stays with the learner.`;
    }

    reports.push({ label, support: total, cv, trusted, reason });
  }

  const limitation =
    reports.length === 0
      ? "No labelled point types in the corpus, so no model was trained and nothing was awarded automatically."
      : reports.every((r) => !r.trusted)
        ? "No point type cleared the precision bar, so nothing is marked automatically. This is the expected result for a small or unlabelled corpus."
        : null;

  return {
    byLabel: reports.sort((a, b) => b.cv.precision - a.cv.precision),
    trusted: reports.filter((r) => r.trusted).map((r) => r.label),
    limitation,
  };
}