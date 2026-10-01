import { registerGenerators } from "./registry";
import type { Generator, QuestionBody } from "./types";
import { choiceQuestion, numericQuestion, step } from "./types";
import { round } from "@/lib/math-utils";
import { Rng } from "@/lib/rng";

/*
  AQA A-level Economics 7136, Section 4.

  The paper mix is roughly 40% numerical ("calculate"), 40% conceptual
  ("explain", "assess"), and the rest diagram or data. So most generators here
  produce numbers with a real interpretation attached, because that is what
  actually earns the marks, and the distractors target the specific
  misapplication that AQA mark schemes punish: elasticity of demand against
  elasticity of supply, PED against YED, an AR versus MR confusion, a real
  versus nominal growth mix-up.

  Every numeric answer is computed from the question data rather than
  hard-coded, so a learner cannot pass by memorising one number.
*/

// ------------------------------------------------------------------ helpers

/** Percentage change helper, rounded to `dp`. */
const pctChange = (from: number, to: number) => ((to - from) / from) * 100;

/** Point elasticity of demand from quantity and price. */
const ped = (p1: number, q1: number, p2: number, q2: number) =>
  (pctChange(q1, q2) / pctChange(p1, p2));

const money = (v: number) => round(v, 2);
const dp2 = (v: number) => round(v, 2);

function elasticityScenario(rng: Rng, kind: "inelastic" | "elastic" | "unit" = "inelastic") {
  const p1 = rng.int(8, 40);
  const q1 = rng.int(40, 200);
  const factor = kind === "inelastic" ? 0.5 : kind === "elastic" ? 1.8 : 1;
  // q moves by roughly the reciprocal of the elasticity.
  const q2 = round(q1 * factor, 0);
  const p2 = round(p1 * 1.1, 2);
  return { p1, q1, p2, q2 } satisfies { p1: number; q1: number; p2: number; q2: number };
}

// ============================================== 4.1 Micro foundations of choice

const choiceGenerators: Generator[] = [
  {
    key: "econ-opportunity-cost",
    base: -0.6,
    span: 1.6,
    build: ({ rng }) => {
      // Build a labour-learner style trade-off so the ratio is exact.
      const hoursPerA = rng.int(2, 5);
      const hoursPerB = rng.int(2, 5);
      const hours = rng.int(10, 30);

      const a = hours / hoursPerA;
      const costOfOneA = round(hoursPerA / hoursPerB, 3);

      return numericQuestion(
        `A student has **${hours}** hours available. Producing one unit of good A takes **${hoursPerA}** hours and one unit of good B takes **${hoursPerB}** hours. If all ${hours} hours are spent on good A, how many units of B are given up?`,
        round(a * costOfOneA, 2),
        {
          unit: "units of B",
          marks: 3,
          solution: [
            step("Output of A", `$\\dfrac{${hours}}{${hoursPerA}} = ${dp2(a)}$ units of A.`),
            step(
              "Opportunity cost of one A",
              `Each A costs ${hoursPerA} hours, which would have made $\\dfrac{${hoursPerA}}{${hoursPerB}} = ${costOfOneA}$ units of B.`,
            ),
            step(
              "Total sacrifice",
              `${dp2(a)} \\times ${costOfOneA} = ${round(a * costOfOneA, 2)}$ units of B.`,
            ),
          ],
          takeaway:
            "Opportunity cost is the slope of the production possibility frontier, so multiply output of A by the hours-per-unit ratio.",
        },
      );
    },
  },
  {
    key: "econ-marginal-utility",
    base: 0.1,
    span: 1.7,
    build: ({ rng }) => {
      const mu1 = rng.int(8, 16);
      const mu2 = rng.int(3, 7);
      const first = rng.int(2, 5);
      const extra = rng.int(1, 3);
      const totalGain = (first + extra) * mu2 + first * mu1;

      return numericQuestion(
        `A consumer gets **${mu1}** units of utility from the first unit of a good and **${mu2}** from each of the next few. The consumer already has **${first}** units. How much total utility is gained by consuming **${extra}** more?`,
        totalGain,
        {
          marks: 3,
          solution: [
            step(
              "Units already held",
              `${first} units are already consumed, contributing ${first} \\times ${mu1} = ${first * mu1}$ utils.`,
            ),
            step(
              "New units",
              `The next ${first + extra} units each yield ${mu2}, so ${(first + extra)} \\times ${mu2} = ${(first + extra) * mu2}$ utils.`,
            ),
            step("Total", `${first * mu1} + ${(first + extra) * mu2} = ${totalGain}$ utils.`),
          ],
          takeaway:
            "Diminishing marginal utility: each successive unit adds less than the last, so the total keeps rising but the curve flattens.",
        },
      );
    },
  },
  {
    key: "econ-detutility-trap",
    base: 0.4,
    span: 1.5,
    build: ({ rng }) => {
      const det = rng.pick([
        "A second cup of tea gives less satisfaction than the first.",
        "A student revises less effectively for their fifth hour than their first.",
        "A shop sells more ice cream on a hotter day.",
        "A worker chooses to work fewer hours once their income is sufficient.",
      ]);
      const notIt = rng.pick([
        "Opportunity cost is the value of the next best alternative forgone.",
        "Demand curves slope downwards because of the income effect.",
        "A price rise raises revenue when demand is inelastic.",
        "Scarcity means every society must ration its resources.",
      ]);
      return choiceQuestion(
        "Which of the following is **not** an implication of the principle of diminishing marginal utility?",
        notIt,
        [det, ...["Marginal utility falls as consumption rises", "MU is positive but declining"]],
        {
          rng,
          marks: 2,
          solution: [
            step("Define the principle", "Each additional unit of a good gives less extra satisfaction than the one before."),
            step(
              "Test each option",
              "Three of the four follow directly from a falling marginal utility curve. The one that does not is the odd one out.",
            ),
          ],
          takeaway: "Diminishing MU is about extra satisfaction from consumption, not about production trade-offs.",
        },
      );
    },
  },
];

// ============================================================= 4.1.1 Price

