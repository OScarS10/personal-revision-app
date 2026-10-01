import { registerGenerators } from "./registry";
import type { Generator } from "./types";
import { choiceQuestion, numericQuestion, step } from "./types";
import { round } from "@/lib/math-utils";
import { Rng } from "@/lib/rng";

/*
  AQA A-level Economics 7136, poverty and inequality.

  The chapter is nearly all calculation, so almost every item here produces a
  number: shares of income, a Gini from a Lorenz curve, a real living standard
  adjusted for inflation, and the effect of a tax change on a bottom decile.

  The errors these target are specific to the topic:

  - reading a Lorenz curve's axes the wrong way round;
  - treating the Gini as a percentage of income rather than an index;
  - using a nominal income figure as a measure of living standards;
  - computing a share of the wrong base, which is the single most common way to
    lose the final mark on a "what share" question.
*/

// ------------------------------------------------------------------ helpers

/*
  The two-thirds shortcut for the Gini uses only the lowest and highest shares,
  so this takes them explicitly rather than an arbitrary list. Passing all three
  shares averaged them and returned 33.3 for every distribution, which is the
  mean of 100 divided by three and tells you nothing about inequality.
*/
const giniFromShares = (bottom: number, top: number) => round((bottom + top) / 2, 1);

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Gini from a Lorenz curve given as cumulative income shares by decile.
 * Uses the standard trapezoid area, which is what a mark scheme expects when no
 * shortcut applies.
 */
function giniFromLorenz(cumulative: number[]): number {
  const points = [0, ...cumulative];
  let area = 0;
  for (let i = 1; i < points.length; i++) {
    area += ((points[i - 1] + points[i]) / 2) * 0.1;
  }
  return round(1 - 2 * area, 3);
}

/**
 * Cumulative income shares by decile for a Lorenz curve.
 *
 * `power` below 1 gives the bottom decile more income than an equal split, so
 * the curve bows out towards the diagonal and inequality is low. Above 1 it does
 * the reverse. Monotonicity and the endpoint at 1 are forced, because a Lorenz
 * curve that dips or fails to reach 100% is not a Lorenz curve and would make the
 * question unsolvable.
 */
function lorenzCurve(rng: Rng, power: number): number[] {
  const weights = Array.from({ length: 10 }, (_, i) => Math.pow((i + 1) / 10, power));
  const totalWeight = sum(weights);
  let running = 0;
  return weights.map((w, i) => {
    running += w / totalWeight;
    const value = round(running, 3);
    // The last decile always holds the whole of the remaining income.
    return i === 9 ? 1 : Math.min(value, 0.97);
  });
}

// ============================================ 4.1.9 Poverty and inequality

