import { registerGenerators } from "./registry";
import type { Generator } from "./types";
import { choiceQuestion, numericQuestion, step } from "./types";
import { round } from "@/lib/math-utils";
import { Rng } from "@/lib/rng";

/*
  AQA A-Level Economics 7136, macro chapters 4.1.7 and 4.2.2 to 4.2.5.

  Five chapters share one file because they share one set of calculations. Every
  figure in a question is derived from the data printed in the question, so the
  mark scheme can be checked against the numbers on the page.

  The recurring traps, which is what these generators exist to punish:

  - reporting nominal growth as real growth, or forgetting population;
  - describing the level of output rather than the change in it;
  - applying the multiplier to a level of spending rather than a change;
  - computing an index by adding price relatives instead of weighting them;
  - treating a base rate change as though it applied directly to every loan;
  - claiming an AD shift always raises output, ignoring where on the LRAS the
    economy starts.
*/

// ------------------------------------------------------------------ helpers

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Weighted CPI index.
 *
 * `relative` is the current price relative to the base year, as a ratio, so the
 * weights sum to 100 and the index is a weighted average of the relatives. The
 * two-step form is the one AQA mark schemes show.
 */
function weightedIndex(
  relatives: number[],
  weights: number[],
): number {
  const totalWeight = sum(weights);
  const weighted = relatives.reduce((acc, r, i) => acc + r * weights[i]!, 0);
  return round((weighted / totalWeight) * 100, 1);
}

/** Basket good names, sliced to the number of items a question uses. */
const BASKET_GOODS = [
  "bread",
  "milk",
  "cheese",
  "beef",
  "potatoes",
  "coffee",
  "wine",
  "butter",
  "eggs",
  "tea",
];

/**
 * A basket of `n` goods with weights totalling exactly 100.
 *
 * The last weight absorbs the rounding on the others, so the total is exact and
 * the index calculation divides by 100 rather than by something approximate.
 */
function basketWeights(rng: Rng, n: number): number[] {
  // Sized so no single good dominates: 6% for bread beside 37% for beef reads as
  // a typo, and a heavily weighted good is the whole point of the question.
  const raw = Array.from({ length: n }, () => rng.int(15, 35));
  const running: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < n - 1; i++) {
    const w = Math.round((raw[i]! / sum(raw)) * 100);
    running.push(w);
    cumulative += w;
  }
  running.push(100 - cumulative);
  return running;
}

// ================================================== 4.1.7 National economy