const priceGenerators: Generator[] = [
  {
    key: "econ-percentage-price-change",
    base: -0.9,
    span: 1.5,
    build: ({ rng, tier }) => {
      const from = rng.int(20, 400);
      const change = tier <= 2 ? rng.pick([5, 10, 20]) : rng.pick([12.5, 17, 23, 35, 41]);
      const dir = rng.bool() ? 1 : -1;
      const to = round(from * (1 + (dir * change) / 100), 2);
      const verb = dir > 0 ? "rises" : "falls";

      return numericQuestion(
        `The price of a good **${verb} by ${change}%** from £${from}. What is the new price?`,
        money(to),
        {
          unit: "£",
          marks: tier <= 2 ? 2 : 3,
          solution: [
            step(
              "Choose the right operation",
              `A ${change}% ${verb.slice(0, -1)} means multiplying, not adding: the change is calculated on £${from}, not on the new price.`,
            ),
            step(
              "Work it through",
              `Change = £${from} × ${round(change / 100, 4)} = £${round((from * change) / 100, 2)}.`,
            ),
            step(
              "New price",
              dir > 0
                ? `£${from} + £${round((from * change) / 100, 2)} = £${to}.`
                : `£${from} − £${round((from * change) / 100, 2)} = £${to}.`,
            ),
            step(
              "The trap",
              `Taking ${change}% of the new price instead of the old price gives a different, wrong answer. Percentage changes always apply to the base value.`,
            ),
          ],
          takeaway:
            "Percentage changes apply to the base value, so a rise is old × (1 + rate) and a fall is old × (1 − rate).",
        },
      );
    },
  },
  {
    key: "econ-inflation-deflator",
    base: 0.2,
    span: 1.6,
    build: ({ rng }) => {
      const nominal = rng.int(1200, 4000);
      const inflation = rng.pick([2, 3, 4, 5, 6, 8]);
      const deflator = 100 + inflation;
      const real = round(nominal / (deflator / 100), 2);

      return numericQuestion(
        `A good costs **£${nominal}** at current prices. The Retail Prices Index is **${deflator}** (${inflation}% inflation). What is the price in the prices of the base year, in pounds?`,
        real,
        {
          unit: "£",
          marks: 3,
          solution: [
            step("Price index formula", `Real price = nominal price \\div \\dfrac{\\text{index}}{100}$.`),
            step("Substitute", `£${nominal} \\div ${round(deflator / 100, 4)} = £${real}.`),
          ],
          takeaway:
            "A price index above 100 means the base year is cheaper, so real values are smaller than nominal ones.",
        },
      );
    },
  },
];

// ============================================================ 4.1.2 Demand

const demandGenerators: Generator[] = [
  {
    key: "econ-ped-point-elasticity",
    base: 0.0,
    span: 1.9,
    build: ({ rng, tier }) => {
      const kind = tier <= 2 ? "inelastic" : tier >= 4 ? "elastic" : "unit";
      const { p1, q1, p2, q2 } = elasticityScenario(rng, kind);
      const value = round(Math.abs(ped(p1, q1, p2, q2)), 2);

      return numericQuestion(
        `The price of a good rises from £${p1} to £${p2} and quantity demanded falls from ${q1} to ${q2} units. Calculate the price elasticity of demand.`,
        value,
        {
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step(
              "Percentage changes",
              `$\\Delta P = \\dfrac{${p2}-${p1}}{${p1}} \\times 100 = ${dp2(pctChange(p1, p2))}\\%$.`,
              "",
            ),
            step(
              "Quantity",
              `$\\Delta Q = \\dfrac{${q2}-${q1}}{${q1}} \\times 100 = ${dp2(pctChange(q1, q2))}\\%$.`,
            ),
            step(
              "Elasticity",
              `$\\dfrac{${dp2(pctChange(q1, q2))}}{${dp2(pctChange(p1, p2))}} = ${value}$.`,
            ),
          ],
          takeaway:
            "PED above 1 is elastic: revenue rises with price. Below 1 is inelastic: revenue falls as price rises.",
        },
      );
    },
  },
  {
    key: "econ-ped-classification",
    base: -0.2,
    span: 1.6,
    build: ({ rng, tier }) => {
      const { p1, q1, p2, q2 } = elasticityScenario(rng, "inelastic");
      const correct = tier >= 4 ? "A price rise would increase total revenue." : "A price rise would reduce total revenue.";

      return choiceQuestion(
        `The price of a good rises from £${p1} to £${p2} and quantity demanded falls from ${q1} to ${q2} units. What happens to total revenue?`,
        correct,
        [
          correct === "A price rise would increase total revenue."
            ? "A price rise would reduce total revenue."
            : "A price rise would increase total revenue.",
          "Total revenue is unchanged because percentage changes cancel.",
          "It cannot be determined without knowing the income elasticity of demand.",
        ],
        {
          rng,
          marks: 3,
          solution: [
            step("Classify the elasticity", `PED = ${round(Math.abs(ped(p1, q1, p2, q2)), 2)}, so demand is inelastic.`),
            step(
              "Revenue test",
              "With inelastic demand the percentage fall in quantity is smaller than the percentage rise in price, so revenue falls.",
            ),
          ],
          takeaway:
            "The revenue test only works once you have classified the elasticity. Read the sign off it, never guess.",
        },
      );
    },
  },
  {
    key: "econ-income-elasticity-classify",
    base: 0.1,
    span: 1.5,
    build: ({ rng }) => {
      const good = rng.pick([
        { name: "New train tickets", normal: false },
        { name: "Mobile phone contracts", normal: false },
        { name: "Cinema tickets", normal: false },
        { name: "Fresh fruit", normal: false },
        { name: "Cigarettes", normal: false },
        { name: "Bus tickets", normal: true },
        { name: "Broadband", normal: true },
        { name: "Electricity", normal: true },
      ]);
      const correct = good.normal ? "Normal good" : "Inferior good";
      const wrong = good.normal ? "Inferior good" : "Normal good";
      const yed = good.normal ? 1.4 : 0.6;

      return choiceQuestion(
        `Income elasticity of demand for ${good.name.toLowerCase()} is **${yed}**. Which classification is correct?`,
        correct,
        [
          wrong,
          "Substitute good",
          "Complementary good",
        ],
        {
          rng,
          marks: 2,
          solution: [
            step("Read the sign", `YED of ${yed} is positive, so demand rises as income rises.`),
            step("Magnitude", `A value of ${yed} is ${yed > 1 ? "greater than 1, so it is a normal" : "less than 1, so it is an inferior"} good.`),
          ],
          takeaway:
            "Negative YED means inferior. YED between 0 and 1 is a normal good with demand less than proportionate to income.",
        },
      );
    },
  },
  {
    key: "econ-substitute-complement",
    base: -0.3,
    span: 1.4,
    build: ({ rng }) => {
      const pairs = [
        { a: "Coffee", b: "Tea", kind: "substitute" },
        { a: "Cars", b: "Petrol", kind: "complement" },
        { a: "Printers", b: "Ink cartridges", kind: "complement" },
        { a: "Bus tickets", b: "Rail tickets", kind: "substitute" },
        { a: "Fried chicken", b: "Restaurant meals", kind: "substitute" },
        { a: "Laptops", b: "Software", kind: "complement" },
      ];
      const pair = rng.pick(pairs);
      const other = rng.pick(pairs.filter((p) => p.kind !== pair.kind));
      const correct =
        pair.kind === "substitute"
          ? `A rise in the price of ${pair.a.toLowerCase()} increases demand for ${pair.b.toLowerCase()}.`
          : `A rise in the price of ${pair.a.toLowerCase()} reduces demand for ${pair.b.toLowerCase()}.`;

      return choiceQuestion(
        `Which statement correctly describes the relationship between ${pair.a.toLowerCase()} and ${pair.b.toLowerCase()}?`,
        correct,
        [
          pair.kind === "substitute"
            ? `A rise in the price of ${pair.a.toLowerCase()} reduces demand for ${pair.b.toLowerCase()}.`
            : `A rise in the price of ${pair.a.toLowerCase()} increases demand for ${pair.b.toLowerCase()}.`,
          `The relationship is the same as between ${other.a.toLowerCase()} and ${other.b.toLowerCase()}.`,
          "They are unrelated, so a price change in one has no effect on the other.",
        ],
        {
          rng,
          marks: 2,
          solution: [
            step(
              "Define",
              pair.kind === "substitute"
                ? "Substitutes can be used in place of each other, so they move in opposite directions."
                : "Complements are consumed together, so they move in the same direction.",
            ),
          ],
          takeaway:
            "Substitutes move in opposite directions; complements move together. Cross-price elasticity sign tells you which.",
        },
      );
    },
  },
];

