import { registerGenerators } from "./registry";
import type { Generator } from "./types";
import { choiceQuestion, numericQuestion, step } from "./types";
import { round } from "@/lib/math-utils";

/*
  AQA A-Level Economics 7136, sections 4.3.1 financial markets and 4.3.2
  central banking.

  Two chapters that share one theme: a price in a market, and a chain of links
  between a decision and an outcome.

  The calculations here are the ones that catch people out:

  - a bond's yield depends on the price paid, not on the coupon alone;
  - bond price and bond yield move in opposite directions;
  - the multiplier on a government bond is applied to the nominal value, while
    the yield calculation uses the price actually paid;
  - the exchange rate depreciation formula needs both currencies named.

  The transmission questions are deliberately worded so that the learner has to
  identify which link of the chain the evidence concerns, because that
  identification is where the Level 3 and 4 marks are.
*/

// ------------------------------------------------------------------ helpers

/**
 * Price of a one-year bond paying `couponRate` and yielding `marketYield`.
 *
 * Solved from yield = (coupon + nominal − price) / price, so price is
 * (coupon + nominal) / (1 + yield).
 *
 * Working backwards from a target yield matters: drawing the price first and
 * computing the yield gives whatever the draw produced, including negative
 * yields on a gilt bought at a premium to a low-coupon bond, which no investor
 * would hold.
 */
function bondPrice(
  nominal: number,
  couponRate: number,
  marketYield: number,
): number {
  const couponPayment = (nominal * couponRate) / 100;
  return round((couponPayment + nominal) / (1 + marketYield / 100), 2);
}

/**
 * Annual yield on a bond bought at `price` and redeemed at `nominal`.
 *
 * Yield is income plus any capital gain, over the price paid. Using the coupon
 * alone is the standard error: it is only correct when price equals nominal.
 */
function bondYield(nominal: number, couponRate: number, price: number): number {
  const couponPayment = (nominal * couponRate) / 100;
  const gain = nominal - price;
  return round(((couponPayment + gain) / price) * 100, 2);
}

/** Annual coupon payment on a bond. */
function coupon(nominal: number, couponRate: number): number {
  return round((nominal * couponRate) / 100, 2);
}

// ================================================== 4.3.1 Financial markets