const nationalGenerators: Generator[] = [
  {
    key: "econ-national-real-per-head-growth",
    base: 0.2,
    span: 1.6,
    build: ({ rng, tier }) => {
      const nominal = rng.int(4, 11);
      const inflation = rng.pick([1.5, 2.4, 3.1, 3.8, 5.2]);
      const population = rng.pick([0.4, 0.8, 1.2, 1.6]);
      const real = round((1 + nominal / 100) / (1 + inflation / 100) - 1, 4);
      const perHead = round((1 + real) / (1 + population / 100) - 1, 4);

      return numericQuestion(
        `Real GDP rose by **${nominal}%** in a year in which inflation averaged **${inflation}%**. The population grew by **${population}%** over the same year.\n\nCalculate the percentage growth in real GDP per head, to two decimal places.`,
        round(perHead * 100, 2),
        {
          unit: "%",
          dp: 2,
          marks: tier <= 2 ? 3 : 4,
          solution: [
            step(
              "Deflate first",
              `$\\text{Real growth} = \\dfrac{1 + ${nominal}/100}{1 + ${inflation}/100} - 1 = ${round(real * 100, 2)}\\%$`,
            ),
            step(
              "Then allow for population",
              `$\\text{Per head} = \\dfrac{1 + ${round(real * 100, 2)}/100}{1 + ${population}/100} - 1 = ${round(perHead * 100, 2)}\\%$`,
            ),
            step(
              "Why the order matters",
              "Dividing nominal growth by population first and deflating second gives a different answer. Deflation must use price relatives, so it is done on the totals first.",
            ),
            step(
              "Sanity check",
              perHead < 0
                ? "The answer is negative: nominal output rose, but not by enough to cover inflation and a growing population, so output per person fell."
                : "The answer is smaller than the nominal figure, because inflation and population growth both have to be stripped out.",
            ),
          ],
          takeaway:
            "Real GDP per head strips out two things, inflation and population, in that order. Nominal growth is never a living standards measure on its own.",
        },
      );
    },
  },
  {
    key: "econ-national-aims-tradeoff",
    base: 0.6,
    span: 1.5,
    build: ({ rng }) => {
      const pair = rng.pick([
        {
          aims: ["economic growth", "low inflation"],
          stem:
            "A government is trying to raise economic growth while keeping inflation at the 2% target.",
          correct:
            "The two aims conflict, because faster growth raises aggregate demand and therefore the price level, so the government must choose how much inflation it will tolerate.",
          wrong: [
            "The aims are compatible, because economic growth raises output without affecting the price level in the long run.",
            "The aims conflict only if growth comes from an increase in aggregate supply, so supply-led growth satisfies both at once.",
            "There is no conflict, because inflation is measured as the change in the price level rather than the change in output.",
          ],
        },
        {
          aims: ["low unemployment", "a stable external balance"],
          stem:
            "A government wants to reduce unemployment without widening the current account deficit.",
          correct:
            "Expansionary policy to cut unemployment raises imports as consumption rises, so the current account is likely to deteriorate and the two aims conflict.",
          wrong: [
            "The aims are compatible, because a rise in domestic demand cannot affect the trade balance.",
            "The conflict runs the other way, because a wider deficit raises domestic demand and therefore reduces unemployment.",
            "There is no conflict, because the government can control import volumes directly without affecting aggregate demand.",
          ],
        },
        {
          aims: ["redistribution to reduce inequality", "economic growth"],
          stem:
            "A government wants to reduce income inequality while also raising the long-run growth rate.",
          correct:
            "Higher rates of taxation on the incomes most likely to be saved reduce the funds available for investment, so the two aims conflict in the short run.",
          wrong: [
            "The aims are compatible, because redistribution raises the MPC of the poorest households and so always raises growth.",
            "The aims are compatible, because only spending, not taxation, can affect the rate of investment.",
            "The aims cannot conflict, because growth and inequality move in opposite directions in every economy.",
          ],
        },
      ]);

      return choiceQuestion(
        `${pair.stem}\n\nWhich statement best explains the relationship between ${pair.aims[0]} and ${pair.aims[1]}?`,
        pair.correct,
        pair.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("Identify the mechanism, not the pair", "Marks are for explaining how one aim affects the other through AD, investment or the trade balance, not for naming the aims."),
            step(
              "Then the trade-off",
              "The point of the argument is that the government must weigh the two against each other, which is what makes it an evaluation rather than a description.",
            ),
          ],
          takeaway:
            "Aiming at several macro objectives at once means accepting trade-offs between them. Explaining the mechanism is what earns the marks.",
        },
      );
    },
  },
  {
    key: "econ-national-growth-vs-development",
    base: 0.8,
    span: 1.4,
    build: ({ rng }) => {
      const case_ = rng.pick([
        {
          stem:
            "Country X's GDP per head has risen from $4,000 to $9,000 in thirty years, while its HDI has barely moved and average life expectancy is still below the world average.",
          correct:
            "Country X has grown but not developed, because higher average income has not translated into improvements in health, education or living standards.",
          wrong: [
            "Country X has both grown and developed, because GDP per head is the standard measure of development used by the IMF.",
            "Country X has not grown, because a rise in GDP per head only counts as growth if HDI also rises.",
            "Country X has grown and developed, because a stagnant HDI means income is more evenly distributed.",
          ],
        },
        {
          stem:
            "Country Y's real GDP has grown by 4% a year, but it has the highest carbon emissions per head in its region.",
          correct:
            "Country Y has grown but not developed sustainably, because the growth has come at the cost of environmental quality that a GDP figure does not capture.",
          wrong: [
            "Country Y has not grown, because growth that damages the environment should not be counted as growth at all.",
            "Country Y has grown and developed, because environmental damage is a distributional issue rather than a development issue.",
            "Country Y has developed but not grown, because HDI-type measures exclude environmental quality.",
          ],
        },
      ]);

      return choiceQuestion(
        `${case_.stem}\n\nWhich conclusion is justified?`,
        case_.correct,
        case_.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("Separate the two ideas", "Growth is a change in the quantity of real output per head. Development is an improvement in living standards and capabilities."),
            step(
              "Use the evidence given",
              "The question supplies an indicator that has not moved, or a cost that has been incurred. That is what rules out development even where growth is present.",
            ),
          ],
          takeaway:
            "Growth is a necessary but not sufficient condition for development. A real GDP per head figure alone cannot establish that people are better off.",
        },
      );
    },
  },
];

// ================================================== 4.2.2 Growth and the cycle