// ========================================================== 4.1.3 Supply

const supplyGenerators: Generator[] = [
  {
    key: "econ-supply-curve",
    base: -0.4,
    span: 1.5,
    build: ({ rng }) => {
      const good = rng.pick(["Cars", "Houses", "Restaurant meals", "Clothing", "Farm goods"]);
      return choiceQuestion(
        `What is the effect on the supply curve of ${good.toLowerCase()} if the price of a key input rises?`,
        "The supply curve shifts left, reducing supply at every price.",
        [
          "There is a movement along the existing supply curve.",
          "The supply curve shifts right, increasing supply at every price.",
          "The supply curve becomes vertical because inputs are now scarce.",
        ],
        {
          rng,
          marks: 3,
          solution: [
            step("Non-price determinant", "The price of an input is a determinant of supply, not of quantity supplied."),
            step(
              "Distinguish the curves",
              "A change in the good's own price moves along the curve; a change in input costs shifts the whole curve.",
            ),
          ],
          takeaway:
            "Own price causes a movement along a curve. Everything else shifts it. This is the most commonly dropped mark in Section 4.",
        },
      );
    },
  },
  {
    key: "econ-supply-shift-cause",
    base: -0.2,
    span: 1.5,
    build: ({ rng }) => {
      const scenarios = [
        { cause: "A fall in the price of fertiliser", effect: "right", why: "Lower input costs reduce the cost of production, raising supply at every price." },
        { cause: "A rise in the price of fertiliser", effect: "left", why: "Higher input costs raise the minimum price producers will accept, cutting supply." },
        { cause: "The introduction of a new harvesting machine", effect: "right", why: "A technology improvement raises productivity, shifting supply right." },
        { cause: "A prolonged drought", effect: "left", why: "Fewer factors of production available means less can be supplied at any price." },
        { cause: "A rise in the number of farming businesses", effect: "right", why: "More firms in the industry means greater total supply." },
      ];
      const s = rng.pick(scenarios);
      const correct =
        s.effect === "right"
          ? "Supply increases, shifting the curve to the right."
          : "Supply decreases, shifting the curve to the left.";

      return choiceQuestion(
        `${s.cause}. What is the effect on supply?`,
        correct,
        [
          s.effect === "right" ? "Supply decreases, shifting the curve to the left." : "Supply increases, shifting the curve to the right.",
          "There is a movement down the existing supply curve.",
          "Equilibrium price rises but equilibrium quantity is unchanged.",
        ],
        {
          rng,
          marks: 3,
          solution: [step("Identify the determinant", s.why)],
          takeaway: "Any non-price determinant of supply works through the cost of production or the number of sellers.",
        },
      );
    },
  },
  {
    key: "econ-supply-elasticity-shape",
    base: 0.1,
    span: 1.6,
    build: ({ rng, tier }) => {
      const scenarios = [
        {
          good: "agricultural land",
          effect: "perfectly inelastic",
          why: "The land exists in a fixed quantity, so its supply cannot respond to price at all.",
        },
        {
          good: "labour in the short run",
          effect: "relatively inelastic",
          why: "Most workers have already committed their hours, so the supply responds only slowly.",
        },
        {
          good: "manufactured goods in the long run",
          effect: "perfectly elastic",
          why: "With time, firms can enter and leave in response to profit, so any quantity is supplied at the going price.",
        },
        {
          good: "fish stocks",
          effect: "relatively inelastic",
          why: "The stock is limited by nature and cannot be increased quickly, even at a high price.",
        },
      ];
      const s = rng.pick(scenarios);

      return choiceQuestion(
        `Which of these has a supply curve closest to **${s.effect}**?`,
        s.good,
        ["manufactured goods in the long run", "agricultural land", "fish stocks"].filter(
          (o) => o !== s.good,
        ),
        {
          rng,
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step(
              "Recall the shapes",
              "Perfectly inelastic supply is vertical: the same quantity at every price. Perfectly elastic supply is horizontal: any quantity at one price.",
            ),
            step("Apply", s.why),
            step(
              "The mechanism",
              "Elasticity of supply depends on the time period and whether the factor can be varied, not on the good itself.",
            ),
          ],
          takeaway:
            "A vertical supply curve means price does not affect the quantity supplied at all, so demand alone then determines the price.",
        },
      );
    },
  },
  {
    key: "econ-supply-movement-shift",
    base: 0.3,
    span: 1.5,
    build: ({ rng }) => {
      const changes = [
        { n: "Extension of the existing supply curve", effect: "A movement down the curve", why: "More of the same product is supplied in response to a higher own price." },
        { n: "An inward shift of the supply curve", effect: "Less is supplied at every price", why: "A cost rise or a fall in the number of sellers reduces supply at any given price." },
        { n: "A movement along the supply curve", effect: "The same curve is used, showing a different quantity at the same price", why: "Only the quantity supplied changes, not willingness to supply at each price." },
        { n: "A decrease in demand", effect: "Demand shifts left", why: "A determinant of demand, not supply at all." },
      ];
      const chosen = rng.pick(changes);
      const wrong = changes.filter((c) => c.n !== chosen.n);

      return choiceQuestion(
        `In a competitive market, there is ${chosen.n}. What does this do to the supply curve?`,
        chosen.effect,
        [...wrong.map((w) => w.effect), "It shifts the demand curve instead"],
        {
          rng,
          marks: 3,
          solution: [
            step("Classify the change", chosen.why),
            step(
              "Movement or shift",
              "A change in the good's own price moves along the curve. A change in any other determinant shifts it.",
            ),
          ],
          takeaway:
            "Own price causes movement; everything else causes a shift. Mixing those two up is the most common Section 4.1 error.",
        },
      );
    },
  },
];

// ===================================================== 4.1.4 Market equilibrium