const marketGenerators: Generator[] = [
  {
    key: "econ-fin-bond-yield",
    base: 0.3,
    span: 1.7,
    build: ({ rng, tier }) => {
      const nominal = rng.pick([100, 1000, 10000]);
      const couponRate = rng.pick([2, 2.5, 3, 4, 5, 6]);
      /*
        Market yield drawn away from the coupon rate, and the price solved from
        it.

        Drawing the price first produced negative yields on premiums: a 3%
        coupon bought at £105 loses £5 to redemption, so the return is negative
        and no investor would hold the bond. Working from a market yield keeps
        both the sign and the size believable.
      */
      const marketYield = round(
        couponRate + (rng.bool() ? 1 : -1) * rng.pick([0.5, 1, 1.5, 2]),
        2,
      );
      const price = bondPrice(nominal, couponRate, marketYield);
      const y = bondYield(nominal, couponRate, price);
      const annual = coupon(nominal, couponRate);

      return numericQuestion(
        `A government bond has a nominal value of £${nominal.toLocaleString("en-GB")} and pays a fixed coupon of ${couponRate}% a year. An investor buys it for £${price.toLocaleString("en-GB")} and holds it to maturity, when it is redeemed at nominal value.\n\nCalculate the annual yield on the bond, as a percentage of the price paid, to two decimal places.`,
        y,
        {
          unit: "%",
          dp: 2,
          marks: tier <= 2 ? 3 : 4,
          solution: [
            step("Coupon income", `Annual coupon = ${couponRate}% × £${nominal.toLocaleString("en-GB")} = £${annual.toLocaleString("en-GB")}.`),
            step(
              "Capital gain or loss",
              price < nominal
                ? `The bond is bought below nominal, so there is a capital gain of £${round(nominal - price, 2).toLocaleString("en-GB")} at redemption.`
                : price > nominal
                  ? `The bond is bought above nominal, so there is a capital loss of £${round(price - nominal, 2).toLocaleString("en-GB")} at redemption.`
                  : "The bond is bought at nominal value, so there is no capital gain or loss.",
            ),
            step(
              "Total return over the price paid",
              `$Y = \\dfrac{£${annual.toLocaleString("en-GB")} \\pm £${round(Math.abs(nominal - price), 2).toLocaleString("en-GB")}}{£${price.toLocaleString("en-GB")}} \\times 100 = ${y}\\%$`,
            ),
            step(
              "Why this is not the coupon rate",
              `The coupon of ${couponRate}% is a cash amount fixed for the bond's life. The yield is measured against the price paid, which here is £${price.toLocaleString("en-GB")} rather than £${nominal.toLocaleString("en-GB")}.`,
            ),
          ],
          takeaway:
            "Yield is the return over the price you paid. A bond bought below nominal yields more than its coupon, and a bond bought above nominal yields less.",
        },
      );
    },
  },
  {
    key: "econ-fin-bond-price-yield-inverse",
    base: 0.6,
    span: 1.4,
    build: ({ rng }) => {
      const moveUp = rng.bool();
      const original = moveUp ? 2.5 : 4;
      const newRate = moveUp ? 4 : 2.5;
      const nominal = 100;
      const priceBefore = round(nominal * (original / newRate), 2);

      return choiceQuestion(
        `A bond with a fixed coupon of 4% a year has a market price of £${priceBefore} per £${nominal} of nominal value.\n\nMarket interest rates then ${moveUp ? "rise" : "fall"} from ${original}% to ${newRate}%. What happens to the bond's price and its yield?`,
        moveUp
          ? "The price falls and the yield rises, because a new bond issued at the higher rate pays more, so the old bond must be discounted until its yield matches."
          : "The price rises and the yield falls, because a new bond issued at the lower rate pays less, so the old bond gains a premium until its yield matches.",
        moveUp
          ? [
              "The price falls and the yield falls, because a lower price always means a lower return to the buyer",
              "The price and the yield both rise, because bond prices track interest rates directly",
              "Neither changes, because the coupon is fixed for the life of the bond",
            ]
          : [
              "The price rises and the yield rises, because a higher price always means a higher return",
              "The price falls and the yield falls, because lower rates reduce the value of future coupon payments",
              "Neither changes, because the coupon is fixed for the life of the bond",
            ],
        {
          rng,
          marks: 3,
          solution: [
            step("The coupon is fixed, so the value of it is not", "A fixed coupon of £4 a year is worth less when market rates are high and more when they are low, so the price has to move to compensate."),
            step(
              "Price and yield move inversely",
              "The yield is measured over the price paid. Discounting the bond raises the yield on the same cash flows, so a price fall and a yield rise are the same event described twice.",
            ),
          ],
          takeaway:
            "Bond prices and bond yields move in opposite directions. Remember this as a pair: price down, yield up.",
        },
      );
    },
  },
  {
    key: "econ-fin-money-market-instrument",
    base: -0.3,
    span: 1.5,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "A large supermarket issues an unsecured promissory note repayable in three months, at a rate above the rate on Treasury bills.",
          correct:
            "This is commercial paper: a short-term unsecured instrument issued by a company, so it carries corporate rather than government credit risk.",
          wrong: [
            "This is a Treasury bill, so the higher rate reflects the difference in maturity rather than in credit risk",
            "This is a certificate of deposit, so the supermarket has borrowed from a commercial bank",
            "This is a corporate bond, so it trades on the stock exchange rather than in the money market",
          ],
        },
        {
          stem:
            "The government issues an instrument repayable at nominal value in six months, sold below nominal value to the investor.",
          correct:
            "This is a Treasury bill: a short-term government security whose return comes from the difference between the issue price and the redemption price, not from a coupon.",
          wrong: [
            "This is a corporate bond, so the government is the issuer but the credit risk is private",
            "This is a certificate of deposit, so it was issued by a commercial bank rather than the government",
            "This is a gilt-edged bond with a fixed coupon of the difference between issue and redemption price",
          ],
        },
        {
          stem:
            "A bank offers a customer a fixed deposit at an agreed rate for two years, which the customer then sells on before the maturity date.",
          correct:
            "This is a certificate of deposit: a money market instrument that can be traded before its fixed term ends.",
          wrong: [
            "This is a gilt-edged bond, because it is sold on before the date it matures",
            "This is a share issue, because the bank has raised equity rather than debt finance",
            "This is commercial paper, because it was issued by a bank rather than a non-financial company",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhich instrument is being described?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("Check the issuer and the maturity", "Government issuer with under a year to maturity is a Treasury bill. Company issuer with under a year to maturity is commercial paper. Bank deposit with a fixed term is a certificate of deposit."),
            step(
              "Check how the return is earned",
              "Treasury bills and commercial paper pay through the gap between issue and redemption price. Certificates of deposit pay a stated interest rate. Bonds pay a fixed coupon.",
            ),
          ],
          takeaway:
            "Money market instruments are all short term, under a year. Identify one by who issues it and how the return is paid.",
        },
      );
    },
  },
  {
    key: "econ-fin-primary-secondary",
    base: 0.5,
    span: 1.4,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "A company sells 10 million new shares to institutional investors at £4 each, and the shares then trade at £5.20 on the stock exchange.",
          correct:
            "The £4 sale was a primary market transaction and raised £40m for the company. Trading at £5.20 is a secondary market transaction and raises money for the selling investor, not the company.",
          wrong: [
            "Both transactions are on the secondary market, because they are both shares in the same company",
            "The £4 sale is secondary and the £5.20 trade is primary, because the higher price benefits the company",
            "Both transactions raise finance for the company, because every share sold adds to its capital",
          ],
        },
        {
          stem:
            "The government sells £3bn of Treasury bills to a bank, and the bank later sells them to a pension fund at a higher price.",
          correct:
            "The sale to the bank is the primary market, where the issuer raises the finance. The sale to the pension fund is the secondary market, where no new finance reaches the government.",
          wrong: [
            "Both sales are secondary, because the government issued the bills long before either transaction",
            "The sale to the bank is primary, but the sale to the pension fund raises additional finance for the government",
            "The sale to the pension fund is primary, because a higher price means more finance reaches the government",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhich statement correctly distinguishes the two markets?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 3,
          solution: [
            step("The question is where the money goes", "Primary market means the issuer receives the money. Secondary market means the money goes to the investor selling."),
            step(
              "Why it matters",
              "A company cannot rely on day-to-day share price movements to raise finance, because no new money reaches it. Only a primary issue does.",
            ),
          ],
          takeaway:
            "A stock exchange is a secondary market. Firms raise finance by issuing new securities in the primary market, not by trading existing shares.",
        },
      );
    },
  },
];