const growthGenerators: Generator[] = [
  {
    key: "econ-growth-real-from-nominal",
    base: -0.3,
    span: 1.6,
    build: ({ rng, tier }) => {
      const gdp0 = rng.int(800, 2400) * 1000_000;
      const nominalGrowth = rng.pick([tier <= 2 ? 3 : 4.5, tier <= 2 ? 5 : 7, tier <= 2 ? 8 : 9]);
      const inflation = rng.pick([1.8, 2.5, 3.4, 4.6, 6.2]);
      const gdp1Nominal = round(gdp0 * (1 + nominalGrowth / 100), 0);
      const real = round((gdp1Nominal / (1 + inflation / 100) - gdp0) / gdp0 * 100, 2);

      return numericQuestion(
        `Nominal GDP rose from £${gdp0.toLocaleString("en-GB")} to £${gdp1Nominal.toLocaleString("en-GB")} in a year in which inflation averaged **${inflation}%**.\n\nCalculate the percentage growth in real GDP.`,
        real,
        {
          unit: "%",
          dp: 2,
          marks: tier <= 2 ? 2 : 3,
          solution: [
            step(
              "Express inflation as a deflator",
              `Prices are ${round(1 + inflation / 100, 3)} times last year's, so last year's output is worth £${round(gdp1Nominal / (1 + inflation / 100), 0).toLocaleString("en-GB")} in this year's prices.`,
            ),
            step(
              "Growth formula",
              `$\\%\\Delta = \\dfrac{${round(gdp1Nominal / (1 + inflation / 100), 0).toLocaleString("en-GB")} - ${gdp0.toLocaleString("en-GB")}}{${gdp0.toLocaleString("en-GB")}} \\times 100 = ${real}\\%$`,
            ),
            step(
              "Check the sign",
              real < 0
                ? "The answer is negative: nominal output rose by more than inflation, so real output fell. This is the case most often lost, because the nominal figures both went up."
                : `Real growth of ${real}% is smaller than the nominal ${nominalGrowth}%, because part of the nominal rise is inflation.`,
            ),
          ],
          takeaway:
            "Real growth is nominal growth deflated, not nominal growth. When inflation exceeds nominal growth, output is rising in cash terms and falling in volume terms at the same time.",
        },
      );
    },
  },
  {
    key: "econ-growth-cycle-phase",
    base: 0.3,
    span: 1.4,
    build: ({ rng }) => {
      const phase = rng.pick([
        {
          stem:
            "Consumer confidence is rising, firms report order books that they cannot meet, and the rate of unemployment has fallen for four consecutive quarters.",
          correct:
            "The economy is in the expansion phase, because output and employment are rising and firms are reporting demand they cannot yet satisfy.",
          wrong: [
            "The economy is at the peak, because unemployment has stopped falling as output reaches its highest level.",
            "The economy is in the contraction phase, because falling unemployment reduces firms' costs and so shifts the LRAS rightwards.",
            "The economy is in the trough, because falling unemployment means firms are willing to take on more labour.",
          ],
        },
        {
          stem:
            "Orders are falling, firms are cutting hours before cutting jobs, and the Bank of England reports that output has been below trend for two quarters.",
          correct:
            "The economy is in the contraction phase, because output is falling and firms are reducing labour use before dismissing workers.",
          wrong: [
            "The economy is in the expansion phase, because reducing hours rather than jobs is evidence that firms are confident about demand.",
            "The economy is at the peak, because output below trend means the economy has finished expanding.",
            "The economy is in the trough, because cutting hours is the last stage of a contraction before recovery begins.",
          ],
        },
        {
          stem:
            "Output has stopped rising and has begun to decline, while prices are still rising at 3% a year.",
          correct:
            "The economy has passed the peak and entered contraction, because output is no longer rising even though prices continue to increase.",
          wrong: [
            "The economy is still expanding, because prices rising at 3% proves firms are producing more.",
            "The economy is at the trough, because prices rising means demand is still expanding.",
            "The economy is in a new expansion phase, because the peak is only reached when prices stop rising.",
          ],
        },
      ]);

      return choiceQuestion(
        `${phase.stem}\n\nWhich phase of the business cycle is the economy in?`,
        phase.correct,
        phase.wrong,
        {
          rng,
          marks: 2,
          solution: [
            step("The cycle is about output", "Phases are defined by the direction of real output, not by prices. Rising inflation can coexist with falling output."),
            step(
              "Which way is output moving",
              "Falling order books and falling unemployment point in opposite directions, and it is output that settles it. Rising unemployment with falling orders is contraction; falling unemployment with rising orders is expansion.",
            ),
          ],
          takeaway:
            "Phase is defined by the direction of output and employment. Prices can move in the opposite direction, which is why inflation does not tell you which phase the economy is in.",
        },
      );
    },
  },
  {
    key: "econ-growth-short-vs-long-run",
    base: 0.7,
    span: 1.4,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "Output is 4% below the economy's trend level and unemployment is 7%. The government cuts VAT by 5%.",
          correct:
            "This is short-run policy: with unemployed resources, higher consumption raises AD and moves output back towards trend without raising potential output.",
          wrong: [
            "This is long-run policy: cutting VAT increases the economy's productive capacity because it raises the return to investment.",
            "This is long-run policy, because any rise in AD eventually shifts the LRAS curve to the right.",
            "This has no effect on output, because a tax cut changes consumption but consumption is a stable component of AD.",
          ],
        },
        {
          stem:
            "The government funds a ten-year programme of university scholarships and railway building, financed by borrowing.",
          correct:
            "This is an attempt to raise long-run productive potential, because education and infrastructure increase the economy's capacity to produce.",
          wrong: [
            "This is short-run demand management, because borrowing raises aggregate demand in the year it is spent.",
            "This raises aggregate demand only, because capital spending cannot shift the long-run aggregate supply curve.",
            "This has no effect on potential output, because human capital investment affects demand rather than capacity.",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhich statement best describes what this policy is trying to do?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("Ask which curve it shifts", "Short-run policy shifts AD and moves output along LRAS. Long-run policy shifts LRAS itself."),
            step(
              "Then ask about spare capacity",
              "With unemployed resources, raising AD uses idle capacity. Raising potential means adding to the factors of production or improving their quality.",
            ),
          ],
          takeaway:
            "A demand-led rise in output is short run and depends on spare capacity. Only changes to factors of production or technology raise productive potential.",
        },
      );
    },
  },
];