const equilibriumGenerators: Generator[] = [
  {
    key: "econ-equilibrium-numeric",
    base: 0.1,
    span: 1.9,
    build: ({ rng, tier }) => {
      // Supply: Qs = a + bP. Demand: Qd = c - dP. Solve exactly, then choose
      // round numbers so the printed equilibrium is clean.
      const slope = rng.pick([2, 3, 4, 5]);
      const intercept = rng.int(20, 60);
      const demandIntercept = rng.int(80, 200);

      const pStar = round((demandIntercept - intercept) / (slope * 2), 2);
      const qStar = round(intercept + slope * pStar, 2);

      if (pStar <= 0 || !Number.isFinite(qStar)) {
        return equilibriumFallback(rng, tier);
      }

      return numericQuestion(
        `The supply curve for a good is $Q_s = ${intercept} + ${slope}P$ and the demand curve is $Q_d = ${demandIntercept} - ${slope}P$, where $P$ is in pounds. Find the equilibrium price.`,
        pStar,
        {
          unit: "£",
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step("At equilibrium", `$Q_s = Q_d$, so the two expressions are equal.`),
            step(
              "Solve",
              `${intercept} + ${slope}P = ${demandIntercept} - ${slope}P \\Rightarrow ${slope * 2}P = ${demandIntercept - intercept} \\Rightarrow P = ${pStar}.`,
            ),
            step("Check", `Substituting back gives $Q = ${qStar}$ units, which is the equilibrium quantity.`),
          ],
          takeaway:
            "Equilibrium is where the two curves intersect. Set the expressions equal rather than drawing a picture and reading off.",
        },
      );
    },
  },
  {
    key: "econ-equilibrium-shift",
    base: 0.3,
    span: 1.7,
    build: ({ rng, tier }) => {
      const cause = rng.pick([
        { text: "Costs of production fall", move: "d", pd: "fall", qd: "rise" },
        { text: "Consumer incomes rise, and the good is a normal good", move: "s", pd: "rise", qd: "rise" },
        { text: "A tax is imposed on sellers", move: "s", pd: "rise", qd: "fall" },
        { text: "A substitute good becomes much cheaper", move: "d", pd: "fall", qd: "fall" },
        { text: "The number of sellers in the industry increases", move: "s", pd: "fall", qd: "rise" },
      ]);
      const correct = `Equilibrium price will ${cause.pd} and equilibrium quantity will ${cause.qd}.`;
      const wrongDir = `Equilibrium price will ${cause.pd === "rise" ? "fall" : "rise"} and equilibrium quantity will ${cause.qd === "rise" ? "fall" : "rise"}.`;

      return choiceQuestion(
        `${cause.text} in a competitive market for a good. What happens to equilibrium?`,
        correct,
        [
          wrongDir,
          "Equilibrium price rises and equilibrium quantity rises.",
          "Equilibrium price falls and equilibrium quantity falls.",
        ].filter((w) => w !== correct),
        {
          rng,
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step(
              "Which curve moves",
              cause.move === "s"
                ? "A determinant of supply has changed, so supply shifts."
                : "A determinant of demand has changed, so demand shifts.",
            ),
            step("Trace the shift", `Demand shifting ${cause.move === "d" ? "right" : "left"} and supply ${cause.move === "s" ? "right" : "left"} gives price ${cause.pd}ing and quantity ${cause.qd}ing.`),
          ],
          takeaway:
            "Work out which curve moves first. An increase in supply means lower price and higher quantity; an increase in demand means both rise.",
        },
      );
    },
  },
];

function equilibriumFallback(rng: Rng, tier: 1 | 2 | 3 | 4 | 5): QuestionBody {
  const surplus = rng.int(200, 2000);
  const shift = rng.int(100, 900);
  return numericQuestion(
    `At the current equilibrium price of a market there is a surplus of **${surplus}** units. A fall in demand shifts the demand curve left by an amount equivalent to **${shift}** units. By how much does the equilibrium price change, in pounds, if each 100 units of surplus clears the market at £1?`,
    round(shift / 100, 2),
    {
      unit: "£",
      marks: tier >= 4 ? 3 : 2,
      solution: [
        step("Net surplus", `${surplus} - ${shift} = ${surplus - shift} units of surplus remain.`),
        step("Convert to price", `$\\dfrac{${surplus - shift}}{100} = ${round(shift / 100, 2)}$ pounds of downward pressure on price.`),
      ],
      takeaway: "A surplus pushes price down until it clears; a shortage pushes it up.",
    },
  );
}

// ===================================================== 4.1.5 Price elasticity of demand

const elasticityOfDemandGenerators: Generator[] = [
  {
    key: "econ-ped-revenue-table",
    base: 0.5,
    span: 2.0,
    build: ({ rng, tier }) => {
      const price = rng.int(10, 30);
      const qty = rng.int(50, 150);
      const change = rng.pick([10, 20, 25]);
      const up = rng.bool();
      const p2 = round(price * (1 + (up ? change : -change) / 100), 2);
      const q2 = round(qty * (1 + (up ? -change : change) / 100), 2);
      const rev1 = price * qty;
      const rev2 = round(p2 * q2, 2);

      return numericQuestion(
        `A good sells at £${price} with ${qty} units sold per day. Its price ${up ? "rises" : "falls"} by ${change}% and quantity demanded changes by the same percentage in the opposite direction. What is the new daily revenue in pounds?`,
        rev2,
        {
          unit: "£",
          dp: 0,
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step("Old revenue", `£${price} \\times ${qty} = £${rev1}.`),
            step("New price", `£${price} \\times ${round(1 + (up ? change : -change) / 100, 4)} = £${p2}.`),
            step("New quantity", `${qty} \\times ${round(1 + (up ? -change : change) / 100, 4)} = ${q2} units.`),
            step("New revenue", `£${p2} \\times ${q2} = £${rev2}.`),
          ],
          takeaway:
            "With unit elasticity, equal percentage changes in price and quantity leave revenue unchanged. That is the definition of unit elasticity.",
        },
      );
    },
  },
  {
    key: "econ-ped-extremes",
    base: -0.4,
    span: 1.5,
    build: ({ rng }) => {
      const good = rng.pick([
        { name: "Insulin", correct: "Perfectly inelastic", why: "There is no substitute for insulin, so quantity demanded does not respond at all to price." },
        { name: "Bread for a homeless person", correct: "Perfectly inelastic", why: "It is a necessity with no realistic substitute available to this consumer." },
        { name: "Cigarettes", correct: "Very inelastic", why: "Addiction keeps demand unresponsive to price over the short run." },
        { name: "Fresh milk", correct: "Inelastic", why: "A daily necessity with many close substitutes but a small share of budget." },
        { name: "Holidays abroad", correct: "Elastic", why: "A large share of budget, discretionary, and postponed when prices rise." },
        { name: "New cars", correct: "Elastic", why: "Big-ticket, deferrable and with many substitutes." },
      ]);
      return choiceQuestion(
        `Demand for ${good.name.toLowerCase()} is typically described as which of the following?`,
        good.correct,
        ["Perfectly elastic", "Unit elastic", "Elastic"],
        {
          rng,
          marks: 3,
          solution: [
            step("Identify the determinants", "Share of income, availability of substitutes, and whether the purchase can be deferred."),
            step("Classify", good.why),
          ],
          takeaway:
            "Essentials with no substitutes are inelastic; discretionary big-ticket items are elastic.",
        },
      );
    },
  },
  {
    key: "econ-yed-necessity-luxury",
    base: 0.2,
    span: 1.4,
    build: ({ rng }) => {
      const yed = round(rng.float(0.2, 2.2), 2);
      const correct = yed > 1 ? "Normal good, income elastic" : "Normal good, income inelastic";
      return choiceQuestion(
        `The income elasticity of demand for a good is **${yed}**. Which statement is correct?`,
        correct,
        [
          yed > 1 ? "Normal good, income inelastic" : "Normal good, income elastic",
          yed > 1 ? "Inferior good" : "Luxury good",
          "It is a Giffen good because the income elasticity is positive.",
        ],
        {
          rng,
          marks: 2,
          solution: [
            step("Sign", `YED of ${yed} is positive, so it is a normal good.`),
            step("Size", yed > 1 ? "Above 1, so demand rises more than proportionately." : "Below 1, so demand rises less than proportionately."),
          ],
          takeaway:
            "Inferior goods have negative YED. A Giffen good is defined by a positive income effect outweighing a negative substitution effect, which is rare.",
        },
      );
    },
  },
];

