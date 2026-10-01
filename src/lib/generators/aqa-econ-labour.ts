import { registerGenerators } from "./registry";
import type { Generator } from "./types";
import { choiceQuestion, numericQuestion, step } from "./types";
import { round } from "@/lib/math-utils";

/*
  AQA A-level Economics 7136, 4.1.8 the labour market.

  Every figure here is derived from the data printed in the question rather than
  hard-coded, and the distractors target the errors AQA mark schemes punish:

  - quoting wage elasticity of labour demand as a positive number, when it is
    negative because the curve slopes downwards;
  - reading a rise in labour supplied as a rise in employment, which is the
    standard minimum-wage mistake;
  - subtracting inflation from a nominal wage instead of deflating by division.

  The wage and its increase are drawn once and reused in the prompt, the answer
  and the worked solution. Rolling them separately produced solutions that
  referred to a wage the question never mentioned.
*/

// ================================================== 4.1.8 The labour market

const labourGenerators: Generator[] = [
  {
    key: "econ-labour-wage-elasticity",
    base: 0.1,
    span: 1.6,
    build: ({ rng, tier }) => {
      const w1 = rng.int(9, 24);
      const e1 = rng.int(40, 160) * 1000;
      /*
        Work backwards from a target elasticity so the answer is exact rather
        than a rounded artefact.

        %dQd / %dPw is the definition, so with the elasticity fixed the
        employment change is dictated by the wage change. The sign follows from
        the curve: a higher wage means fewer workers, so elasticity is negative
        whenever the wage rises.
      */
      const elasticity = tier <= 2 ? rng.pick([-0.5, -1, -1.5]) : rng.pick([-0.3, -0.8, -2.2, -3]);
      const wageChange = tier <= 2 ? rng.pick([5, 10, 20]) : rng.pick([12, 17, 25, 33]);
      // E = %dQd / %dPw, so multiplying gives the employment change directly.
      const employmentChange = round(elasticity * wageChange, 1);
      const w2 = round(w1 * (1 + wageChange / 100), 2);
      const e2 = round(e1 * (1 + employmentChange / 100), 0);
      // Guards the rounding in w2 and e2: the mark scheme says the printed
      // figures produce this elasticity, so the printed figures must agree.
      const actual = round(
        ((e2 - e1) / e1) / ((w2 - w1) / w1),
        2,
      );

      return numericQuestion(
        `A firm employs **${e1.toLocaleString("en-GB")}** workers at an hourly wage of £${w1}. The wage rises to £${w2} and the firm then employs **${e2.toLocaleString("en-GB")}** workers.\n\nCalculate the wage elasticity of labour demand. Give a negative figure, since labour demand slopes downwards.`,
        actual,
        {
          unit: "elasticity",
          dp: 2,
          marks: tier <= 2 ? 2 : 3,
          solution: [
            step(
              "Percentage change in employment",
              `$\\%\\Delta Q_d = \\dfrac{${e2.toLocaleString("en-GB")} - ${e1.toLocaleString("en-GB")}}{${e1.toLocaleString("en-GB")}} \\times 100 = ${employmentChange}\\%$`,
            ),
            step(
              "Percentage change in the wage",
              `$\\%\\Delta P_w = \\dfrac{${w2} - ${w1}}{${w1}} \\times 100 = ${wageChange}\\%$`,
            ),
            step(
              "Divide, and keep the sign",
              `$E_d = \\dfrac{${employmentChange}}{${wageChange}} = ${actual}$`,
            ),
            step(
              "Why it is negative",
              `Employment ${employmentChange < 0 ? "fell" : "rose"} as the wage ${employmentChange < 0 ? "rose" : "fell"}. Labour demand slopes downwards, so the elasticity carries a negative sign by convention.`,
            ),
          ],
          takeaway:
            "Wage elasticity of labour demand is usually negative: a higher wage reduces the quantity of labour a firm wants. Quoting it as a positive number is a common and expensive error.",
        },
      );
    },
  },
  {
    key: "econ-labour-wage-rigidity",
    base: 0.4,
    span: 1.5,
    build: ({ rng }) => {
      const equilibrium = rng.int(8, 22);
      const actual = round(equilibrium * rng.pick([1.15, 1.2, 1.3]), 2);

      return choiceQuestion(
        `In a perfectly competitive labour market the equilibrium wage is £${equilibrium} per hour. A binding minimum wage of £${actual} is introduced. What happens to employment?`,
        "Employment falls, because firms move up a downward-sloping labour demand curve to a point where the wage is higher and the quantity of labour demanded is lower.",
        [
          `Employment rises to ${round(equilibrium * 1.2, 0)}, because more workers want the job at a higher wage.`,
          `Employment is unchanged at ${equilibrium}, because the wage is not a price of a good sold in a market.`,
          `Employment rises, because the number of workers willing to accept the job increases with the wage.`,
        ],
        {
          rng,
          marks: 3,
          solution: [
            step(
              "Where the wage was",
              `Equilibrium was £${equilibrium}. A minimum of £${actual} is above that, so it binds.`,
            ),
            step(
              "Move along labour demand",
              "A binding wage floor pushes the price of labour above the market-clearing rate, so firms buy fewer hours or workers at the higher rate.",
            ),
            step(
              "Separate supply from demand",
              "Yes, more workers want the job. That is a movement along labour supply, and it creates unemployment rather than employment.",
            ),
          ],
          takeaway:
            "The volume of labour supplied rising is not the same as employment rising. Employment is set by labour demand, which slopes downwards.",
        },
      );
    },
  },
  {
    key: "econ-labour-real-wage",
    base: -0.1,
    span: 1.5,
    build: ({ rng, tier }) => {
      const nominal = rng.int(12, 28);
      const increase = rng.int(2, 4);
      const newNominal = nominal + increase;
      const inflation = tier <= 2 ? rng.pick([2, 4, 5]) : rng.pick([3.5, 6.2, 7.5, 9]);
      const real = round(newNominal / (1 + inflation / 100), 2);
      const nominalChange = round(((newNominal - nominal) / nominal) * 100, 1);

      return numericQuestion(
        `A worker's hourly wage rises from £${nominal} to £${newNominal}. Over the same period the price level rises by **${inflation}%**. Using the exact index formula, what is the worker's real hourly wage now, in terms of the prices of the base year?`,
        real,
        {
          unit: "£",
          marks: 3,
          solution: [
            step(
              "Deflate the new nominal wage",
              `$\\text{Real} = \\dfrac{${newNominal}}{1 + ${round(inflation / 100, 3)}} = £${real}$`,
            ),
            step(
              "Why not subtract the percentage",
              `£${newNominal} − ${inflation} gives £${round(newNominal - inflation, 2)}, which is wrong: inflation is a proportion of the new nominal figure, not a cash amount.`,
            ),
            step(
              "Interpretation",
              nominalChange > inflation
                ? `A nominal rise of ${nominalChange}% against ${inflation}% inflation leaves the worker better off in real terms, but not by ${nominalChange}%.`
                : `A nominal rise of ${nominalChange}% is smaller than ${inflation}% inflation, so the worker's real wage has actually fallen even though the pay slip went up.`,
            ),
          ],
          takeaway:
            "Always deflate by dividing. Real = nominal ÷ (1 + inflation). Subtracting the inflation rate treats it as a cash amount.",
        },
      );
    },
  },
  {
    key: "econ-labour-elasticity-application",
    base: 0.6,
    span: 1.5,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          setup:
            "Nursing vacancies are hard to fill and there are few qualified applicants, so wages have risen sharply.",
          correct:
            "The labour market is relatively inelastic in supply: because replacing a nurse takes years of training, the number willing and able to work barely responds to a higher wage.",
          wrong: [
            "The labour market is elastic in supply because wages rose, which proves quantity supplied responds strongly to price.",
            "Wages rising proves demand for nursing labour is inelastic, since employers keep buying labour at higher prices.",
            "The market is in equilibrium, so elasticity cannot be inferred from a single wage observation.",
          ],
        },
        {
          setup:
            "A rise in the hourly wage of warehouse work has attracted a large increase in the number of job applicants.",
          correct:
            "Labour supply is relatively elastic here: the number applying rises sharply in response to a modest wage increase, so the supply curve is responsive.",
          wrong: [
            "Labour supply is inelastic because a higher wage always reduces the number of people who want to work.",
            "The market must be in disequilibrium, since wages and applications have both risen.",
            "Elasticity of labour supply measures how much firms want to hire, not how many people offer their labour.",
          ],
        },
      ]);

      return choiceQuestion(
        `${scenario.setup}\n\nWhat does this tell you about the elasticity of labour supply?`,
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("Read the evidence", "The observable change is in the number of workers offering labour, so this is a supply elasticity question."),
            step(
              "Elasticity means responsiveness",
              "A large quantity response to a small price change is elastic. The direction of the price change tells you nothing about the size of the response.",
            ),
          ],
          takeaway:
            "Elasticity is about how much quantity responds, not which direction price moved. Supply and demand elasticity are separate judgements.",
        },
      );
    },
  },
  {
    key: "econ-minimum-wage-evaluation",
    base: 0.9,
    span: 1.4,
    build: ({ rng }) => {
      const wage = rng.int(9, 13);

      return choiceQuestion(
        `A government raises the minimum wage from £${wage} to £${wage + 2} per hour. Which statement best explains the argument **against** the policy?`,
        "It reduces employment in the sectors where the minimum wage binds hardest, because the higher labour cost shifts labour demand leftwards along a downward-sloping curve.",
        [
          "It has no effect on employment, because wages below the minimum are illegal so employers simply pay more for the same hours.",
          "It increases unemployment only among foreign workers, so it leaves the domestic labour market unchanged.",
          "It must raise productivity, because a higher wage forces firms to train workers more effectively.",
        ],
        {
          rng,
          marks: 4,
          solution: [
            step("Which side of the market", "Employers are the buyers of labour, so the argument concerns labour demand."),
            step(
              "The mechanism",
              "A binding wage floor raises the price of labour above equilibrium. Firms respond by hiring fewer workers or fewer hours, particularly where margins were thin.",
            ),
            step(
              "The argument for",
              "Supporters reply that the benefit to low-paid workers who keep their jobs exceeds the harm to those who lose them, because the lost jobs are concentrated among the least advantaged.",
            ),
          ],
          takeaway:
            "The distributional question is who gains and who loses, not whether employment rises. Both sides can accept the mechanism and disagree about the weighting.",
        },
      );
    },
  },
  {
    key: "econ-discrimination",
    base: 0.5,
    span: 1.5,
    build: ({ rng }) => {
      const example = rng.pick([
        "Two identically qualified women are paid differently for the same job at the same firm.",
        "A job advertises that applicants must be able to speak English without an accent.",
        "A recruiter screens applications using photographs before reading the CVs.",
      ]);

      return choiceQuestion(
        `Which of the following is **not** a mechanism by which labour market discrimination can persist?\n\n> ${example}`,
        "An increase in the general price level, which changes the nominal cost of living rather than the relative price of any group of workers.",
        [
          "Statistical discrimination, where an employer infers ability from a characteristic correlated with it, such as school or postcode.",
          "Taste-based discrimination, where employers or customers willingly accept a lower wage or price to avoid dealing with a particular group.",
          "Occupational segregation, which concentrates particular groups into particular jobs and pay bands.",
        ],
        {
          rng,
          marks: 3,
          solution: [
            step("Definition", "Discrimination means workers receiving different wages or probabilities of hire for reasons unconnected to productivity."),
            step(
              "The three mechanisms",
              "Taste, statistical inference and occupational segregation are the standard AQA categories. All three can keep a pay gap open without any individual being openly prejudiced.",
            ),
            step(
              "The odd one out",
              "A general price rise is macroeconomic and applies to every employer identically, so it cannot discriminate between groups.",
            ),
          ],
          takeaway:
            "Persistence does not require conscious prejudice. Statistical discrimination and taste both explain gaps that survive equal pay legislation.",
        },
      );
    },
  },
];

registerGenerators(["econ-4.1.8"], labourGenerators);