// ================================================== 4.2.3 AD and AS

const adasGenerators: Generator[] = [
  {
    key: "econ-adas-components",
    base: -0.4,
    span: 1.6,
    build: ({ rng, tier }) => {
      const c = rng.int(600, 1200) * 1000_000;
      const i = rng.int(180, 420) * 1000_000;
      const g = rng.int(200, 480) * 1000_000;
      const x = rng.int(280, 640) * 1000_000;
      const m = rng.int(300, 700) * 1000_000;
      const ad = round((c + i + g + (x - m)) / 1000_000_000, 2);

      return numericQuestion(
        [
          `| Component | £ million |`,
          `| --- | --- |`,
          `| Consumption (C) | ${c / 1000_000} |`,
          `| Investment (I) | ${i / 1000_000} |`,
          `| Government spending (G) | ${g / 1000_000} |`,
          `| Exports (X) | ${x / 1000_000} |`,
          `| Imports (M) | ${m / 1000_000} |`,
          ``,
          `Calculate aggregate demand (C + I + G + (X − M)) in £ billion.`,
        ].join("\n"),
        ad,
        {
          unit: "£ billion",
          dp: 2,
          marks: tier <= 2 ? 3 : 4,
          solution: [
            step(
              "Imports are subtracted",
              `$\\text{AD} = C + I + G + (X - M) = ${c / 1000_000} + ${i / 1000_000} + ${g / 1000_000} + (${x / 1000_000} - ${m / 1000_000})$`,
            ),
            step(
              "Why M is subtracted",
              "Imports are spending that leaves this economy. Counting them as part of this country's aggregate demand would double-count output produced abroad.",
            ),
            step(
              "Units",
              `The components are in £ million, so the total of £${round((c + i + g + (x - m)) / 1_000_000, 0)} million is £${ad} billion.`,
            ),
          ],
          takeaway:
            "AD is C + I + G + (X − M). The subtraction of M is the mark most often lost, because the temptation is to add everything that is spent.",
        },
      );
    },
  },
  {
    key: "econ-adas-shift-effect",
    base: 0.4,
    span: 1.6,
    build: ({ rng, tier }) => {
      const scenario = rng.pick([
        {
          stem: "The government announces a £10bn increase in spending on new hospitals.",
          shifted: "AD shifts right",
          shortRun: "output rises and the price level rises",
          longRun: "output returns to potential, leaving only a higher price level",
          wrong: [
            "AD shifts right, so output and the price level both rise permanently",
            "LRAS shifts right, so output rises with no change in the price level",
            "AD shifts left, because government spending competes with private spending",
          ],
        },
        {
          stem: "A fall in consumer confidence causes households to postpone car purchases.",
          shifted: "AD shifts left",
          shortRun: "output falls and the price level falls",
          longRun: "output returns to potential, leaving only a lower price level",
          wrong: [
            "LRAS shifts left, because confidence is a determinant of the economy's productive capacity",
            "AD shifts right, because postponed spending is saved and then invested",
            "AD shifts left, so output falls and the price level rises",
          ],
        },
        {
          stem: "A rise in the world price of oil increases the cost of energy for every firm.",
          shifted: "SRAS shifts left",
          shortRun: "output falls and the price level rises",
          longRun: "the economy adjusts back to potential output at a higher price level",
          wrong: [
            "AD shifts left, because higher energy costs reduce households' real incomes",
            "SRAS shifts right, because a cost increase makes production more profitable",
            "SRAS shifts left, so output and the price level both rise",
          ],
        },
      ]);

      return choiceQuestion(
        `${scenario.stem}\n\nWhich diagram effect follows?\n\n> **${scenario.shifted}**: in the short run, ${scenario.shortRun}.`,
        `${scenario.shifted}; in the short run, ${scenario.shortRun}; in the long run, ${scenario.longRun}.`,
        scenario.wrong,
        {
          rng,
          marks: tier <= 2 ? 3 : 4,
          solution: [
            step("Work out what caused the change", "A change in spending shifts AD. A change in the cost of production or in expected prices shifts SRAS. Only a change in factors or technology shifts LRAS."),
            step(
              "Then where on the curve it lands",
              "Along a downward-sloping SRAS, a demand increase raises output and the price level together. A supply decrease raises the price level while cutting output: the two move in opposite directions.",
            ),
            step(
              "The long-run adjustment",
              "If output was below potential, the price-level change alone restores long-run equilibrium. If it was already at potential, the whole effect is on the price level.",
            ),
          ],
          takeaway:
            "Name the curve before you state the effect. The direction of output and the direction of the price level together identify which curve moved.",
        },
      );
    },
  },
  {
    key: "econ-adas-multiplier",
    base: 0.6,
    span: 1.6,
    build: ({ rng, tier }) => {
      const mpc = tier <= 2 ? rng.pick([0.5, 0.6, 0.75]) : rng.pick([0.8, 0.85, 0.9]);
      const multiplier = round(1 / (1 - mpc), 2);
      const injectionBn = rng.pick([2, 4, 5, 10]);
      const totalBn = round(injectionBn * multiplier, 2);

      return numericQuestion(
        `The marginal propensity to consume is **${mpc}**. The government increases spending by £${injectionBn}bn.\n\nCalculate the total change in national income implied by the multiplier, in £ billion.`,
        totalBn,
        {
          unit: "£bn",
          dp: 2,
          marks: tier <= 2 ? 3 : 4,
          solution: [
            step("Multiplier first", `$k = \\dfrac{1}{1 - MPC} = \\dfrac{1}{1 - ${mpc}} = ${multiplier}$`),
            step(
              "Apply to the change",
              `$\\Delta Y = k \\times \\Delta G = ${multiplier} \\times £${injectionBn}bn = £${totalBn}bn$`,
            ),
            step(
              "The value of a higher MPC",
              `The multiplier is larger at a higher MPC because more of each pound of income is spent and re-spent. At an MPC of ${mpc}, ${Math.round(mpc * 100)}p of each pound goes to a recipient who will spend ${Math.round(mpc * 100)}p of it again.`,
            ),
            step(
              "Caveat the mark scheme expects",
              "This assumes spare capacity. If the economy is at full employment, much of the extra demand raises prices rather than output.",
            ),
          ],
          takeaway:
            "The multiplier amplifies a change in spending, not the level of spending, and its size depends on the MPC. It is not a constant.",
        },
      );
    },
  },
  {
    key: "econ-adas-equilibrium-price-level",
    base: 0.9,
    span: 1.4,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "The economy is at full employment, and productivity rises because of a large investment in automation.",
          correct:
            "LRAS shifts right, so potential output rises and the price level falls, because output is already at potential and the extra capacity is not absorbed by extra demand.",
          wrong: [
            "AD shifts right, so both output and the price level rise",
            "LRAS shifts right, so output and the price level both rise",
            "SRAS shifts left, so the price level rises and output falls",
          ],
        },
        {
          stem:
            "The economy has unemployed resources, and the central bank cuts its policy rate to 0.5%.",
          correct:
            "AD shifts right along an upward-sloping SRAS, so both output and the price level rise, and unemployment falls.",
          wrong: [
            "LRAS shifts right, so output rises and the price level falls",
            "AD shifts left, because a lower policy rate reduces borrowing",
            "SRAS shifts right, so output rises with no change in the price level",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhat happens to output and the price level?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("Full employment is the key phrase", "At full employment the economy is on its LRAS, so a rise in capacity cannot raise actual output. The extra capacity shows up as a lower price level."),
            step(
              "Unemployed resources is the other key phrase",
              "Off the LRAS, the SRAS curve is upward-sloping, so a demand increase splits between more output and a higher price level.",
            ),
          ],
          takeaway:
            "The same policy has different effects depending on where the economy starts on its LRAS. Always check for spare capacity before predicting the price level.",
        },
      );
    },
  },
];