// ============================================ 4.1.6 Price elasticity of supply

const elasticityOfSupplyGenerators: Generator[] = [
  {
    key: "econ-pes-timeless",
    base: -0.1,
    span: 1.5,
    build: ({ rng }) => {
      const scenarios = [
        { good: "fresh milk", why: "Perishable and produced on a fixed cycle, so supply cannot respond quickly to price." },
        { good: "hotel rooms", why: "Rooms already exist for tonight; the stock is fixed in the short run." },
        { good: "land in central London", why: "Fixed supply and no ability to expand the stock in the short run." },
        { good: "strawberries", why: "Perishable, so a price rise cannot induce more output this season." },
        { good: "manufactured furniture", why: "Factories can scale output over months, so supply is elastic in the short run." },
      ];
      const s = rng.pick(scenarios);
      return choiceQuestion(
        `Which of these is most likely to have an **inelastic** price elasticity of supply in the short run?`,
        s.good,
        ["manufactured furniture", "fashion clothing", "electronics"],
        {
          rng,
          marks: 3,
          solution: [
            step("Elasticity of supply depends on time", "The longer the time period, the more elastic supply becomes as firms can adjust all inputs."),
            step("Apply", s.why),
          ],
          takeaway:
            "Inelastic short-run supply comes from perishability, fixed stock, or land that cannot be created.",
        },
      );
    },
  },
  {
    key: "econ-pes-numeric",
    base: 0.3,
    span: 1.6,
    build: ({ rng, tier }) => {
      const q1 = rng.int(200, 600);
      const q2 = round(q1 * 1.25, 0);
      const p1 = rng.int(8, 20);
      const p2 = round(p1 * 1.2, 2);
      const value = round(Math.abs(pctChange(q1, q2) / pctChange(p1, p2)), 2);

      return numericQuestion(
        `A firm's output rises from ${q1} to ${q2} units when the price rises from £${p1} to £${p2}. Calculate the price elasticity of supply.`,
        value,
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Percentage change in price", `$\\dfrac{${p2}-${p1}}{${p1}} \\times 100 = ${dp2(pctChange(p1, p2))}\\%$.`),
            step("Percentage change in output", `$\\dfrac{${q2}-${q1}}{${q1}} \\times 100 = ${dp2(pctChange(q1, q2))}\\%$.`),
            step("PES", `${dp2(pctChange(q1, q2))} \\div ${dp2(pctChange(p1, p2))} = ${value}.`),
          ],
          takeaway: "PES uses exactly the same formula as PED, but the denominator is the output response.",
        },
      );
    },
  },
];

// ============================================================== 4.1.7 Costs

const costGenerators: Generator[] = [
  {
    key: "econ-cost-revenue-profit",
    base: -0.5,
    span: 1.6,
    build: ({ rng, tier }) => {
      const q = rng.int(20, 200);
      const price = rng.int(5, 40);
      const varCost = rng.int(2, Math.max(3, price - 2));
      const fixed = rng.int(100, 2000);
      const tc = fixed + q * varCost;

      return numericQuestion(
        `A firm sells **${q}** units at £${price} each. Its total fixed costs are £${fixed} and its variable cost per unit is £${varCost}. Calculate the firm's total cost of production in pounds.`,
        tc,
        {
          unit: "£",
          dp: 0,
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Fixed costs", "Fixed costs do not change with output, so they are added in full."),
            step("Variable costs", `${q} \\times £${varCost} = £${q * varCost}.`),
            step("Total cost", `£${fixed} + £${q * varCost} = £${tc}.`),
          ],
          takeaway:
            "Total cost = fixed cost + variable cost. Watch out for questions asking for total cost when the real target is profit.",
        },
      );
    },
  },
  {
    key: "econ-mc-arnc",
    base: 0.4,
    span: 1.7,
    build: ({ rng, tier }) => {
      const varCost = rng.int(4, 20);
      const fixed = rng.int(500, 5000);
      const q = rng.int(50, 400);
      const afc = round(fixed / q, 2);
      const atc = round(varCost + afc, 2);

      return numericQuestion(
        `A firm has fixed costs of £${fixed}, a variable cost of £${varCost} per unit, and produces ${q} units. Calculate the average total cost per unit.`,
        atc,
        {
          unit: "£",
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step("Average fixed cost", `$\\text{AFC} = \\dfrac{£${fixed}}{${q}} = £${afc}$.`),
            step("Average total cost", `$\\text{ATC} = \\text{AVC} + \\text{AFC} = £${varCost} + £${afc} = £${atc}$.`),
          ],
          takeaway:
            "ATC = AVC + AFC. As output rises, AFC falls, so ATC falls even though AVC is unchanged. That is falling average cost.",
        },
      );
    },
  },
  {
    key: "econ-arnc-shape",
    base: 0.2,
    span: 1.6,
    build: ({ rng }) => {
      const concept = rng.pick([
        {
          q: "Why does a firm's average total cost curve normally fall then rise as output increases?",
          correct: "Spreading fixed costs over more units lowers average cost, until rising marginal costs dominate.",
          why: "Economies of scale operate first, then diminishing returns to variable inputs set in.",
        },
        {
          q: "A firm is operating at a loss in the short run. What should it check before shutting down?",
          correct: "Whether average variable cost is below average revenue, since fixed costs are sunk.",
          why: "Shutdown depends on covering variable costs; fixed costs must be paid either way.",
        },
        {
          q: "Why can a firm make a profit in the short run even though the industry is in long-run equilibrium?",
          correct: "In the long run all factors are variable, so short-run profits attract entry and are competed away.",
          why: "Short-run barriers such as fixed capital let incumbents earn supernormal profit temporarily.",
        },
      ]);
      return choiceQuestion(concept.q, concept.correct, [
        "Because fixed costs are zero in the short run, so all revenue becomes profit.",
        "Because demand always rises when a firm expands its output.",
        "Because the government sets a profit ceiling that firms may keep.",
      ], {
        rng,
        marks: 3,
        solution: [step("Reason", concept.why)],
        takeaway: "Distinguish short run (some factors fixed) from long run (all variable) before answering any cost question.",
      });
    },
  },
];

