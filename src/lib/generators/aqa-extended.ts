import { registerGenerators } from "./registry";
import type { Generator } from "./types";
import { choiceQuestion, step } from "./types";
import type { LevelDescriptor, MarkScheme } from "@/lib/types";

/*
  Extended-answer practice with self-marking.

  AQA Economics Paper 1 is two 10-mark data-response questions and a 30-mark
  essay. OCR CS has 8-mark and 20-mark extended questions in its synoptic paper.
  None of that is multiple choice, so the app previously had nothing it could
  offer for the format most of the marks actually sit in.

  These items are answered by writing, then marked by the learner against a real
  mark scheme. That is the only honest way to assess an essay automatically: the
  alternative, matching keywords, would reward the right words over the right
  argument, which is the opposite of what the mark scheme rewards.

  The scores are marked as self-assessed, so the ability model discounts them.
*/

function extendedQuestion(
  prompt: string,
  scheme: MarkScheme,
  opts: {
    levels?: LevelDescriptor[];
    context?: string;
    base: number;
    span: number;
    takeaway: string;
    solution?: Array<{ label: string; work: string; result?: string }>;
  },
) {
  return {
    prompt,
    answer: scheme.points.map((p) => p.label).join("; "),
    marks: scheme.totalMarks,
    format: { kind: "extended" as const, scheme, levels: opts.levels },
    solution: opts.solution ?? [
      step("How this is marked", `The scheme awards ${scheme.totalMarks} marks across ${scheme.points.length} points.`),
      step("Chain of reasoning", "Link points carry a bonus, because a linked argument outscores the same facts listed separately."),
    ],
    takeaway: opts.takeaway,
    context: opts.context,
    // Self-marked, so it is evidence, but discounted rather than trusted.
    assessesMastery: true,
    base: opts.base,
    span: opts.span,
  };
}

/** Standard AQA levels of response for a 10-mark question. */
const levels10: LevelDescriptor[] = [
  {
    level: 4,
    label: "Sound analysis",
    descriptor:
      "A well-reasoned application of the concept, with a developed chain of reasoning and a supported judgement.",
    indicativeRange: [0.62, 1],
  },
  {
    level: 3,
    label: "Reasonable analysis",
    descriptor:
      "A relevant application with some development, but the chain of reasoning is incomplete or the judgement unsupported.",
    indicativeRange: [0.37, 0.61],
  },
  {
    level: 2,
    label: "Limited analysis",
    descriptor:
      "Some relevant knowledge, applied but not developed, with no supported conclusion.",
    indicativeRange: [0.13, 0.36],
  },
  {
    level: 1,
    label: "Knowledge only",
    descriptor: "Relevant knowledge with no application, or application with no knowledge.",
    indicativeRange: [0, 0.12],
  },
];

/** Levels of response for a 20 or 30-mark essay. */
const levels30: LevelDescriptor[] = [
  {
    level: 4,
    label: "Effective essay",
    descriptor:
      "A coherent argument, well organised and substantiated, with economic concepts applied precisely and a conclusion that follows from the argument.",
    indicativeRange: [0.55, 1],
  },
  {
    level: 3,
    label: "Reasonable essay",
    descriptor:
      "A clear line of reasoning with relevant concepts applied, but evidence is limited or the argument is not fully sustained.",
    indicativeRange: [0.3, 0.54],
  },
  {
    level: 2,
    label: "Limited essay",
    descriptor:
      "Some relevant knowledge and application, but the argument is partial, poorly organised, or ends without a conclusion.",
    indicativeRange: [0.1, 0.29],
  },
  {
    level: 1,
    label: "Knowledge with little or no application",
    descriptor: "Isolated knowledge with no developed line of reasoning.",
    indicativeRange: [0, 0.09],
  },
];

// ============================================== 4.1.6 Market failure, 10 marks