// ================================================== 4.3.2 Central banking

const centralBankGenerators: Generator[] = [
  {
    key: "econ-fin-base-rate-effect",
    base: 0.1,
    span: 1.5,
    build: ({ rng }) => {
      const direction = rng.bool();
      const before = rng.pick([0.5, 1, 2, 3, 4, 5]);
      const cut = rng.pick([0.25, 0.5, 0.75, 1]);
      const after = direction ? round(before - cut, 2) : round(before + cut, 2);

      return choiceQuestion(
        `The central bank sets its base rate at **${before}%** and then ${direction ? "cuts" : "raises"} it to **${after}%**.\n\nWhich chain correctly describes the effect on aggregate demand?`,
        direction
          ? `Base rate ${before}% → ${after}% → banks charge lower rates on loans → borrowing rises and interest on savings falls → consumption and investment rise → AD rises.`
          : `Base rate ${before}% → ${after}% → banks charge higher rates on loans → borrowing falls and interest on savings rises → consumption and investment fall → AD falls.`,
        direction
          ? [
              `Base rate ${before}% → ${after}% → households receive higher interest on savings → consumption and investment rise → AD rises`,
              `Base rate ${before}% → ${after}% → the money supply rises by the size of the cut → AD rises directly and immediately`,
              `Base rate ${before}% → ${after}% → firms' costs of production rise → SRAS shifts left → AD rises`,
            ]
          : [
              `Base rate ${before}% → ${after}% → households receive lower interest on savings → consumption and investment rise → AD rises`,
              `Base rate ${before}% → ${after}% → the money supply falls by the size of the rise → AD falls directly and immediately`,
              `Base rate ${before}% → ${after}% → firms' costs of production fall → SRAS shifts right → AD falls`,
            ],
        {
          rng,
          marks: 4,
          solution: [
            step("Every chain needs all four links", "Policy rate, then market rates, then spending decisions, then aggregate demand. Any answer that jumps from the policy rate straight to AD has missed two links."),
            step(
              "The second link is banks' own pricing",
              "The base rate is the rate at which banks borrow. Lending rates sit above it, and banks do not have to pass every change on, so the second link can weaken.",
            ),
          ],
          takeaway:
            "Monetary policy is indirect. Write the chain out in full and you will not lose the method marks; skipping to 'AD falls' is what loses them.",
        },
      );
    },
  },
  {
    key: "econ-fin-transmission-weak-link",
    base: 0.7,
    span: 1.5,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "The central bank cuts the base rate to 1%, but lenders keep their lending rates unchanged because they expect higher defaults.",
          correct:
            "Transmission has broken at the second link: the policy rate has reached banks but not borrowers, so the change in interest-sensitive spending, and therefore AD, is much smaller than intended.",
          wrong: [
            "Transmission has worked, because the policy rate is the rate that matters for households and firms",
            "Transmission has broken at the last link, because AD is unresponsive to interest rates",
            "Transmission has worked, because lower defaults will follow once the policy rate has fallen",
          ],
        },
        {
          stem:
            "The central bank cuts the base rate by 1%, and mortgage approvals rise by 40% over the following year.",
          correct:
            "Transmission has worked: the policy rate passed to lending rates, which affected a borrowing-sensitive spending decision, which raised AD and output.",
          wrong: [
            "Transmission has failed, because the effect on AD must be visible within one quarter",
            "Transmission has worked only in the money market, because mortgages are not part of aggregate demand",
            "Transmission has failed, because a 40% rise in approvals is far too large to be credible",
          ],
        },
        {
          stem:
            "The central bank cuts the base rate to 0.25%, but households already on fixed-rate mortgages see no change in their monthly payments for two years.",
          correct:
            "Transmission is delayed rather than broken: existing fixed-rate borrowers are unaffected until they remortgage, so the effect on consumption builds up slowly.",
          wrong: [
            "Transmission has failed, because the policy rate has reached its floor and cannot go lower",
            "Transmission has worked, because fixed-rate borrowers will eventually face a higher rate",
            "Transmission has failed, because mortgage interest is part of the money supply rather than the price of credit",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhat does this show about the transmission mechanism?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 4,
          solution: [
            step("Locate the evidence on the chain", "Policy rate, market rates, spending decisions, AD, output. The evidence given sits at one of these links, and the question is which."),
            step(
              "Distinguish delay from failure",
              "A slow pass-through through fixed-rate contracts is a time lag, not a broken mechanism. A refusal to lend is a failure at the rate-setting link.",
            ),
          ],
          takeaway:
            "Evaluation marks on transmission come from naming the link that is weak or slow. 'It takes time' earns nothing on its own.",
        },
      );
    },
  },
  {
    key: "econ-fin-monetary-target-evaluation",
    base: 1.0,
    span: 1.3,
    build: ({ rng }) => {
      const scenario = rng.pick([
        {
          stem:
            "Inflation has been 4% for three years against a 2% target, and the central bank has raised rates at every meeting for eighteen months.",
          correct:
            "The policy has failed to reach the target, and the evaluation point is that monetary policy is blunt: it cannot reduce supply-side inflation, and its effect on demand arrives with a long lag.",
          wrong: [
            "The policy has succeeded, because the absence of deflation shows that it has stabilised prices",
            "The policy has failed because the central bank should control the price level rather than the inflation rate",
            "The policy has succeeded, because raising rates always reduces inflation within two quarters",
          ],
        },
        {
          stem:
            "Inflation is 1.5% against a 2% target, and the central bank has left rates unchanged for a year despite weak growth.",
          correct:
            "There is a case for leaving rates alone if the central bank judges the target broadly met, but weak growth raises the risk that demand collapses and undershoots the target.",
          wrong: [
            "Rates must rise, because an inflation rate below target always requires a higher policy rate",
            "Rates must fall immediately, because any inflation below target proves policy is too tight",
            "There is no case for changing policy, because the central bank has no responsibility for growth",
          ],
        },
      ]);

      return choiceQuestion(
        scenario.stem + "\n\nWhich evaluation of the central bank's position is best?",
        scenario.correct,
        scenario.wrong,
        {
          rng,
          marks: 4,
          solution: [
            step("The target is a rate, not a price level", "A 2% inflation target is compatible with rising prices. It constrains the rate of change, which is why deflation is also a failure."),
            step(
              "Then the limits of the instrument",
              "Interest rates affect borrowing-sensitive demand. They do not affect supply shocks, and the effect of a change arrives with a lag that can outlast a policy cycle.",
            ),
          ],
          takeaway:
            "Evaluate monetary policy against its own target and its own instrument. Saying rates 'should have been different' without a mechanism caps the answer at Level 2.",
        },
      );
    },
  },
  {
    key: "econ-fin-cumulative-effect",
    base: 1.2,
    span: 1.2,
    build: ({ rng }) => {
      const direction = rng.bool();
      const moves = rng.pick([3, 4, 5]);

      return choiceQuestion(
        `The central bank has ${direction ? "raised" : "cut"} its base rate at ${moves} consecutive meetings, by ${direction ? "0.25" : "0.25"} percentage points each time.\n\nWhy might the total effect differ from ${direction ? "a single" : "a single"} rise of ${direction ? "0.25" : "0.25"} percentage points?`,
        `The effects are cumulative: each change builds on the previous one through the multiplier and through expectations, so the combined effect is greater than the single change.`,
        [
          `They are identical, because interest rates have no cumulative effect on spending decisions`,
          `The total effect is smaller, because each rate rise reduces the marginal effect of the next one to zero`,
          `The total effect is only larger if the central bank announces the changes in advance`,
        ],
        {
          rng,
          marks: 3,
          solution: [
            step("Policy is not additive", "Each successive change operates on an economy already adjusted to the previous one, so expectations and the multiplier mean the effects compound."),
            step(
              "Why it matters for evaluation",
              "Cumulative policy is a reason to be cautious about small regular adjustments: by the time the full effect is visible, the conditions that justified the first change may have passed.",
            ),
          ],
          takeaway:
            "Repeated changes to the policy rate have a cumulative effect larger than any single change. That is why the timing of the first decision constrains the last.",
        },
      );
    },
  },
];

registerGenerators(["econ-4.3.1"], marketGenerators);
registerGenerators(["econ-4.3.2"], centralBankGenerators);