// ============================================================== 4.1.8 Revenue

const revenueGenerators: Generator[] = [
  {
    key: "econ-marginal-revenue",
    base: 0.5,
    span: 1.8,
    build: ({ rng, tier }) => {
      // Total revenue schedule with rising then falling MR, as a firm
      // approaching capacity experiences.
      const base = rng.int(40, 90);
      const unit = rng.int(2, 6);
      const q1 = rng.int(5, 12);
      const price1 = base - unit * q1;
      const price2 = price1 - rng.int(1, 3);
      const mr = round(price2 - price1, 2);

      return numericQuestion(
        `A firm can sell **${q1}** units at £${price1} each. To sell one more unit it must cut the price to £${price2}. What is the marginal revenue from that extra unit?`,
        mr,
        {
          unit: "£",
          dp: 0,
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Definition", "MR is the extra revenue from one more unit, which nets off the price cut on all units already sold."),
            step("Here", `Revenue rises by £${price1} on the new unit but falls on the ${q1} existing units, giving $MR = £${price2} - £${price1} = £${mr}$.`),
          ],
          takeaway:
            "MR equals price only for a perfectly competitive firm. Any firm facing a downward-sloping demand curve has MR below price.",
        },
      );
    },
  },
  {
    key: "econ-elasticity-revenue-link",
    base: -0.2,
    span: 1.6,
    build: ({ rng }) => {
      const scenarios = [
        { e: "PED is 2.5", rev: "increase", why: "Elastic demand, so the quantity gain outweighs the price rise." },
        { e: "PED is 0.4", rev: "decrease", why: "Inelastic demand, so the quantity loss outweighs the price rise." },
        { e: "PED is exactly 1", rev: "stay the same", why: "Unit elasticity means the percentage changes cancel exactly." },
        { e: "PED is 1.8", rev: "increase", why: "Elastic demand, so raising price raises revenue." },
      ];
      const s = rng.pick(scenarios);
      const correct = `Total revenue will ${s.rev}.`;
      return choiceQuestion(
        `A firm faces ${s.e.toLowerCase()} and raises its price. What happens to total revenue?`,
        correct,
        [
          s.rev === "increase" ? "Total revenue will decrease." : "Total revenue will increase.",
          s.rev === "stay the same" ? "Total revenue will increase." : "Total revenue will stay the same.",
          "Total revenue always increases when price rises, whatever the elasticity.",
        ].filter((x) => x !== correct),
        {
          rng,
          marks: 3,
          solution: [step("Apply the revenue test", s.why)],
          takeaway:
            "This single link between elasticity and revenue is worth memorising precisely: it appears in almost every Section 4 paper.",
        },
      );
    },
  },
];

// ========================================================= 4.1.9 Market failure

const failureGenerators: Generator[] = [
  {
    key: "econ-externality",
    base: -0.1,
    span: 1.7,
    build: ({ rng }) => {
      const cases = [
        { q: "A factory emits pollution into a river used by farmers downstream.", c: "Negative externality", why: "The cost of pollution is borne by third parties, not the firm causing it." },
        { q: "A factory's operations raise the value of nearby houses.", c: "Positive externality", why: "Third parties gain from the firm's activity without paying for it." },
        { q: "A firm pays a lower private cost than the true social cost of its production.", c: "Negative externality", why: "Private cost understates social cost, so the market overproduces." },
        { q: "Vaccination reduces the chance of disease for people the vaccinated person never meets.", c: "Positive externality", why: "The benefit accrues to others, so private demand is below social demand." },
      ];
      const item = rng.pick(cases);
      return choiceQuestion(item.q, item.c, ["Positive externality", "Substitute good", "Public good"], {
        rng,
        marks: 2,
        solution: [
          step("Who is affected", item.why),
          step(
            "Direction",
            item.c === "Negative externality"
              ? "Market outcome is excessive; the corrective answer is a tax."
              : "Market outcome is insufficient; the corrective answer is a subsidy.",
          ),
        ],
        takeaway:
          "An externality is a cost or benefit to a third party. Negative means overproduction, positive means underproduction.",
      });
    },
  },
  {
    key: "econ-public-good",
    base: 0.2,
    span: 1.5,
    build: ({ rng }) => {
      const goods = [
        { g: "Street lighting", c: "Public good", why: "Non-rivalrous and non-excludable." },
        { g: "A national defence force", c: "Public good", why: "One person being protected does not reduce another's protection." },
        { g: "A streetlight installed in front of my house", c: "Public good", why: "Excludable by location once built, so it is a club good." },
        { g: "Cable television", c: "Quasi-rival", why: "Rival in consumption and technically excludable, so a club good." },
        { g: "Clean air", c: "Public good", why: "Non-rivalrous, and exclusion is prohibitively costly." },
      ];
      const item = rng.pick(goods);
      return choiceQuestion(
        `Which classification best fits ${item.g.toLowerCase()}?`,
        item.c,
        ["Private good", "Club good", "Common resource"],
        {
          rng,
          marks: 2,
          solution: [
            step("Rivalrous?", item.why),
            step("Free rider", "Because exclusion is impossible or costly, non-payers still consume it, so markets underprovide."),
          ],
          takeaway: "Public goods are non-rivalrous and non-excludable. That combination is what produces the free-rider problem.",
        },
      );
    },
  },
  {
    key: "econ-market-failure-correction",
    base: 0.4,
    span: 1.7,
    build: ({ rng, tier }) => {
      const items = [
        {
          q: "A chemical plant creates a large negative externality. What is the standard market-based correction?",
          c: "A per-unit tax set equal to the marginal external cost at the equilibrium quantity.",
          why: "A tax equal to the external cost shifts the private cost curve onto the social cost curve.",
        },
        {
          q: "Firms can profitably release their own emissions data, which is useful to rivals. Why do they not always do so?",
          c: "Information is a public good, so each firm can free-ride on others' disclosure.",
          why: "The benefit of one firm's disclosure goes to competitors, so private benefit falls short of social benefit.",
        },
        {
          q: "Why can the free-rider problem prevent a market for a public good from forming?",
          c: "Each consumer expects others to pay, so nobody volunteers and demand stays below the cost of supply.",
          why: "Non-excludability means non-payers still benefit, so individual incentives do not support collective provision.",
        },
      ];
      const item = rng.pick(items);
      return choiceQuestion(item.q, item.c, [
        "A subsidy equal to marginal external benefit.",
        "A minimum wage set above the equilibrium wage.",
        "A quota limiting the number of producers.",
      ], {
        rng,
        marks: tier >= 4 ? 4 : 3,
        solution: [
          step("Identify the failure", item.why),
          step("Correction", "The policy has to move private cost or private benefit towards the social values."),
        ],
        takeaway:
          "Externalities are corrected with taxes or subsidies; information and public goods suffer from free-riding, which needs collective provision.",
      });
    },
  },
];