const externality10: MarkScheme = {
  command: "Evaluate",
  totalMarks: 10,
  guidance:
    "A 10-mark answer needs a defined concept, an applied example with a diagram if the market is drawn, and a supported judgement. Facts alone cap this at Level 2.",
  points: [
    {
      label: "Define the market failure",
      detail:
        "A negative externality is a cost imposed on a third party that is not reflected in the price, so the market overproduces the good.",
      marks: 1,
    },
    {
      label: "Explain the welfare loss",
      detail:
        "Marginal social cost lies above marginal private cost, so the market settles where MSC = MP rather than where MSC = MB, leaving output above the efficient level and creating a deadweight loss.",
      marks: 2,
    },
    {
      label: "Apply to a specific case",
      detail:
        "Name a concrete example, such as a factory emitting pollution that imposes respiratory illness on nearby residents, and explain who gains and who bears the cost.",
      marks: 2,
    },
    {
      label: "Explain a government correction",
      detail:
        "A per-unit tax equal to marginal external cost at the efficient output shifts the private cost curve onto the social cost curve, so the market settles at the efficient level.",
      marks: 2,
    },
    {
      label: "Chain the argument together",
      detail:
        "Link the externality to the welfare loss to the correction, so the tax follows from the diagnosis rather than being asserted.",
      marks: 2,
      isLink: true,
    },
    {
      label: "Evaluate the correction",
      detail:
        "Second-best theory: if other distortions exist, a tax that corrects one may worsen another, so a perfectly corrective tax is not necessarily optimal. Also note the cost of administering and enforcing it.",
      marks: 1,
    },
  ],
};

// ================================================ 4.1.6 extended essay, 20 marks

const essayFailure: MarkScheme = {
  command: "Assess",
  totalMarks: 20,
  guidance:
    "A 20-mark question is an essay. It needs an argument sustained throughout, not a list of reasons. Most candidates lose a band by listing market failures without weighing them against each other.",
  points: [
    {
      label: "Define market failure precisely",
      detail:
        "Market failure is any situation in which the market mechanism fails to allocate resources efficiently, so a different allocation would benefit at least one party without harming another.",
      marks: 2,
    },
    {
      label: "Externality: establish and correct",
      detail:
        "Establish that an unpriced third-party cost causes overproduction, then show how a Pigouvian tax equal to marginal external cost restores the efficient output, with a diagram.",
      marks: 3,
    },
    {
      label: "Public goods: establish and correct",
      detail:
        "Non-rivalrous and non-excludable consumption produces the free-rider problem, so private markets underprovide; the correction is collective provision through taxation or regulation.",
      marks: 3,
    },
    {
      label: "Asymmetric information",
      detail:
        "Where one party knows more than the other, the price cannot signal quality, so the market misallocates; corrected by signalling, screening or regulation.",
      marks: 2,
    },
    {
      label: "Weigh the failures against each other",
      detail:
        "Compare which failure is most costly in the UK context and why, rather than treating each in isolation. This is what distinguishes a Level 4 answer from a Level 3.",
      marks: 3,
      isLink: true,
    },
    {
      label: "Second-best theory",
      detail:
        "Argue that if other distortions exist, correcting one imperfectly may leave the economy no better off, so the aim is to reduce the overall distortion rather than eliminate any single one.",
      marks: 3,
      isLink: true,
    },
    {
      label: "Reach a supported judgement",
      detail:
        "Conclude with which intervention is most appropriate and on what basis, referencing the comparative size of the failures.",
      marks: 2,
    },
    {
      label: "Use specific examples throughout",
      detail:
        "Named cases rather than generic references, applied to the concepts already defined.",
      marks: 2,
    },
  ],
};