const inequalityGenerators: Generator[] = [
  {
    key: "econ-income-share",
    base: -0.5,
    span: 1.5,
    build: ({ rng, tier }) => {
      // Stated as income per head per week, the way income distribution data is
      // actually published, so the share a top decile holds lands in the range
      // a real distribution would produce.
      /*
        Parameterised from the distribution rather than invented independently.

        An income distribution is per head, so a share of income follows from a
        share of people and the ratio between the two groups' averages. Starting
        from the population share and the overall average means the per-head
        figures are internally consistent by construction, which is not true if
        the two averages are rolled independently.
      */
      const popShare = tier <= 2 ? rng.pick([10, 20]) : rng.pick([1, 10, 20, 30]);
      const incomeShare = round(
        popShare * rng.pick([1.3, 1.8, 2.4, 3.1, 4.2]),
        1,
      );
      const average = rng.int(240, 620);
      const s = popShare / 100;
      const topIncome = round((average * (incomeShare / 100)) / s, 0);
      const others = round((average * (1 - incomeShare / 100)) / (1 - s), 0);
      const topShare = incomeShare;

      const topTotal = round(topIncome * s, 0);
      const otherTotal = round(others * (1 - s), 0);
      const grandTotal = round(topTotal + otherTotal, 0);

      return numericQuestion(
        `In a country, the ${popShare}% of the population with the highest incomes earn an average of £${topIncome} per head per week. The remaining ${100 - popShare}% earn an average of £${others} per head per week.\n\nWhat percentage of total weekly income per head do the richest ${popShare}% receive?`,
        topShare,
        {
          unit: "%",
          marks: 3,
          solution: [
            step(
              "Weight each average by its population",
              `Out of every 100 people, ${popShare} earn £${topIncome} and ${100 - popShare} earn £${others}. Averages are not shares, so each has to be weighted by how many people it covers.`,
            ),
            step(
              "Combined income out of 100 people",
              `Top ${popShare}: ${popShare} × £${topIncome} = £${round((topIncome * popShare) / 100, 0)}.  Others: ${100 - popShare} × £${others} = £${round((others * (100 - popShare)) / 100, 0)}.`,
            ),
            step(
              "Take the share",
              `$\\dfrac{${topTotal}}{${grandTotal}} \\times 100 = ${topShare}\\%$`,
            ),
            step(
              "Sanity check",
              `The share must exceed ${popShare}%, because this group earns more per head than the population average. Anything at or below ${popShare}% would contradict the data.`,
            ),
          ],
          takeaway:
            "An income distribution is per head, so an average has to be weighted by how many people are in each group before you can take a share of the total.",
        },
      );
    },
  },
  {
    key: "econ-gini-from-lorenz",
    base: 0.3,
    span: 1.6,
    build: ({ rng }) => {
      // Two comparable economies, so the learner has to compare both rather than
      // spot the one that looks familiar. Powers below 1 are more equal.
      const a = lorenzCurve(rng, rng.pick([0.7, 0.85, 1.0]));
      const b = lorenzCurve(rng, rng.pick([1.7, 2.1, 2.6]));
      const giniA = giniFromLorenz(a);
      const giniB = giniFromLorenz(b);
      const moreEqual = giniA < giniB ? "A" : "B";
      const values = a.map((v, i) => `${(i + 1) * 10}%: ${(v * 100).toFixed(0)}% of income`).join(", ");

      return choiceQuestion(
        `Two economies have the following Lorenz curves.\n\n**Economy A** — ${values}\n\n**Economy B** — ${b.map((v, i) => `${(i + 1) * 10}%: ${(v * 100).toFixed(0)}%`).join(", ")}\n\nWhich statement is correct?`,
        `Economy ${moreEqual} is more equal, because its Lorenz curve lies closer to the line of perfect equality and its Gini coefficient is lower (about ${round(moreEqual === "A" ? giniA : giniB, 2)} against ${round(moreEqual === "A" ? giniB : giniA, 2)}).`,
        [
          `Economy ${moreEqual === "A" ? "B" : "A"} is more equal, because a steeper Lorenz curve indicates greater equality.`,
          `Both economies have the same Gini, because each Lorenz curve reaches 100% of income at the final decile.`,
          `Economy ${moreEqual === "A" ? "B" : "A"} has a lower Gini, because the Gini coefficient measures the slope of the final segment of the curve.`,
        ],
        {
          rng,
          marks: 4,
          solution: [
            step(
              "Read the axes correctly",
              "The horizontal axis is the cumulative share of people, from poorest to richest. The vertical axis is the cumulative share of income.",
            ),
            step(
              "Which curve bows further out",
              `Economy ${moreEqual === "A" ? "A" : "B"}'s curve sits below the line of equality for most of its length, so the bottom half receives well under half of income.`,
            ),
            step(
              "The area interpretation",
              "The Gini is twice the area between the line of equality and the Lorenz curve, divided by the area of the whole triangle. A lower Gini means a smaller gap.",
            ),
            step(
              "Check the wrong options",
              "Both curves must end at 100%, so that final point proves nothing. And the Gini is an area, not a slope.",
            ),
          ],
          takeaway:
            "Lorenz curves start at the origin and end at 100% for every country. Only the gap between the curve and the diagonal carries information about inequality.",
        },
      );
    },
  },
  {
    key: "econ-gini-shorthand",
    base: 0.1,
    span: 1.5,
    build: ({ rng, tier }) => {
      const bottom = tier <= 2 ? rng.pick([20, 21, 22]) : rng.pick([8, 11, 14, 17]);
      const middle = rng.int(52, 62);
      const top = 100 - bottom - middle;
      const gini = giniFromShares(bottom, top);

      return numericQuestion(
        `Income shares are **${bottom}%** for the bottom third, **${middle}%** for the middle third and **${top}%** for the top third. Using the mean of the lowest and highest shares, estimate the Gini coefficient.`,
        gini,
        {
          dp: 1,
          marks: 3,
          solution: [
            step(
              "Which two shares",
              "The shortcut uses only the bottom and top shares: the middle share does not enter.",
            ),
            step(
              "Average them",
              `$\\dfrac{${bottom} + ${top}}{2} = ${gini}$`,
            ),
            step(
              "Interpret",
              `A coefficient of ${gini} is ${gini < 0.3 ? "low by international standards" : gini < 0.4 ? "typical of a developed economy" : "high, indicating substantial inequality"}.`,
            ),
          ],
          takeaway:
            "The shortcut is the mean of the bottom and top shares only. Including the middle share gives a different number and loses the mark.",
        },
      );
    },
  },
  {
    key: "econ-poverty-threshold",
    base: -0.2,
    span: 1.5,
    build: ({ rng }) => {
      // Set the per-head income first so the household can sit on either side of
      // the line. Rolling the total independently of the household size produced
      // questions where the answer was always "yes", which tested division and
      // nothing else.
      const people = rng.int(2, 5);
      const povertyLine = rng.int(10, 16) * 1000;
      const perHead = rng.bool(0.55) ? povertyLine * rng.float(0.6, 0.95) : povertyLine * rng.float(1.1, 1.8);
      const perHeadRounded = round(perHead, 0);
      const income = perHeadRounded * people;
      const below = perHeadRounded < povertyLine;

      return numericQuestion(
        `A household of **${people}** people has an annual income of £${income.toLocaleString("en-GB")}. The threshold for absolute poverty in this country is £${povertyLine.toLocaleString("en-GB")} **per person**.\n\nIs this household in absolute poverty? Answer 1 for yes and 0 for no.`,
        below ? 1 : 0,
        {
          unit: "1 = in poverty, 0 = not",
          dp: 0,
          marks: 3,
          solution: [
            step(
              "Per head, not per household",
              `£${income.toLocaleString("en-GB")} ÷ ${people} = £${perHeadRounded.toLocaleString("en-GB")} per person.`,
            ),
            step(
              "Compare to the line",
              `£${perHeadRounded.toLocaleString("en-GB")} ${below ? "is below" : "is above"} £${povertyLine.toLocaleString("en-GB")}, so the household ${below ? "is" : "is not"} in absolute poverty.`,
            ),
            step(
              "Why the division matters",
              "The threshold is per person, so a household's total income cannot be compared with it directly. A larger household needs a proportionally larger income to clear the same line, which is why household size has to be handled explicitly.",
            ),
          ],
          takeaway:
            "Divide by the number of people before comparing to a per-person threshold. Comparing household income with a per-person line is a reliable way to lose both marks.",
        },
      );
    },
  },
  {
    key: "econ-real-living-standard",
    base: 0.2,
    span: 1.6,
    build: ({ rng }) => {
      const income1 = rng.int(24, 42) * 1000;
      // Either side of the inflation rate, so the answer is sometimes a real rise
      // and sometimes a real fall despite a rising nominal wage. A generator that
      // only ever produces the reassuring case does not test the distinction.
      const nominalChange = rng.pick([4, 6, 9, 12]);
      const inflation = nominalChange >= 9 ? rng.pick([4, 5]) : rng.pick([7.5, 8, 11]);
      const income2 = round(income1 * (1 + nominalChange / 100), 0);
      const realChange = round(((1 + nominalChange / 100) / (1 + inflation / 100) - 1) * 100, 1);

      return numericQuestion(
        `A household's nominal income rises from £${income1.toLocaleString("en-GB")} to £${income2.toLocaleString("en-GB")} over a year in which inflation is **${inflation}%**. By what percentage has its income ${realChange < 0 ? "fallen" : "risen"} in real terms?\n\nGive a negative figure if real income has fallen.`,
        realChange,
        {
          unit: "%",
          marks: 3,
          solution: [
            step(
              "Convert inflation to an index",
              `Prices are now ${round(1 + inflation / 100, 2)} times last year's.`,
            ),
            step(
              "Divide the new income by the price index",
              `$\\text{Real income} = £${income2.toLocaleString("en-GB")} \\div ${round(1 + inflation / 100, 2)} = £${round(income2 / (1 + inflation / 100), 0).toLocaleString("en-GB")}$`,
            ),
            step(
              "Compare like with like",
              `Real income has ${realChange > 0 ? "risen" : "fallen"} by ${Math.abs(realChange)}% even though the nominal figure rose by ${nominalChange}%.`,
            ),
          ],
          takeaway:
            "A nominal rise tells you nothing about living standards unless you deflate it. Nominal growth below the inflation rate is a real fall.",
        },
      );
    },
  },
  {
    key: "econ-tax-and-benefits-distribution",
    base: 0.5,
    span: 1.5,
    build: ({ rng }) => {
      const before = rng.int(9, 15) * 1000;
      const tax = rng.pick([1500, 1800, 2100]);
      const benefit = rng.pick([1200, 1500, 1800]);
      const after = before - tax + benefit;

      return numericQuestion(
        `A household on a low income of £${before.toLocaleString("en-GB")} pays £${tax.toLocaleString("en-GB")} in tax and receives £${benefit.toLocaleString("en-GB")} in benefits. Calculate disposable income.`,
        after,
        {
          unit: "£",
          marks: 3,
          solution: [
            step(
              "Disposable income is after tax and after benefits",
              "Gross income is before tax; disposable is what is left to spend once tax is paid and benefits are added.",
            ),
            step(
              "Work through",
              `£${before.toLocaleString("en-GB")} − £${tax.toLocaleString("en-GB")} = £${(before - tax).toLocaleString("en-GB")}, then + £${benefit.toLocaleString("en-GB")} = £${after.toLocaleString("en-GB")}.`,
            ),
            step(
              "Check the direction",
              "Benefits increase disposable income and tax reduces it. Swapping them gives a figure that looks plausible and is wrong.",
            ),
          ],
          takeaway:
            "Disposable = gross − tax + benefits. Getting the sign of the benefits wrong is the standard slip, because the answer stays in a believable range.",
        },
      );
    },
  },
  {
    key: "econ-inequality-measure-choice",
    base: 0.6,
    span: 1.4,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          situation:
            "A researcher wants to compare whether the gap between rich and poor has widened since 1990.",
          correct:
            "The Gini coefficient, because it summarises the whole income distribution in one figure that can be compared across years and countries.",
          wrong: [
            "GDP per head, because it measures average income and any rise in the average shows inequality rising.",
            "The rate of unemployment, because unemployment is concentrated among the lowest paid.",
            "The inflation rate, because the price of necessities rises fastest for low-income households.",
          ],
        },
        {
          situation:
            "A government wants to know whether people are able to afford a basic diet in real terms.",
          correct:
            "Income per head adjusted for the price level, because absolute poverty is about the real quantity of goods a person can buy.",
          wrong: [
            "Nominal income per head, because the poverty threshold is set in cash terms.",
            "The Gini coefficient, because a low Gini means everyone can afford a basic diet.",
            "Total national income, because a larger total must mean a higher median standard of living.",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.situation,
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step(
              "Match the measure to the question",
              "Distribution questions need a distribution measure; living standards need a real per-person figure. They are different questions.",
            ),
            step(
              "Why the others fail",
              "GDP per head and total income say nothing about spread. Unemployment and inflation affect low earners but neither measures inequality directly.",
            ),
          ],
          takeaway:
            "Average income measures how much there is; inequality measures how it is divided. One cannot substitute for the other.",
        },
      );
    },
  },
];

registerGenerators(["econ-4.1.9"], inequalityGenerators);