// =============================================== 4.2 Behavioural economics

const behaviouralGenerators: Generator[] = [
  {
    key: "econ-rationality-bias",
    base: 0.1,
    span: 1.6,
    build: ({ rng }) => {
      const items = [
        { b: "A shopper buys the first pasta on the shelf because it is closest, not because it is cheapest.", c: "Substitution effect", why: "Effort and salience change the chosen bundle away from the cheapest option." },
        { b: "People choose the cheaper option even when the dearer one is objectively better value.", c: "Substitution effect", why: "Relative prices attract attention and change preferences over what is preferred." },
        { b: "A person keeps spending more than they earn because the purchase feels good right now.", c: "Present bias", why: "Immediate utility is weighted more heavily than delayed consequences." },
        { b: "Consumers are influenced by the prestige of a brand rather than its performance.", c: "Social preference", why: "Choices reflect social image as well as functional characteristics." },
        { b: "Someone dismisses evidence that contradicts their existing view.", c: "Confirmation bias", why: "People seek and favour information that supports prior beliefs." },
        { b: "A firm anchors its price on a deliberately high figure so that the usual price looks cheap.", c: "Anchoring", why: "An initial figure biases subsequent judgement of a related figure." },
      ];
      const item = rng.pick(items);
      return choiceQuestion(
        `Which behavioural explanation fits this situation? ${item.b}`,
        item.c,
        ["Risk aversion", "Short-sightedness", "Ignorance of the price"],
        {
          rng,
          marks: 3,
          solution: [
            step("Identify", item.why),
            step(
              "Contrast",
              "Behavioural economics keeps the rational model as a benchmark and isolates the specific departure from it.",
            ),
          ],
          takeaway: "Name the bias precisely; AQA awards the identification mark separately from the explanation.",
        },
      );
    },
  },
  {
    key: "econ-utility-theory",
    base: 0.5,
    span: 1.8,
    build: ({ rng, tier }) => {
      // Total utility from a schedule of marginal utilities, then the MU of the
      // last unit, which is where the diminishing-returns verdict is read.
      const mus: number[] = [];
      let mu = rng.int(9, 14);
      for (let i = 0; i < 5; i++) {
        mus.push(mu);
        mu = round(mu - rng.float(1, 2.5), 1);
      }
      const total = round(mus.reduce((a, b) => a + b, 0), 1);
      const muOfFourth = mus[3]!;

      return numericQuestion(
        `A consumer's marginal utility from successive units of a good is ${mus.map((m) => m.toFixed(1)).join(", ")}. What is the marginal utility of the fourth unit?`,
        muOfFourth,
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Read across", `The fourth entry in the list is ${muOfFourth.toFixed(1)}.`),
            step("Total utility", `Adding all five gives ${total}, so the utility level rises but by less each time.`),
          ],
          takeaway:
            "Marginal utility is the value of one more unit, not the running total. Reading the wrong column is the usual error.",
        },
      );
    },
  },
];

// ==================================================== 4.3 Market structures

const structureGenerators: Generator[] = [
  {
    key: "econ-market-share",
    base: -0.8,
    span: 1.4,
    build: ({ rng }) => {
      const firms = rng.int(3, 5);
      const shares: number[] = [];
      let remaining = 100;
      for (let i = 0; i < firms - 1; i++) {
        const s = rng.int(10, 40);
        shares.push(s);
        remaining -= s;
      }
      shares.push(remaining);
      const top = Math.max(...shares);
      const hhi = shares.reduce((sum, s) => sum + s * s, 0);
      const correct = top > 50 ? "Dominant firm" : "Tight oligopoly";

      return choiceQuestion(
        `A market has ${firms} firms with market shares of ${shares.map((s) => `${s}%`).join(", ")}. Which structure best describes it?`,
        correct,
        [top > 50 ? "Tight oligopoly" : "Dominant firm", "Perfect competition", "Monopolistic competition"],
        {
          rng,
          marks: 3,
          solution: [
            step(
              "Concentration",
              `The Herfindahl index is ${hhi}, and the largest firm holds ${top}%, which is ${top > 50 ? "more than half the market" : "a large but not dominant share"}.`,
            ),
            step("Classify", top > 50 ? "A firm above 50% is dominant; a few firms with high barriers is oligopoly." : "A few large firms and significant barriers indicate a tight oligopoly."),
          ],
          takeaway:
            "Dominance is a share test (over 50%); oligopoly is about the number of firms and the barriers between them.",
        },
      );
    },
  },
  {
    key: "econ-perfect-competition",
    base: -0.5,
    span: 1.5,
    build: ({ rng }) => {
      const features = [
        { f: "Many small buyers and sellers", c: "Many firms, none able to influence price" },
        { f: "Free entry and exit", c: "No barriers to entry or exit" },
        { f: "Perfect information", c: "Buyers and sellers know all prices and quality" },
        { f: "Homogeneous product", c: "An identical product, so no branding advantage" },
      ];
      const item = rng.pick(features);
      return choiceQuestion(
        `Which assumption of perfect competition is illustrated by: ${item.f.toLowerCase()}?`,
        item.c,
        [
          "Firms are price makers facing a downward-sloping demand curve",
          "There are significant barriers to entry",
          "Product differentiation gives firms some market power",
        ],
        {
          rng,
          marks: 2,
          solution: [
            step("Perfect competition", "Many small firms, homogeneous product, perfect information, free entry and exit."),
            step("Consequence", "Each firm is a price taker, so its demand curve is perfectly elastic."),
          ],
          takeaway: "Under perfect competition, profit maximisation means producing where P = MC, and long-run profit is zero.",
        },
      );
    },
  },
  {
    key: "econ-oligopoly-game",
    base: 0.5,
    span: 1.8,
    build: ({ rng, tier }) => {
      const q1 = rng.int(20, 50);
      const q2 = rng.int(20, 50);
      const gain = rng.int(4, 20);
      return choiceQuestion(
        `Firm A produces ${q1} units and firm B produces ${q2} units. If B cuts its price, A can match it and gain **${gain}** units of sales, or hold its price and lose them. A matches the price cut. What game is being played?`,
        "A dominant-strategy game, because matching is A's best response whether or not B cuts again",
        [
          "A Pareto game, because both firms are better off",
          "A prisoner's dilemma, because A would be better off holding its price",
          "A non-cooperative game, because the firms never communicate",
        ],
        {
          rng,
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step(
              "Check each branch",
              "If B cuts again, A matches and keeps the sales. If B holds, A matches and loses the ${gain} units. Matching is better in both branches.",
            ),
            step(
              "Name the game",
              "A best response that holds regardless of the rival's action is a dominant strategy, which is the non-collusive equilibrium of a prisoner's dilemma.",
            ),
          ],
          takeaway:
            "Non-collusive oligopoly can be a prisoner's dilemma, but the decision rule is about dominant strategies, not about Pareto efficiency.",
        },
      );
    },
  },
  {
    key: "econ-monopoly-price",
    base: 0.3,
    span: 1.7,
    build: ({ rng, tier }) => {
      const mc = rng.int(4, 20);
      const elasticity = round(rng.float(1.6, 4), 1);
      const price = round((mc * elasticity) / (elasticity - 1), 2);
      return numericQuestion(
        `A monopolist's marginal cost is constant at £${mc} and its price elasticity of demand is ${elasticity}. Using the Lerner condition, calculate the profit-maximising price.`,
        price,
        {
          unit: "£",
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step("Lerner index", "$P - MC = \\dfrac{P}{|e_d|}$, so $\\dfrac{P - MC}{P} = \\dfrac{1}{|e_d|}$."),
            step("Rearrange", `$P = \\dfrac{MC \\times |e_d|}{|e_d| - 1}$.`),
            step("Substitute", `$P = \\dfrac{${mc} \\times ${elasticity}}{${elasticity} - 1} = £${price}$.`),
          ],
          takeaway:
            "Mark-ups are bigger when demand is less elastic: a monopolist's price exceeds marginal cost, and the gap widens as elasticity falls.",
        },
      );
    },
  },
];