const extendedGenerators: Generator[] = [
  {
    key: "extended-externality-10",
    base: 0.3,
    span: 1.7,
    build: ({ rng }) => {
      const cases = [
        "A manufacturing plant releases carbon dioxide into the atmosphere, and households bear the resulting climate damage.",
        "A road is congested because each driver ignores the delay they impose on others.",
        "A chemical works discharges waste into a river used by farmers for irrigation downstream.",
        "A bar operates until late, and residents nearby lose sleep because they cannot alter their plans.",
      ];
      const chosen = rng.pick(cases);
      return {
        ...extendedQuestion(
          `A chemical works discharges waste into a river used by farmers for irrigation downstream. **Evaluate** whether the market outcome for the farming activity is efficient.`,
          externality10,
          {
            base: 0.3,
            span: 1.7,
            levels: levels10,
            context: chosen,
            takeaway:
              "A negative externality overproduces the good, and the corrective tax should equal marginal external cost at the efficient output. Say so explicitly, because naming the failure without the correction caps a 10-mark answer at Level 2.",
          },
        ),
      };
    },
  },
  {
    key: "extended-market-failure-essay",
    base: 1.0,
    span: 1.8,
    build: ({ rng }) => {
      const prompt = rng.pick([
        "\"Assess\" the view that government intervention is the best way of correcting market failure in the UK economy.",
        "\"Evaluate\" whether the free market always produces an efficient allocation of resources in the UK.",
        "\"Assess\" the case for intervening in markets where third parties are affected.",
      ]);
      return {
        ...extendedQuestion(prompt, essayFailure, {
          base: 1.0,
          span: 1.8,
          levels: levels30,
          takeaway:
            "The band is decided by the weighing, not the coverage. Naming four market failures scores Level 2; comparing them and choosing between them scores Level 4.",
        }),
      };
    },
  },
  {
    key: "extended-command-recogniser",
    base: -0.4,
    span: 1.3,
    build: ({ rng }) => {
      const items = [
        {
          cmd: "Explain",
          correct: "Give reasons for why something happens, developed and applied.",
          wrong: "Weigh up both sides and reach a supported judgement.",
          why: "\"Explain\" rewards development of a single chain of reasoning, not balance. Candidates lose marks by evaluating when the command did not ask for it.",
        },
        {
          cmd: "Assess",
          correct: "Weigh up the relative importance of factors and reach a judgement.",
          wrong: "Define the term precisely and stop.",
          why: "\"Assess\" is about relative weight. A definition alone caps a 10-mark answer at Level 1 or 2.",
        },
        {
          cmd: "Evaluate",
          correct: "Judge whether a statement is true, using evidence and considering limitations.",
          wrong: "List the advantages without considering any drawbacks.",
          why: "\"Evaluate\" requires weighing, so an answer that only sets out both sides without judging has not answered the question.",
        },
        {
          cmd: "Analyse",
          correct: "Break a relationship down into its component parts and show how they interact.",
          wrong: "Summarise the main findings of the data provided.",
          why: "\"Analyse\" is about decomposition and interaction, not summary.",
        },
      ];
      const item = rng.pick(items);
      return choiceQuestion(
        `A question begins "${item.cmd} the extent to which...". What is the examiner asking for?`,
        item.correct,
        [item.wrong, "A definition and two examples.", "A diagram with correctly labelled axes."],
        {
          rng,
          marks: 2,
          solution: [step("What the command requires", item.why)],
          takeaway:
            "Read the command word first. It decides the structure of the answer and which bands are reachable.",
        },
      );
    },
  },
  {
    key: "extended-levels-of-response",
    base: 0.7,
    span: 1.4,
    build: ({ rng }) => {
      const correct =
        "It applies a concept to a real case, chains the reasoning together, and reaches a judgement the argument supports.";
      return choiceQuestion(
        "In a levels-of-response mark scheme, what distinguishes the top band from the one below it?",
        correct,
        [
          "It contains more factual detail.",
          "It includes a diagram.",
          "It is longer.",
        ],
        {
          rng,
          marks: 2,
          solution: [
            step(
              "What the bands reward",
              "AQA levels of response separate on quality of application and the chain of reasoning, not on length, detail or diagrams. A diagram that is never referred to earns nothing.",
            ),
            step(
              "Common mistake",
              "Candidates write more rather than reasoning better, so the top band stays out of reach.",
            ),
          ],
          takeaway:
            "The top band needs a developed chain and a supported judgement. Adding facts does not reach it.",
        },
      );
    },
  },
  {
    key: "extended-self-marking-advice",
    base: 0.1,
    span: 1.2,
    build: ({ rng }) => {
      const items = [
        {
          q: "When marking your own extended answer, which is the most reliable approach?",
          c: "Reread your answer against each scheme point in turn, and leave off anything you could not actually write",
          why: "Marking from memory of what you intended to write is the main source of over-marking. Reading the answer as written is the only check available without an examiner.",
        },
        {
          q: "Why is a self-assessed score treated as weaker evidence than a machine-marked one?",
          c: "Because self-marking runs generous in a predictable direction, so the bias is not random noise",
          why: "Random error would average out over many attempts. A consistent upward bias compounds, so the model discounts the weight rather than ignoring it.",
        },
      ];
      const item = rng.pick(items);
      return choiceQuestion(item.q, item.c, [
        "Tick every point, because the scheme only lists what a good answer contains.",
        "Score it as zero, because an unverified score is worthless.",
        "Ignore the scheme and use your own judgement of quality.",
      ], {
        rng,
        marks: 2,
        solution: [step("Why it matters", item.why)],
        takeaway:
          "Self-marking is a skill, not a formality. Reading the answer as written, point by point, is the difference between a useful estimate and a flattering one.",
      });
    },
  },
];

registerGenerators(
  ["econ-4.1.6", "econ-p1"],
  extendedGenerators,
);