// ================================================== 4.2.4 Economic performance

const performanceGenerators: Generator[] = [
  {
    key: "econ-performance-unemployment-rate",
    base: -0.5,
    span: 1.5,
    build: ({ rng, tier }) => {
      const employed = rng.int(20, 34) * 1000_000;
      const unemployed = round(employed * rng.float(0.02, 0.09), 0);
      const labourForce = employed + unemployed;
      const rate = round((unemployed / labourForce) * 100, 2);
      // Unemployed is rounded to a whole person, so the rate often lands on a
      // single decimal. The solution shows the same precision as the answer, or
      // the two disagree in the last place and the mark scheme looks wrong.
      const rateDp = Number.isInteger(rate) ? 0 : Number.isInteger(round(rate, 1)) ? 1 : 2;
      const rateText = round(rate, rateDp);

      return numericQuestion(
        `An economy has **${employed.toLocaleString("en-GB")}** people in employment and **${unemployed.toLocaleString("en-GB")}** people who are unemployed and actively seeking work.\n\nCalculate the unemployment rate as a percentage of the labour force.`,
        rateText,
        {
          unit: "%",
          dp: rateDp,
          marks: tier <= 2 ? 2 : 3,
          solution: [
            step("Build the denominator", `Labour force = employed + unemployed = ${employed.toLocaleString("en-GB")} + ${unemployed.toLocaleString("en-GB")} = ${labourForce.toLocaleString("en-GB")}.`),
            step(
              "Divide",
              `$U = \\dfrac{${unemployed.toLocaleString("en-GB")}}{${labourForce.toLocaleString("en-GB")}} \\times 100 = ${rateText}\\%$`,
            ),
            step(
              "Why not the working-age population",
              "Only people in work or actively seeking work are in the labour force. Students, retired people and the long-term inactive are excluded, so dividing by the whole working-age population gives a much smaller figure.",
            ),
          ],
          takeaway:
            "The unemployment rate uses the labour force as its denominator, not the working-age population. Getting the denominator right is the whole of this calculation.",
        },
      );
    },
  },
  {
    key: "econ-performance-unemployment-type",
    base: 0.2,
    span: 1.4,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "Output has fallen for two quarters. In the industries that contracted, workers who lost their jobs in the same sectors twenty years ago are still out of work.",
          correct:
            "This is structural unemployment: demand for labour in those sectors has permanently fallen, so the workers' existing skills no longer match the jobs available.",
          wrong: [
            "This is frictional unemployment, because the workers are taking time to search for a new job",
            "This is cyclical unemployment, because the fall in output is what caused it",
            "This is seasonal unemployment, because the decline happens at particular times of year",
          ],
        },
        {
          stem:
            "A graduate has accepted a job in a different city and moves house. They are not working for two weeks while they settle in.",
          correct:
            "This is frictional unemployment: it is the short time taken to move between jobs as part of an efficient labour market.",
          wrong: [
            "This is structural unemployment, because the graduate's skills do not match the jobs in the new city",
            "This is cyclical unemployment, because the economy is in a contraction",
            "This is classical unemployment, because the graduate has refused to take the wage offered",
          ],
        },
        {
          stem:
            "The overall unemployment rate rises each January and falls each September, by the same amounts each year.",
          correct:
            "This is seasonal unemployment: the pattern is predictable and repeats annually, so it distorts the headline rate without indicating any change in underlying conditions.",
          wrong: [
            "This is cyclical unemployment, because unemployment responds to the level of output",
            "This is structural unemployment, because certain industries only hire at certain times of year",
            "This is frictional unemployment, because workers move between seasonal jobs",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhich type of unemployment does this describe?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("Look for the cause, not the level", "Each type is defined by its cause. Long unemployment after a sector's decline is structural; short gaps between jobs are frictional; a repeating annual pattern is seasonal; a fall in demand is cyclical."),
            step(
              "The policy implication follows",
              "Structural unemployment needs supply-side measures, frictional unemployment needs none because it is efficient, cyclical unemployment is treated with demand management.",
            ),
          ],
          takeaway:
            "Name the cause and the type follows. Frictional unemployment is the price of a labour market that works, so a policy to eliminate it would be a mistake.",
        },
      );
    },
  },
  {
    key: "econ-performance-cpi-weighted",
    base: 0.4,
    span: 1.7,
    build: ({ rng, tier }) => {
      const n = tier <= 2 ? 3 : 4;
      const weights = basketWeights(rng, n);
      /*
        Price relatives, not prices.

        Giving prices in pounds and calling them relatives produced an index of
        several hundred, because a £6.40 loaf was treated as a 640% rise. The
        relative is this year's price over last year's, so it sits near 1.
      */
      const relatives = weights.map(() => round(rng.float(0.84, 1.32), 2));
      const index = weightedIndex(relatives, weights);

      return numericQuestion(
        [
          `The CPI basket for a typical household is shown below, with each good's **price relative** (this year's price as a proportion of last year's) and its weight (per cent of household spending).`,
          ``,
          `| Good | Price relative | Weight |`,
          `| --- | --- | --- |`,
          BASKET_GOODS.slice(0, n)
            .map((name, i) => `| ${name} | ${relatives[i]!.toFixed(2)} | ${weights[i]} |`)
            .join("\n"),
          ``,
          `Last year's CPI was **100**. Calculate this year's CPI, to one decimal place.`,
        ].join("\n"),
        index,
        {
          unit: "index",
          dp: 1,
          marks: tier <= 2 ? 3 : 4,
          solution: [
            step("Write the weighted formula", `$\\text{Index} = \\dfrac{\\sum (\\text{price relative} \\times \\text{weight})}{\\sum \\text{weights}} \\times 100$`),
            step(
              "Weight each relative",
              `$\\dfrac{${relatives.map((r, i) => `${r.toFixed(2)} \\times ${weights[i]}`).join(" \\; + \\; ")}}{${sum(weights)}} \\times 100 = ${index}$`,
            ),
            step(
              "Sanity check the weighting",
              "A heavily weighted good should dominate the result. If your answer moves less than that good's own price change alone, the weights have been dropped.",
            ),
            step(
              "Turn the index into an inflation rate",
              `An index of ${index} against a base of 100 means inflation of ${round(index - 100, 1)}%. The index and the inflation rate are not the same figure.`,
            ),
          ],
          takeaway:
            "The CPI is a weighted average of price relatives, so the weights are the calculation. Forgetting the divide by total weight is what turns 100 into 10,000.",
        },
      );
    },
  },
  {
    key: "econ-performance-deflation",
    base: 0.8,
    span: 1.4,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "The CPI has fallen for six consecutive months, and a household with a fixed mortgage at a fixed rate holds a £180,000 debt.",
          correct:
            "Deflation harms borrowers, because each payment they make retires more of the real value of the debt than before, while lenders suffer correspondingly.",
          wrong: [
            "Deflation harms lenders, because borrowers repay the debt faster than the terms agreed",
            "Deflation benefits everyone, because a falling price level raises the real value of every nominal asset",
            "Deflation has no distributional effect, because a fixed nominal debt holds its real value constant",
          ],
        },
        {
          stem:
            "The CPI has fallen for six consecutive months, and firms report delaying investment decisions.",
          correct:
            "Deflation discourages investment, because firms expect to buy machinery more cheaply later, so postponing raises expected returns.",
          wrong: [
            "Firms delay investment because deflation lowers their costs, so it always raises investment",
            "Deflation raises investment, because the real value of existing debts falls",
            "Firms delay investment because deflation reduces aggregate demand, not because of expectations",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhich effect on the economy is correctly identified?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("Deflation is a sustained fall in the general price level", "It is not simply a low inflation rate, and it is not the same as a fall in the level of output."),
            step(
              "Then look at who holds nominal claims",
              "A fixed nominal debt is worth more in real terms as prices fall, so borrowers benefit and lenders lose. Nominal incomes and assets lose real value in the other direction.",
            ),
          ],
          takeaway:
            "Deflation is as damaging as inflation, and its distributional effects run through who holds fixed nominal claims. Borrowers gain, lenders and holders of nominal assets lose.",
        },
      );
    },
  },
];