// ============================================ 4.4 International economics

const internationalGenerators: Generator[] = [
  {
    key: "ecom-rev-exchange-rate",
    base: 0.3,
    span: 1.7,
    build: ({ rng }) => {
      const rate = round(rng.float(0.7, 1.6), 2);
      const price = rng.int(20, 200);
      const domestic = round(price / rate, 2);
      return numericQuestion(
        `A good costs \\$${price} in the United States. The exchange rate is ${rate} dollars per pound. What is the price in pounds?`,
        domestic,
        {
          unit: "£",
          marks: 3,
          solution: [
            step(
              "Divide, don't multiply",
              "The rate is quoted as dollars per pound, so pounds = dollars ÷ rate. Multiplying instead gives an answer in the wrong currency.",
            ),
            step("Substitute", `$${price} \\div ${rate} = £${domestic}.`),
          ],
          takeaway:
            "Getting this division the wrong way round is the single most common error in Section 4.4 questions. Check by asking whether the pound price feels plausible.",
        },
      );
    },
  },
  {
    key: "ecom-comparative-advantage",
    base: 0.1,
    span: 1.6,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "Country A can produce a widget in 2 hours or a gadget in 4 hours. Country B needs 5 hours for a widget and 6 hours for a gadget. Which country has the comparative advantage in gadgets?",
          c: "Country B, because its opportunity cost of a gadget is lower",
          why: "A's opportunity cost of a gadget is 2 hours of widgets; B's is 5/6 of a widget. B's is lower, so B has the comparative advantage.",
        },
        {
          q: "Why is it inefficient for a country to produce a good in which it has an absolute advantage but not a comparative advantage?",
          c: "Because the resources used could produce more of the good the country does have a comparative advantage in",
          why: "Opportunity cost, not physical capability, determines the efficient allocation.",
        },
        {
          q: "Two countries have identical technology and factor endowments but different autarky prices. What explains the difference?",
          c: "Comparative advantage, arising from different factor proportions across the two economies",
          why: "With identical endowments, relative factor abundance is the source of comparative advantage.",
        },
      ];
      const s = rng.pick(scenarios);
      return choiceQuestion(s.q, s.c, [
        s.c.includes("B, because") ? "Country A, because it is faster at making both goods" : "Absolute advantage, because physical capability determines trade patterns",
        "Neither country, because trade requires a difference in currency",
        "Both countries, because comparative advantage must be mutual to be useful",
      ], {
        rng,
        marks: 3,
        solution: [step("Work through opportunity cost", s.why)],
        takeaway: "Comparative advantage is about opportunity cost. Absolute advantage alone never justifies a trade pattern.",
      });
    },
  },
  {
    key: "ecom-trade-benefit",
    base: -0.1,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        { q: "What does a country gain from importing a good it could produce itself?", c: "A wider choice and access to lower opportunity-cost suppliers", why: "Imports let consumption exceed domestic production possibilities, though gains are unevenly distributed." },
        { q: "Why is the distributional effect of trade a frequent exam concern?", c: "Because import-competing sectors may lose while consumers and export sectors gain", why: "Free trade raises total surplus but creates concentrated losers, which is why compensation is a live policy issue." },
        { q: "Why can an economy suffer from a terms of trade deterioration after trade liberalisation?", c: "If it is a price taker, its export prices can fall as its imports rise", why: "Small economies face world prices, so opening up can move them against their export prices." },
      ];
      const s = rng.pick(items);
      return choiceQuestion(s.q, s.c, [
        "It gains a guaranteed long-run increase in its real exchange rate",
        "It must experience falling real wages across the whole economy",
        "It gains only if it also imposes a tariff on every import",
      ], {
        rng,
        marks: 3,
        solution: [
          step("Analysis", s.why),
          step(
            "Distribution",
            "Winners and losers differ, so the change is not Pareto improving and the loser needs compensation.",
          ),
        ],
        takeaway: "Trade raises total surplus and changes its distribution. Examiners want both halves stated.",
      });
    },
  },
];

// ================================================================ registration

/*
  These registrations used to be off by several chapters, which meant a learner
  revising 4.2.5 Macroeconomic policy was asked about a consumer's marginal
  utility, and one revising 4.3.1 Financial markets was asked about market
  share. The mappings below are checked against each chapter's own content
  bullets rather than against an assumed shape for the section.
*/
registerGenerators(["econ-p1", "econ-p2", "econ-p3"], choiceGenerators);

// 4.1.1 covers the economic problem, opportunity cost and diminishing returns.
registerGenerators(["econ-4.1.1"], choiceGenerators);

// 4.1.2 covers how an individual chooses, which is where behavioural bias sits.
registerGenerators(["econ-4.1.2"], behaviouralGenerators);

// 4.1.3 determinants of demand, and with them the supply response and the
// elasticities that describe how much buyers and sellers react.
registerGenerators(["econ-4.1.3"], [
  ...demandGenerators,
  ...supplyGenerators,
  ...elasticityOfDemandGenerators,
  ...elasticityOfSupplyGenerators,
]);

// 4.1.4 is production, costs and revenue, so the cost and revenue items belong
// here. Market equilibrium has no home in this dataset, so it is offered
// alongside demand where learners still meet it.
registerGenerators(["econ-4.1.4"], [...costGenerators, ...revenueGenerators]);
registerGenerators(["econ-4.1.3"], equilibriumGenerators);

// 4.1.5 is the market structures section, so the structure items belong here.
registerGenerators(["econ-4.1.5"], structureGenerators);

// 4.1.6 is market failure.
registerGenerators(["econ-4.1.6"], failureGenerators);

// 4.2.1 states inflation as a macroeconomic objective, which is where the
// percentage and deflator work fits.
registerGenerators(["econ-4.2.1"], priceGenerators);

// 4.4 is the international economy, which was already correctly placed.
registerGenerators(["econ-4.4.1", "econ-4.4.2", "econ-4.4.3", "econ-4.4.4"], internationalGenerators);