// ================================================== 4.2.5 Macroeconomic policy

const policyGenerators: Generator[] = [
  {
    key: "econ-policy-fiscal-choice",
    base: 0.3,
    span: 1.5,
    build: ({ rng, tier }) => {
      const scenario = rng.pick([
        {
          stem:
            "The economy is in recession with 8% unemployment, and the government wants to raise AD immediately. The finance minister proposes a 2p cut in income tax.",
          correct:
            "Income tax cuts raise disposable income, and since consumption is the largest component of AD with a high MPC, this raises aggregate demand.",
          wrong: [
            "Income tax cuts raise investment directly, so AD rises through the investment component",
            "Income tax cuts reduce the government deficit by cutting spending, so AD rises through the saving component",
            "Income tax cuts only affect the labour market, so they have no effect on AD in the short run",
          ],
        },
        {
          stem:
            "Inflation is 6% and rising, and the government wants to reduce AD. It announces a cut in spending on new hospital buildings worth £4bn.",
          correct:
            "Cutting government spending directly reduces G, which lowers aggregate demand, output and employment, and puts downward pressure on inflation.",
          wrong: [
            "Cutting government spending reduces AD but raises inflation, because lower demand encourages firms to lower prices",
            "Cutting government spending has no effect on AD, because healthcare spending is not counted in G",
            "Cutting government spending raises AD, because it releases households' borrowing capacity",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhich statement correctly describes the effect on aggregate demand?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: tier <= 2 ? 2 : 3,
          solution: [
            step("Identify which term of AD moves", "C, I, G or (X − M). Write down which one the policy touches before reasoning about the effect."),
            step(
              "Then the direction",
              "Expansionary policy raises AD, contractionary lowers it. The chain runs through consumption or investment, then multiplier, then output and the price level.",
            ),
          ],
          takeaway:
            "Trace every policy to the AD component it moves. Fiscal policy that touches taxes works through disposable income and consumption, not directly through G.",
        },
      );
    },
  },
  {
    key: "econ-policy-automatic-stabiliser",
    base: 0.6,
    span: 1.4,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "Without any new law or budget, tax receipts fall and unemployment benefit payments rise as the economy enters a recession.",
          correct:
            "These are automatic stabilisers: they operate because the tax and benefit system is designed to respond to the cycle, so they need no policy decision.",
          wrong: [
            "These are discretionary fiscal measures, because the government chose the tax and benefit rates in an earlier budget",
            "These are monetary policy, because they operate automatically without a decision",
            "These are supply-side policies, because they increase the government's budget deficit",
          ],
        },
        {
          stem:
            "A government announces a 5% cut in the rate of income tax in order to support demand in a downturn.",
          correct:
            "This is discretionary fiscal policy, because it required a decision, an announcement and implementation before it had any effect.",
          wrong: [
            "This is an automatic stabiliser, because progressive tax cuts take effect without legislation",
            "This is monetary policy, because it affects the spending decisions of households and firms",
            "This is supply-side policy, because it raises households' incentives to work",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhich statement is correct?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("Ask whether a decision was needed", "Automatic stabilisers are already built into the system. Progressive taxation and unemployment benefit move with the cycle without anyone deciding to use them."),
            step(
              "Why they matter",
              "They dampen the cycle faster than discretionary policy can act, because they respond immediately rather than after recognition and implementation lags.",
            ),
          ],
          takeaway:
            "The test is whether a new decision is required. If the tax and benefit system responds on its own, it is an automatic stabiliser, however large the effect.",
        },
      );
    },
  },
  {
    key: "econ-policy-multiple-objectives",
    base: 0.9,
    span: 1.4,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "Inflation is 7% and unemployment is 4%. The government is considering contractionary fiscal policy.",
          correct:
            "The government must weigh lower inflation against higher unemployment, because contractionary policy reduces AD and therefore reduces both output and the price level.",
          wrong: [
            "The government should raise spending, because high unemployment shows that aggregate demand is too low",
            "The government should do nothing, because inflation and unemployment cannot both be reduced at once under any circumstances",
            "The government should cut income tax, because cutting taxes always reduces inflation",
          ],
        },
        {
          stem:
            "Unemployment is 9% and inflation is 1%. A central bank has cut rates twice without effect.",
          correct:
            "Monetary policy has a time lag, so the cuts may yet work, but if demand is unresponsive the binding constraint is elsewhere and fiscal policy may be needed sooner.",
          wrong: [
            "The central bank should reverse the cuts, because monetary policy only works when it reduces the money supply",
            "The government should raise rates, because low inflation always requires higher interest rates",
            "There is no case for further action, because unemployment of 9% cannot coexist with inflation of 1%",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhich statement best describes the policy problem?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 4,
          solution: [
            step("Establish which variable is off target", "If inflation is above target and unemployment is low, the economy is overheating and contractionary policy is indicated."),
            step(
              "Then state the trade-off",
              "Any reduction in AD reduces output as well as the price level, so unemployment rises. That cost is the substance of the policy debate, not a side effect to be acknowledged at the end.",
            ),
          ],
          takeaway:
            "Evaluate on the trade-off, not on whether policy 'works'. Every macro instrument reduces one target variable while worsening another, and the argument is about the weighting.",
        },
      );
    },
  },
  {
    key: "econ-policy-transmission-lag",
    base: 1.1,
    span: 1.3,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "The central bank cuts its policy rate by 0.75 percentage points to 3.5%. Two quarters later, consumer borrowing has not risen and new business investment is unchanged.",
          correct:
            "Transmission has been weak: banks may not pass the cut on to lending rates, or firms facing weak demand may not borrow even when it is cheaper, so AD is largely unchanged.",
          wrong: [
            "Transmission has been complete, because a policy rate cut reduces every loan rate by the same amount immediately",
            "The cut must have increased AD, because lower interest rates always raise investment by a fixed amount",
            "The central bank has made an error, because a policy rate cut should raise AD within one week",
          ],
        },
        {
          stem:
            "The central bank raises its policy rate to 5%. Mortgage rates on new fixed-rate deals rise within weeks, and new house purchases fall over the following two quarters.",
          correct:
            "Transmission worked along the chain: policy rate, then market lending rates, then borrowing-sensitive spending, then AD, then lower output and lower inflation.",
          wrong: [
            "The rise in mortgage rates is unrelated to monetary policy, because mortgage rates are set by housebuilders",
            "House purchases fall because house prices fall, not because borrowing is more expensive",
            "Transmission is too slow to be useful, because the effects appear only after five years",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhat does this evidence show?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 4,
          solution: [
            step("Name each link in the chain", "Policy rate, then market rates, then borrowing and spending decisions, then AD, then output and the price level. Evidence at one link says where the chain broke."),
            step(
              "Why each link can weaken",
              "Banks set their own lending margins, indebted households cannot borrow more by being offered a lower rate, and firms facing no demand do not invest simply because the cost of finance falls.",
            ),
          ],
          takeaway:
            "Monetary policy is indirect and delayed. Evaluation marks come from identifying which link failed, not from restating that policy works 'over time'.",
        },
      );
    },
  },
];

registerGenerators(["econ-4.1.7"], nationalGenerators);
registerGenerators(["econ-4.2.2"], growthGenerators);
registerGenerators(["econ-4.2.3"], adasGenerators);
registerGenerators(["econ-4.2.4"], performanceGenerators);
registerGenerators(["econ-4.2.5"], policyGenerators);