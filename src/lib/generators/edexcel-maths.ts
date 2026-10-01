import { registerGenerators } from "./registry";
import type { Generator } from "./types";
import { choiceQuestion, numericQuestion, step } from "./types";
import { round, standardNormalCdf, standardNormalUpperTail } from "@/lib/math-utils";
import { Rng } from "@/lib/rng";

// =========================================================== Topic 1: Proof

const proofGenerators: Generator[] = [
  {
    key: "proof-induction-sum",
    base: 0.3,
    span: 1.8,
    build: ({ rng, tier }) => {
      const a = rng.int(2, 9);
      const d = rng.int(1, 4);
      const n = rng.int(4, 12);
      const sum = (n * (2 * a + (n - 1) * d)) / 2;
      return numericQuestion(
        `Prove by mathematical induction that the sum of the first $n$ terms of the arithmetic progression $${a}, ${a + d}, ${a + 2 * d}, \\dots$ is $\\tfrac{n}{2}\\big(2a + (n-1)d\\big)$. Using this result, find the sum of the first **${n}** terms.`,
        sum,
        {
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step(
              "Base case",
              `For $n = 1$ the sum is $${a}$ and $\\tfrac{1}{2}(2(${a}) + 0 \\cdot ${d}) = ${a}$. Holds.`,
            ),
            step(
              "Inductive hypothesis",
              `Assume true for $n = k$: $S_k = \\tfrac{k}{2}\\big(2a + (k-1)d\\big)$.`,
            ),
            step(
              "Inductive step",
              `$S_{k+1} = S_k + \\big(a + kd\\big) = \\tfrac{k}{2}\\big(2a + (k-1)d\\big) + a + kd$`,
              `= [k(2a + kd - d) + 2a + 2kd] / 2 = [2a(k+1) + kd(k+1)] / 2`,
            ),
            step(
              "Conclude",
              `$= \\tfrac{k+1}{2}\\big(2a + kd\\big)$, which is the claim for $n = k+1$. Induction complete.`,
              "",
            ),
            step(
              "Evaluate",
              `$S_{${n}} = \\tfrac{${n}}{2}\\big(2(${a}) + ${n - 1}(${d})\\big)$`,
              `= ${round(sum, 2)}`,
            ),
          ],
          takeaway:
            "Induction is three parts: base case, inductive hypothesis, inductive step.",
          extraSkillIds: ["em-4"],
        },
      );
    },
  },
  {
    key: "proof-counter-example",
    base: -0.7,
    span: 1.4,
    build: ({ rng }) => {
      const n = rng.int(3, 9);
      const claims = [
        {
          claim: `Every multiple of ${n} is even.`,
          counter: `${2 * n} = ${2 * n}, which is even. Pick the multiple $3\\times${n} = ${3 * n}$, which is odd.`,
          answer: `3 × ${n} = ${3 * n}, an odd number`,
        },
        {
          claim: "The square of every integer is odd.",
          counter: "$1^2 = 1$ is odd, so try the smallest even integer: $2^2 = 4$, which is even.",
          answer: "$2^2 = 4$, which is even",
        },
        {
          claim: "If $a > b$ then $a^2 > b^2$ for all real numbers.",
          counter: "Take $a = 1$, $b = -2$. Then $a > b$ but $a^2 = 1 < 4 = b^2$.",
          answer: "$a = 1,\\ b = -2$: then $a > b$ but $1 < 4$",
        },
      ];
      const pick = rng.pick(claims);
      return choiceQuestion(
        `Disprove the statement "${pick.claim}" by means of a counter-example.`,
        pick.answer,
        [
          "The statement is actually true for all values",
          "No counter-example exists because the statement is a definition",
          "It can only be disproved using mathematical induction",
        ],
        {
          rng,
          marks: 2,
          solution: [
            step("Recall", "One valid counter-example is enough to disprove a universal statement."),
            step("Test small values", pick.counter),
          ],
          takeaway:
            "A single counter-example destroys a universal claim; induction would be needed to prove it.",
        },
      );
    },
  },
  {
    key: "proof-irrationality",
    base: 0.5,
    span: 1.6,
    build: ({ rng, tier }) => {
      const q = tier >= 4 ? rng.pick([2, 3, 5]) : 2;
      const pairs: Record<number, { square: number; assume: string; step: string }> = {
        2: {
          square: 4,
          assume: "$\\sqrt{2} = \\frac{p}{q}$ in lowest terms, so $p^2 = 2q^2$.",
          step:
            "Then $p$ is even. Writing $p = 2k$ gives $4k^2 = 2q^2$, so $q^2 = 2k^2$ and $q$ is even too. This contradicts p and q being in lowest terms.",
        },
        3: {
          square: 9,
          assume: "$\\sqrt{3} = \\frac{p}{q}$ in lowest terms, so $p^2 = 3q^2$.",
          step:
            "Then $3 \\mid p^2$, so $3 \\mid p$; writing $p = 3k$ gives $9k^2 = 3q^2$, so $q^2 = 3k^2$ and $3 \\mid q$. Contradiction.",
        },
        5: {
          square: 25,
          assume: "$\\sqrt{5} = \\frac{p}{q}$ in lowest terms, so $p^2 = 5q^2$.",
          step:
            "Then $5 \\mid p$, so $p = 5k$, giving $25k^2 = 5q^2$ and $q^2 = 5k^2$, so $5 \\mid q$. Contradiction.",
        },
      };
      const chosen = pairs[q];
      return choiceQuestion(
        "Which step completes the proof by contradiction that $\\sqrt{" + q + "}$ is irrational?",
        chosen.step,
        [
          `Therefore $q$ must be even, which is impossible since $q \\ne 0$.`,
          `Therefore $\\sqrt{${q}}$ must be rational after all.`,
          `Therefore the assumption must have been correct, so no contradiction arises.`,
        ],
        {
          rng,
          marks: 3,
          solution: [
            step("Assume the negation", chosen.assume),
            step("Deduce", chosen.step),
            step(
              "Conclude",
              `Both p and q share a factor, contradicting lowest terms. Hence $\\sqrt{${q}}$ is irrational.`,
            ),
          ],
          takeaway: `√${q} is irrational because ${q} is not a perfect square; use contradiction plus lowest terms.`,
        },
      );
    },
  },
  {
    key: "proof-exhaustion",
    base: 0.1,
    span: 1.2,
    build: ({ rng }) => {
      const primes: Record<number, number[]> = {
        5: [7, 11, 13, 17, 19, 23],
        7: [11, 13, 17, 19, 23],
        11: [13, 17, 19, 23],
      };
      const p = rng.pick(Object.keys(primes).map(Number));
      const list = primes[p];
      return choiceQuestion(
        `Prove by exhaustion that $(p-1)(p+1)$ is a multiple of 12 for every prime $p$ with $${p} < p < 25$. Which set of values must you check?`,
        list.join(", "),
        [
          `${list.slice(1).concat(29).join(", ")}`,
          `${list.slice(0, 3).join(", ")}`,
          "Only $p = 11$ and $p = 23$, since those are the only primes ending in 3",
        ],
        {
          rng,
          marks: 3,
          solution: [
            step(
              "List the primes in the interval",
              `Primes strictly between ${p} and 25 are: ${list.join(", ")}.`,
            ),
            step(
              "Verify each",
              "For each, $(p-1)$ and $(p+1)$ are consecutive even numbers, so $4 \\mid (p^2-1)$. Since none of these primes is 3, $p^2 \\equiv 1 \\pmod 3$, so $3 \\mid (p^2-1)$. Hence $12 \\mid (p-1)(p+1)$.",
            ),
          ],
          takeaway: `Exhaustion works for small prime ranges below 25; above that it stops being tractable.`,
        },
      );
    },
  },
];

registerGenerators(["em-1"], proofGenerators);

// ============================================= Topic 2: Algebra and functions

const algebraGenerators: Generator[] = [
  {
    key: "algebra-quadratic-roots",
    base: -0.6,
    span: 1.8,
    build: ({ rng }) => {
      const r1 = rng.int(-8, 8);
      const r2 = rng.int(-8, 8);
      if (r1 === r2 && rng.bool(0.5)) return buildQuadraticRepeated(r1);
      const b = -(r1 + r2);
      const c = r1 * r2;
      const sum = -b;
      return numericQuestion(
        `The quadratic equation $x^2 ${signed(b)}x ${signed(c)} = 0$ has roots $\\alpha$ and $\\beta$. Work out the value of $\\alpha + \\beta$.`,
        sum,
        {
          marks: 2,
          solution: [
            step("Identify", `Coefficients: a = 1, b = ${b}, c = ${c}.`),
            step(
              "Use the sum of roots",
              `$\\alpha + \\beta = -\\tfrac{b}{a} = -(${b}) = ${sum}$`,
              `= ${sum}`,
            ),
          ],
          takeaway: "For ax² + bx + c = 0, the sum of the roots is −b/a and the product is c/a.",
        },
      );
    },
  },
  {
    key: "algebra-quadratic-solve",
    base: 0.2,
    span: 2,
    build: ({ rng, tier }) => {
      const r1 = rng.int(-9, 9);
      const r2 = rng.int(-9, 9);
      if (r1 === r2) return buildQuadraticRepeated(r1);
      const b = -(r1 + r2);
      const c = r1 * r2;
      const sol = [...new Set([r1, r2])].sort((x, y) => x - y);
      if (tier <= 2) {
        return numericQuestion(
          `Solve $x^2 ${signed(b)}x ${signed(c)} = 0$, giving the smaller root.`,
          sol[0],
          {
            solution: [
              step("Discriminant", `$\\Delta = ${b}^2 - 4(1)(${c}) = ${disc(b, c)}$`),
              step("Formula", `$x = \\tfrac{${-b} \\pm \\sqrt{${disc(b, c)}}}{2}$`, `$x = ${sol.join(", ")}$`),
            ],
            takeaway: "Factorise where you can; the quadratic formula always works.",
          },
        );
      }
      return numericQuestion(
        `Solve $x^2 ${signed(b)}x ${signed(c)} = 0$, giving the larger root.`,
        sol[sol.length - 1],
        {
          marks: 3,
          solution: [
            step("Discriminant", `$\\Delta = (${b})^2 - 4 \\times 1 \\times (${c}) = ${disc(b, c)}$`),
            step(
              "Apply the formula",
              `$x = \\dfrac{${-b} \\pm \\sqrt{${disc(b, c)}}}{2 \\times 1}$`,
              `$x = ${sol.join(" \\text{ or } ")}$`,
            ),
          ],
          takeaway: "Always state both roots, then answer the part that was asked.",
        },
      );
    },
  },
  {
    key: "algebra-discriminant",
    base: -0.3,
    span: 1.6,
    build: ({ rng, tier }) => {
      const a = rng.pick([1, 1, 1, 2, 3]);
      const b = rng.int(-9, 9);
      const c = rng.int(-9, 9);
      const d = b * b - 4 * a * c;
      const wantRoot = tier >= 3;
      return numericQuestion(
        wantRoot
          ? `How many distinct real solutions does $${a}x^2 ${signed(b)}x ${signed(c)} = 0$ have?`
          : `Find the discriminant of $${a}x^2 ${signed(b)}x ${signed(c)} = 0$.`,
        wantRoot ? (d > 0 ? 2 : d === 0 ? 1 : 0) : d,
        {
          dp: wantRoot ? 0 : 0,
          solution: [
            step("Discriminant", `$\\Delta = b^2 - 4ac = (${b})^2 - 4(${a})(${c}) = ${d}$`),
            ...(wantRoot
              ? [
                  step(
                    "Interpret",
                    d > 0
                      ? "$\\Delta > 0$ so two distinct real roots."
                      : d === 0
                        ? "$\\Delta = 0$ so one repeated real root."
                        : "$\\Delta < 0$ so no real roots.",
                  ),
                ]
              : []),
          ],
          takeaway: "Δ > 0 two roots, Δ = 0 one repeated root, Δ < 0 no real roots.",
        },
      );
    },
  },
  {
    key: "algebra-complete-square",
    base: 0.3,
    span: 1.8,
    build: ({ rng, tier }) => {
      const h = rng.int(-6, 6);
      const k = rng.int(-9, 9);
      const m = rng.pick([1, 1, 2, 3]);
      // Build the expanded form of y = m(x - h)^2 + k
      const b = -2 * h * m;
      const c = m * (h * h + k);
      return numericQuestion(
        `Complete the square for $y = ${m === 1 ? "" : m}x^2 ${signed(b)}x ${signed(c)}$. What is the minimum value of $y$?`,
        k,
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step(
              "Halve the coefficient of x, divide by the leading coefficient",
              `$\\tfrac{${b}}{${2 * m}} = ${round(b / (2 * m), 3)}$`,
              `So the bracket is $\\left(x ${signed(-h)}\\right)$`,
            ),
            step("Expand and check", `$${m}(x ${signed(-h)})^2 = ${m}x^2 ${signed(-2 * h * m)}x ${signed(m * h * h)}$`),
            step(
              "Subtract to find the constant",
              `${c} - ${m * h * h} = ${k}`,
              `So $y = ${m === 1 ? "" : m}\\left(x ${signed(-h)}\\right)^2 ${signed(k)}$`,
            ),
            step(
              "Minimum",
              `The squared bracket is $\\ge 0$ and equals 0 when $x = ${h}$.`,
              `Minimum $y = ${k}$`,
            ),
          ],
          takeaway: "Find the minimum where the squared bracket vanishes.",
        },
      );
    },
  },
  {
    key: "algebra-surd",
    base: -0.5,
    span: 1.8,
    build: ({ rng, tier }) => {
      const m = rng.pick([2, 3, 5, 6, 7, 11]);
      const n = rng.pick([2, 3, 5, 6, 13]);
      const k = rng.int(2, 9);
      if (tier >= 4) {
        // k / sqrt(m)  ->  k*sqrt(m) / m
        return numericQuestion(
          `Rationalise the denominator of $\\dfrac{${k}}{\\sqrt{${m}}}$. Give your answer as a decimal.`,
          (k * Math.sqrt(m)) / m,
          {
            dp: 4,
            marks: 3,
            solution: [
              step(
                "Multiply by the surd",
                `$\\dfrac{${k}}{\\sqrt{${m}}} \\times \\dfrac{\\sqrt{${m}}}{\\sqrt{${m}}} = \\dfrac{${k}\\sqrt{${m}}}{${m}}$`,
              ),
              step("Denominator is now rational", `= ${round((k * Math.sqrt(m)) / m, 4)}`),
            ],
            takeaway: `Multiply by √${m}/√${m} to make the denominator ${m}.`,
          },
        );
      }
      // k*sqrt(n) / sqrt(m)  ->  k*sqrt(n*m) / m
      return numericQuestion(
        `Simplify $\\dfrac{${k}\\sqrt{${n}}}{\\sqrt{${m}}}$, giving your answer as a decimal.`,
        (k * Math.sqrt(n * m)) / m,
        {
          dp: 4,
          marks: 3,
          solution: [
            step(
              "Multiply by √m",
              `$\\dfrac{${k}\\sqrt{${n}}}{\\sqrt{${m}}} \\times \\dfrac{\\sqrt{${m}}}{\\sqrt{${m}}} = \\dfrac{${k}\\sqrt{${n * m}}}{${m}}$`,
            ),
            step("Index law inside a root", `$\\sqrt{${n}} \\times \\sqrt{${m}} = \\sqrt{${n * m}}$`),
            step("Numerically", `= ${round((k * Math.sqrt(n * m)) / m, 4)}`),
          ],
          takeaway: "√n ÷ √m = √(n÷m); multiply top and bottom to rationalise.",
        },
      );
    },
  },
  {
    key: "algebra-indices",
    base: -1,
    span: 1.8,
    build: ({ rng }) => {
      const m = rng.int(2, 7);
      const n = rng.int(2, 6);
      const mode = rng.pick(["multiply", "divide", "power"] as const);
      if (mode === "multiply") {
        const base = rng.pick([2, 3, 5]);
        const value = base ** (m + n);
        return numericQuestion(
          `Evaluate $${base}^{${m}} \\times ${base}^{${n}}$.`,
          value,
          {
            solution: [
              step("Index law", `$a^m \\times a^n = a^{m+n}$`),
              step("Combine", `$${base}^{${m + n}}$`, `= ${value}`),
            ],
            takeaway: "Multiply the indices when multiplying powers with the same base.",
          },
        );
      }
      if (mode === "divide") {
        const base = rng.pick([2, 3, 5, 10]);
        const hi = Math.max(m, n) + rng.int(1, 4);
        const lo = Math.min(m, n);
        const value = base ** (hi - lo);
        return numericQuestion(
          `Evaluate $\\dfrac{${base}^{${hi}}}{${base}^{${lo}}}$.`,
          value,
          {
            solution: [
              step("Index law", `$a^m \\div a^n = a^{m-n}$`),
              step("Subtract the indices", `${hi} - ${lo} = ${hi - lo}`, `= ${value}`),
            ],
            takeaway: "Divide the indices when dividing powers with the same base.",
          },
        );
      }
      const outer = rng.int(2, 4);
      const base = rng.pick([2, 3]);
      const value = base ** (m * outer);
      return numericQuestion(
        `Evaluate $\\left(${base}^{${m}}\\right)^{${outer}}$.`,
        value,
        {
          solution: [
            step("Index law", `$(a^m)^n = a^{mn}$`),
            step("Multiply the indices", `${m} × ${outer} = ${m * outer}`, `= ${value}`),
          ],
          takeaway: "(aᵐ)ⁿ = aᵐⁿ — multiply the indices, do not raise the base twice.",
        },
      );
    },
  },
  {
    key: "algebra-domain-range",
    base: 0.1,
    span: 1.8,
    build: ({ rng }) => {
      let a = rng.int(-9, 9);
      if (a === 0) a = 3;
      const kind = rng.pick(["domain", "range", "domain", "vertical-asymptote"] as const);
      if (kind === "domain") {
        return choiceQuestion(
          `State the domain of $f(x) = \\dfrac{${a}}{x - 3}$.`,
          "$x \\ne 3$, i.e. $x \\in \\mathbb{R} \\setminus \\{3\\}$",
          ["$x \\in \\mathbb{R}$", "$x > 3$", "$x \\ne 0$ and $x \\ne 3$"],
          {
            rng,
            marks: 2,
            solution: [
              step("Find the denominator", "The denominator $x-3$ must not be zero."),
              step("Exclude", "$x - 3 = 0 \\Rightarrow x = 3$ is excluded."),
            ],
            takeaway: "Domain excludes values that make the denominator zero.",
          },
        );
      }
      if (kind === "range") {
        return choiceQuestion(
          `State the range of $f(x) = \\dfrac{${a}}{x - 3}$.`,
          "$f(x) \\ne 0$, i.e. $y \\in \\mathbb{R} \\setminus \\{0\\}$",
          ["$y \\in \\mathbb{R}$", "$y \\ge 0$", "$y \\ne 3$"],
          {
            rng,
            marks: 2,
            solution: [
              step("Asymptote analysis", "As $x \\to 3$ the function is undefined; as $x \\to \\infty$ it approaches 0."),
              step("Conclusion", "So 0 is approached but never reached."),
            ],
            takeaway: "A reciprocal function never actually takes the value 0.",
          },
        );
      }
      if (kind === "vertical-asymptote") {
        return numericQuestion(
          `The curve $y = \\dfrac{${a}}{x-3}$ has a vertical asymptote. State the $x$-coordinate of that asymptote.`,
          3,
          { solution: [step("Definition", "Vertical asymptote: the vertical line the curve approaches but never reaches."), step("Denominator zero", "$x - 3 = 0 \\Rightarrow x = 3$")], takeaway: "Vertical asymptotes come from the denominator." },
        );
      }
      return choiceQuestion(
        `Which of these is the domain of $g(x) = \\sqrt{${Math.abs(a)} - x}$?`,
        `$x \\le ${Math.abs(a)}$`,
        [`$x \\ge ${Math.abs(a)}$`, "$x \\in \\mathbb{R}$", `$x < ${Math.abs(a)}$`],
        {
          rng,
          marks: 2,
          solution: [
            step("Square root constraint", "The expression inside the root must be zero or positive."),
            step("Solve", `$${Math.abs(a)} - x \\ge 0 \\Rightarrow x \\le ${Math.abs(a)}$`),
          ],
          takeaway: "A square root restricts the domain to where the radicand is non-negative.",
        },
      );
    },
  },
  {
    key: "algebra-composite",
    base: 0.8,
    span: 2,
    build: ({ rng, tier }) => {
      const p = rng.int(2, 7);
      const q = rng.int(1, 9);
      const x = rng.int(1, 6);
      const value = p * (x + q) + 3;
      return numericQuestion(
        `Let $f(x) = ${p}x + ${q}$ and $g(x) = x + 3$. Evaluate $g\\big(f(${x})\\big)$.`,
        value,
        {
          marks: 2,
          solution: [
            step("Work inside first", `$f(${x}) = ${p}(${x}) + ${q} = ${p * x + q}$`),
            step("Then apply g", `$g(${p * x + q}) = ${p * x + q} + 3 = ${value}$`),
          ],
          takeaway: "fg(x) means g(f(x)): apply the right-hand function first.",
          extraSkillIds: tier >= 4 ? ["em-5"] : undefined,
        },
      );
    },
  },
  {
    key: "algebra-inequality-quadratic",
    base: 1.0,
    span: 2,
    build: ({ rng }) => {
      const r1 = rng.int(-6, 2);
      const r2 = r1 + rng.int(2, 8);
      const b = -(r1 + r2);
      const c = r1 * r2;
      const lo = Math.min(r1, r2);
      const hi = Math.max(r1, r2);
      return choiceQuestion(
        `Solve the inequality $x^2 ${signed(b)}x ${signed(c)} \\le 0$.`,
        `$${lo} \\le x \\le ${hi}$`,
        [`$${lo} \\le x \\le ${hi}$ but excluding the endpoints`, `$x \\ge ${lo}$`, `$x \\le ${hi}$`],
        {
          rng,
          marks: 3,
          solution: [
            step("Factorise", `$x^2 ${signed(b)}x ${signed(c)} = (x ${signed(-r1)})(x ${signed(-r2)})$`),
            step("Sign analysis", "The parabola opens upwards, so it is non-positive between the roots."),
            step("Conclusion", `$${lo} \\le x \\le ${hi}$, endpoints included because the inequality is $\\le$.`),
          ],
          takeaway: "Upwards parabola, ≤ 0 means between the roots, endpoints included.",
        },
      );
    },
  },
];

function buildQuadraticRepeated(r: number) {
  const b = -2 * r;
  const c = r * r;
  return numericQuestion(
    `Solve $x^2 ${signed(b)}x ${signed(c)} = 0$, giving the root.`,
    r,
    {
      solution: [
        step("Spot", `$x^2 ${signed(b)}x ${signed(c)} = \\left(x ${signed(-r)}\\right)^2$`),
        step(
          "Solve",
          `\\left(x ${signed(-r)}\\right)^2 = 0 \\Rightarrow x ${signed(-r)} = 0`,
          `x = ${r}`,
        ),
      ],
      takeaway: "A repeated root means a perfect square — check for that before using the formula.",
    },
  );
}

function disc(b: number, c: number): number {
  return b * b - 4 * c;
}

/**
 * Render a coefficient as a LaTeX term with its sign, e.g. `- 3` -> `-3`,
 * `+ 3` -> `+ 3`. Avoids the "− −" double-sign that a naive template produces.
 */
function signed(n: number): string {
  return n < 0 ? `-${Math.abs(n)}` : `+ ${n}`;
}

registerGenerators(["em-2"], algebraGenerators);

// =========================================== Topic 3: Coordinate geometry

const coordGeomGenerators: Generator[] = [
  {
    key: "coordgeom-line",
    base: -1,
    span: 1.8,
    build: ({ rng, tier }) => {
      const m = rng.pick([-3, -2, -1, -0.5, 1, 2, 3, 4, -0.25]);
      const b = rng.int(-6, 6);
      const x = rng.int(-5, 5);
      const y = m * x + b;
      return numericQuestion(
        `A line has equation $y = ${m}x ${signed(b)}$. Find the $y$-coordinate of the point where the line crosses the vertical line $x = ${x}$.`,
        y,
        {
          dp: 2,
          marks: 1,
          solution: [
            step("Substitute", `$y = ${m}(${x}) ${signed(b)} = ${round(y, 2)}$`),
          ],
          takeaway: "For a line in y = mx + c form, substitute the given x.",
          extraSkillIds: tier >= 4 ? ["em-2"] : undefined,
        },
      );
    },
  },
  {
    key: "coordgeom-gradient",
    base: -1.1,
    span: 1.8,
    build: ({ rng }) => {
      const x1 = rng.int(-6, 2);
      const y1 = rng.int(-6, 6);
      let x2 = rng.int(3, 8);
      const y2 = rng.int(-6, 6);
      if (x1 === x2) x2 = x1 + 3;
      const m = (y2 - y1) / (x2 - x1);
      return numericQuestion(
        `Find the gradient of the line joining the points $A(${x1}, ${y1})$ and $B(${x2}, ${y2})$.`,
        m,
        {
          dp: 3,
          marks: 2,
          solution: [
            step(
              "Formula",
              "$m = \\dfrac{y_2 - y_1}{x_2 - x_1}$",
              `$= \\dfrac{${y2} - (${y1})}{${x2} - (${x1})} = \\dfrac{${y2 - y1}}{${x2 - x1}}$`,
            ),
            step("Simplify", `m = ${round(m, 3)}`),
          ],
          takeaway: "Gradient = rise ÷ run. Subtract the first point from the second.",
        },
      );
    },
  },
  {
    key: "coordgeom-perpendicular-distance",
    base: 0.2,
    span: 2,
    build: ({ rng }) => {
      const px = rng.int(-6, 6);
      const py = rng.int(-6, 6);
      const m = rng.pick([1, 2, 3, -1, -2, 0.5]);
      const b = rng.int(-5, 5);
      const distance = Math.abs(px - (m * px + b)) / Math.sqrt(m * m + 1);
      return numericQuestion(
        `Find the perpendicular distance from the point $P(${px}, ${py})$ to the line $y = ${m}x ${signed(b)}$.`,
        distance,
        {
          dp: 3,
          marks: 4,
          solution: [
            step("Rearrange into $ax+by+c=0$", `$${m}x - y ${signed(-b)} = 0$`),
            step(
              "Point-line distance formula",
              "$d = \\dfrac{|ax_0 + by_0 + c|}{\\sqrt{a^2+b^2}}$",
              `$= \\dfrac{|${m}(${px}) - (${py}) ${signed(-b)}|}{\\sqrt{${m}^2 + (-1)^2}}$`,
            ),
            step("Numerator", `$|${round(m * px - py - b, 3)}| = ${round(Math.abs(m * px - py - b), 3)}$`),
            step("Denominator", `$\\sqrt{${round(m * m + 1, 3)}} = ${round(Math.sqrt(m * m + 1), 3)}$`),
            step("Answer", `d = ${round(distance, 3)}`),
          ],
          takeaway: "d = |ax₀ + by₀ + c| / √(a² + b²), with the line as ax + by + c = 0.",
        },
      );
    },
  },
  {
    key: "coordgeom-circle",
    base: -0.8,
    span: 1.8,
    build: ({ rng, tier }) => {
      const a = rng.int(-5, 5);
      const b = rng.int(-5, 5);
      const r = rng.int(2, 7);
      const kind = tier >= 3 ? rng.pick(["diameter", "point"] as const) : "equation";
      if (kind === "diameter") {
        return numericQuestion(
          `A circle has centre $(${a}, ${b})$ and radius ${r}. What is the length of its diameter?`,
          r * 2,
          {
            solution: [
              step("Diameter", "The diameter is twice the radius."),
              step("Calculate", `2 × ${r} = ${r * 2}`),
            ],
            takeaway: "Diameter = 2 × radius.",
          },
        );
      }
      if (kind === "point") {
        // Build four candidate points, exactly one of which lies on the circle.
        const angle = rng.pick([0, 1, 2, 3]);
        const onPoint = [
          [a + r, b],
          [a, b + r],
          [a - r, b],
          [a, b - r],
        ][angle];
        const offPoint = [a + r + 1, b + 1];
        const options = rng.shuffle([
          `(${onPoint[0]}, ${onPoint[1]})`,
          `(${offPoint[0]}, ${offPoint[1]})`,
          `(${a + r}, ${b + r})`,
          `(${a - r - 1}, ${b})`,
        ]);
        return choiceQuestion(
          `The circle has equation $(x ${signed(-a)})^2 + (y ${signed(-b)})^2 = ${r * r}$. Which of these points lies **on** the circle?`,
          `(${onPoint[0]}, ${onPoint[1]})`,
          options.filter((o) => o !== `(${onPoint[0]}, ${onPoint[1]})`),
          {
            rng,
            marks: 3,
            solution: [
              step("Centre-radius form", `Centre $(a, b) = (${a}, ${b})$, radius $r = ${r}$.`),
              step(
                "Test the correct point",
                `$${(onPoint[0] - a) ** 2} + ${(onPoint[1] - b) ** 2} = ${
                  (onPoint[0] - a) ** 2 + (onPoint[1] - b) ** 2
                } = ${r * r}$`,
                "This equals r², so the point lies on the circle.",
              ),
              step("Eliminate the rest", "Each remaining point gives a value greater than r²."),
            ],
            takeaway: "A point is on the circle exactly when (x−a)² + (y−b)² = r².",
          },
        );
      }
      return numericQuestion(
        `The circle has equation $(x ${signed(-a)})^2 + (y ${signed(-b)})^2 = ${r * r}$. Find the length of the radius.`,
        r,
        {
          solution: [
            step("Centre-radius form", "$(x-a)^2 + (y-b)^2 = r^2$, so the RHS is r²."),
            step("Square root", `$r = \\sqrt{${r * r}} = ${r}$`),
          ],
          takeaway: "In centre-radius form the right-hand side is r² — take the square root.",
        },
      );
    },
  },
  {
    key: "coordgeom-midpoint",
    base: -1.5,
    span: 1.4,
    build: ({ rng }) => {
      const x1 = rng.int(-6, 6);
      const y1 = rng.int(-6, 6);
      const x2 = rng.int(-6, 6);
      const y2 = rng.int(-6, 6);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      return numericQuestion(
        `Find the $x$-coordinate of the midpoint of the line segment joining $A(${x1}, ${y1})$ and $B(${x2}, ${y2})$.`,
        midX,
        {
          dp: 1,
          solution: [
            step("Formula", "Midpoint $x = \\dfrac{x_1 + x_2}{2}$"),
            step(
              "Substitute",
              `$\\dfrac{${x1} + ${x2}}{2} = \\dfrac{${x1 + x2}}{2} = ${round(midX, 2)}$`,
            ),
            step("For reference", `The full midpoint is $(${round(midX, 1)}, ${round(midY, 1)})$`),
          ],
          takeaway: "Midpoint = ((x₁+x₂)/2, (y₁+y₂)/2).",
        },
      );
    },
  },
];

registerGenerators(["em-3"], coordGeomGenerators);

// ========================================= Topic 4: Sequences and series

function binomialCoefficient(n: number, r: number): number {
  let result = 1;
  const k = Math.min(r, n - r);
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}

const seriesGenerators: Generator[] = [
  {
    key: "series-arithmetic",
    base: -0.9,
    span: 1.8,
    build: ({ rng, tier }) => {
      const a = rng.int(2, 20);
      const d = rng.int(2, 8);
      const n = rng.int(6, 20);
      const last = a + (n - 1) * d;
      const sum = (n * (a + last)) / 2;
      if (tier <= 2) {
        return numericQuestion(
          `An arithmetic progression starts $${a}, ${a + d}, ${a + 2 * d}, \\dots$ with common difference ${d}. Find term number ${n}.`,
          last,
          {
            dp: 0,
            solution: [
              step("Formula", "$u_n = u_1 + (n-1)d$"),
              step("Substitute", `$u_{${n}} = ${a} + ${n - 1}(${d}) = ${a} + ${(n - 1) * d} = ${last}$`),
            ],
            takeaway: "uₙ = u₁ + (n−1)d.",
          },
        );
      }
      return numericQuestion(
        `An arithmetic progression starts $${a}, ${a + d}, ${a + 2 * d}, \\dots$ with common difference ${d}. Find the sum of the first ${n} terms.`,
        sum,
        {
          dp: 0,
          marks: 3,
          solution: [
            step("Find the last term", `$u_{${n}} = ${a} + ${n - 1}(${d}) = ${last}$`),
            step("Sum formula", "$S_n = \\dfrac{n}{2}(u_1 + u_n)$"),
            step(
              "Substitute",
              `$S_{${n}} = \\dfrac{${n}}{2}(${a} + ${last})$`,
              `= ${round(sum, 2)}`,
            ),
          ],
          takeaway: "Sₙ = n(u₁ + uₙ)/2 for an arithmetic series.",
        },
      );
    },
  },
  {
    key: "series-geometric",
    base: 0.1,
    span: 2,
    build: ({ rng, tier }) => {
      const a = rng.pick([1, 2, 3, 4, 5]);
      const r = rng.pick([1.5, 2, 2.5, 3, 0.5]);
      const n = rng.int(5, 10);
      const sum = (a * (r ** n - 1)) / (r - 1);
      if (tier <= 2) {
        return numericQuestion(
          `A geometric progression has first term ${a} and common ratio ${r}. Find term number ${n}.`,
          a * r ** (n - 1),
          {
            dp: 2,
            solution: [
              step("Formula", "$u_n = u_1 r^{n-1}$"),
              step("Substitute", `$u_{${n}} = ${a} \\times ${r}^{${n - 1}} = ${round(a * r ** (n - 1), 2)}$`),
            ],
            takeaway: "uₙ = u₁ rⁿ⁻¹. Watch the n − 1.",
          },
        );
      }
      return numericQuestion(
        `A geometric progression has first term ${a} and common ratio ${r}. Find the sum to ${n} terms.`,
        sum,
        {
          dp: 2,
          marks: 3,
          solution: [
            step("Formula", "$S_n = \\dfrac{u_1(r^n - 1)}{r - 1}$"),
            step(
              "Substitute",
              `$S_{${n}} = \\dfrac{${a}(${r}^{${n}} - 1)}{${r} - 1}$`,
              `= ${round(sum, 2)}`,
            ),
          ],
          takeaway: "Sₙ = u₁(rⁿ − 1)/(r − 1) for r ≠ 1.",
        },
      );
    },
  },
  {
    key: "series-geometric-infinity",
    base: 0.9,
    span: 1.8,
    build: ({ rng }) => {
      const a = rng.int(4, 20);
      const r = rng.pick([0.1, 0.2, 0.25, 0.5]);
      const sum = a / (1 - r);
      return numericQuestion(
        `A geometric series has first term ${a} and common ratio ${r}. Find the sum to infinity.`,
        sum,
        {
          dp: 2,
          marks: 3,
          solution: [
            step(
              "Condition",
              `The series converges to infinity when $|r| < 1$. Here $r = ${r}$ satisfies that.`,
            ),
            step("Formula", "$S_\\infty = \\dfrac{u_1}{1 - r}$"),
            step("Substitute", `$\\dfrac{${a}}{1 - ${r}} = ${round(sum, 2)}$`),
          ],
          takeaway: "S∞ = u₁/(1 − r) and it only exists for |r| < 1.",
        },
      );
    },
  },
  {
    key: "series-binomial-coefficient",
    base: 0.4,
    span: 2,
    build: ({ rng, tier }) => {
      const n = rng.int(5, 12);
      const r = rng.int(2, n - 2);
      const coeff = binomialCoefficient(n, r);
      if (tier <= 3) {
        return numericQuestion(
          `Find the coefficient of $x^{${r}}$ in the expansion of $(2 + 3x)^{${n}}$.`,
          coeff * 3 ** r,
          {
            dp: 0,
            marks: 3,
            solution: [
              step("General term", "$T_{r} = \\binom{n}{r} a^{n-r} b^{r}$"),
              step("Identify", `Here $a = 2$, $b = 3$, $r = ${r}$.`),
              step("Substitute", `$T_{${r}} = \\binom{${n}}{${r}} \\times 2^{${n - r}} \\times 3^{${r}}$`),
              step("Evaluate", `= ${binomialCoefficient(n, r)} × ${2 ** (n - r)} × ${3 ** r} = ${coeff * 3 ** r}`),
            ],
            takeaway: "Coefficient of xʳ in (a + bx)ⁿ is C(n,r) · aⁿ⁻ʳ · bʳ.",
          },
        );
      }
      return numericQuestion(
        `Find the coefficient of $x^{${r}}$ in the expansion of $(1 + x)^{${n}}$.`,
        coeff,
        {
          dp: 0,
          marks: 3,
          solution: [
            step("General term", "$T_{r} = \\binom{n}{r} \\times 1^{n-r} \\times 1^{r} = \\binom{n}{r}$"),
            step("Evaluate", `$\\binom{${n}}{${r}} = ${coeff}$`),
          ],
          takeaway: "In (1 + x)ⁿ the coefficient of xʳ is just C(n, r).",
        },
      );
    },
  },
  {
    key: "series-sigma",
    base: -1.4,
    span: 1.6,
    build: ({ rng }) => {
      const n = rng.int(5, 15);
      const sum = (n * (n + 1) * (2 * n + 1)) / 6;
      return numericQuestion(
        `Evaluate $\\displaystyle\\sum_{r=1}^{${n}} r^2$.`,
        sum,
        {
          dp: 0,
          marks: 3,
          solution: [
            step("Use the standard result", "$\\sum_{r=1}^{n} r^2 = \\dfrac{n(n+1)(2n+1)}{6}$"),
            step(
              "Substitute",
              `$\\dfrac{${n}(${n + 1})(2(${n}) + 1)}{6}$`,
              `= ${round(sum, 2)}`,
            ),
          ],
          takeaway: "Σr² = n(n+1)(2n+1)/6. Σr = n(n+1)/2. Σ1 = n.",
        },
      );
    },
  },
];

registerGenerators(["em-4"], seriesGenerators);

// ================================================= Topic 5: Trigonometry

const EXACT: Array<{ rad: string; deg: number; sin: string; cos: string; tan: string | null }> = [
  { rad: "0", deg: 0, sin: "0", cos: "1", tan: "0" },
  { rad: "\\tfrac{\\pi}{6}", deg: 30, sin: "\\tfrac{1}{2}", cos: "\\tfrac{\\sqrt{3}}{2}", tan: "\\tfrac{1}{\\sqrt{3}}" },
  { rad: "\\tfrac{\\pi}{4}", deg: 45, sin: "\\tfrac{\\sqrt{2}}{2}", cos: "\\tfrac{\\sqrt{2}}{2}", tan: "1" },
  { rad: "\\tfrac{\\pi}{3}", deg: 60, sin: "\\tfrac{\\sqrt{3}}{2}", cos: "\\tfrac{1}{2}", tan: "\\sqrt{3}" },
  // tan 90° is not defined, so it is null rather than a placeholder string.
  { rad: "\\tfrac{\\pi}{2}", deg: 90, sin: "1", cos: "0", tan: null },
];

const trigGenerators: Generator[] = [
  {
    key: "trig-exact-value",
    base: -1.6,
    span: 1.6,
    build: ({ rng }) => {
      const fn = rng.pick(["sin", "cos", "tan"] as const);
      const latex = fn === "sin" ? "\\sin" : fn === "cos" ? "\\cos" : "\\tan";
      // Only angles where the chosen function is actually defined.
      const usable = EXACT.filter((e) => e.deg > 0 && e[fn] != null);
      const angle = rng.pick(usable);
      const value = angle[fn] as string;
      const others = rng
        .sample(
          EXACT.filter((e) => e.deg !== angle.deg && e[fn] != null),
          3,
        )
        .map((e) => e[fn] as string);
      // tan 90° does not exist, so only mention it where it is finite.
      const unitCircle =
        angle.tan === undefined
          ? `At ${angle.deg}°, $\\sin = ${angle.sin}$ and $\\cos = ${angle.cos}$.`
          : `At ${angle.deg}°, $\\sin = ${angle.sin}$, $\\cos = ${angle.cos}$ and $\\tan = ${angle.tan}$ (since $\\tan = \\sin \\div \\cos$).`;
      return choiceQuestion(
        `Give the exact value of $${latex} ${angle.rad}$ radians.`,
        value,
        others,
        {
          rng,
          marks: 2,
          solution: [
            step("Unit circle", `$${angle.rad}$ rad = ${angle.deg}°.`),
            step("Read from the unit circle", unitCircle),
          ],
          takeaway:
            "Learn the exact values at 0°, 30°, 45°, 60° and 90° — everything else follows from them.",
        },
      );
    },
  },
  {
    key: "trig-sine-rule",
    base: 0.2,
    span: 2,
    build: ({ rng, tier }) => {
      // Generate two angles first, then derive the third so the triangle is always valid.
      const a = rng.int(25, 90);
      const b = rng.int(25, Math.min(120, 170 - a));
      const c = 180 - a - b;
      const ab = rng.int(4, 20);
      const sin = (deg: number) => Math.sin((deg * Math.PI) / 180);
      const bc = (ab * sin(a)) / sin(c);

      if (tier <= 3) {
        return numericQuestion(
          `In triangle $ABC$, $AB = ${ab}$, $\\angle A = ${a}°$ and $\\angle C = ${c}°$. Find the length $BC$.`,
          bc,
          {
            dp: 2,
            marks: 3,
            solution: [
              step(
                "Match sides to opposite angles",
                `$AB$ lies opposite $\\angle C$; $BC$ lies opposite $\\angle A$.`,
              ),
              step("Sine rule", "$\\dfrac{a}{\\sin A} = \\dfrac{c}{\\sin C}$"),
              step(
                "Substitute",
                `$\\dfrac{BC}{\\sin ${a}°} = \\dfrac{${ab}}{\\sin ${c}°}$`,
                `$BC = \\dfrac{${ab} \\sin ${a}°}{\\sin ${c}°} = ${round(bc, 2)}$`,
              ),
            ],
            takeaway:
              "In the sine rule each side is paired with the angle opposite it. Draw the triangle and label carefully.",
          },
        );
      }

      return numericQuestion(
        `In triangle $ABC$, $AB = ${ab}$, $\\angle A = ${a}°$ and $\\angle C = ${c}°$. Find $\\angle B$ in degrees.`,
        b,
        {
          dp: 0,
          marks: 1,
          solution: [
            step("Angle sum of a triangle", `$\\angle B = 180 - ${a} - ${c} = ${b}°$`),
          ],
          takeaway: "Angles in a triangle sum to 180°. Always find the third angle first.",
        },
      );
    },
  },
  {
    key: "trig-cosine-rule",
    base: 0.5,
    span: 2,
    build: ({ rng }) => {
      const a = rng.int(4, 15);
      const b = rng.int(4, 15);
      const included = rng.int(25, 140);
      const cos = Math.cos((included * Math.PI) / 180);
      const third = Math.sqrt(a * a + b * b - 2 * a * b * cos);
      return numericQuestion(
        `Two sides of a triangle have lengths ${a} and ${b}, and the angle between them is ${included}°. Find the length of the third side.`,
        third,
        {
          dp: 2,
          marks: 3,
          solution: [
            step("Identify the right formula", "The cosine rule finds the third side from two sides and the included angle."),
            step("Formula", "$c^2 = a^2 + b^2 - 2ab\\cos C$"),
            step(
              "Substitute",
              `$c^2 = ${a}^2 + ${b}^2 - 2(${a})(${b})\\cos ${included}°$`,
              `= ${round(a * a + b * b - 2 * a * b * cos, 4)}`,
            ),
            step("Square root", `$c = ${round(third, 2)}$`),
          ],
          takeaway:
            "Cosine rule needs the included angle; the sine rule needs the opposite angle. Check which one you are given.",
        },
      );
    },
  },
  {
    key: "trig-radians-arc-length",
    base: -1.2,
    span: 1.6,
    build: ({ rng }) => {
      const r = rng.pick([2, 3, 4, 5, 6, 8, 10]);
      const deg = rng.pick([30, 45, 60, 90, 120, 135, 150, 180, 270, 360]);
      const theta = (deg * Math.PI) / 180;
      const arc = r * theta;
      return numericQuestion(
        `A circle has radius ${r}. Find the exact length of the arc subtended by a central angle of ${deg}°.`,
        arc,
        {
          dp: 4,
          marks: 3,
          solution: [
            step(
              "Convert to radians",
              `$\\theta = ${deg}° \\times \\dfrac{\\pi}{180} = ${round(theta, 6)}$ rad`,
            ),
            step("Formula", "$s = r\\theta$ with $\\theta$ in radians"),
            step("Substitute", `$s = ${r} \\times ${round(theta, 6)}$`, `= ${round(arc, 4)}`),
          ],
          takeaway: "s = rθ only works with θ in radians.",
        },
      );
    },
  },
  {
    key: "trig-solve-equation",
    base: 1.0,
    span: 1.8,
    build: ({ rng }) => {
      const deg = rng.pick([30, 45, 60, 120, 135, 150, 210, 225, 240, 300]);
      const fns = {
        sin: (d: number) => Math.sin((d * Math.PI) / 180),
        cos: (d: number) => Math.cos((d * Math.PI) / 180),
        tan: (d: number) => Math.tan((d * Math.PI) / 180),
      } as const;
      const name = rng.pick(["sin", "cos", "tan"] as const);
      const value = round(fns[name](deg), 4);
      const distractors = [round(-value, 4), round(1 - value, 4), round(value + 0.25, 4)].filter(
        (v) => Math.abs(v - value) > 1e-9,
      );
      const latexName = name === "sin" ? "\\sin" : name === "cos" ? "\\cos" : "\\tan";
      return choiceQuestion(
        `Find the value of $${latexName} ${deg}°$, giving your answer to 4 decimal places.`,
        String(value),
        distractors.map(String),
        {
          rng,
          marks: 2,
          solution: [
            step("Check the calculator is in degree mode", `${deg}° is a degree measure.`),
            step("Evaluate", `$${latexName} ${deg}° = ${value}$`),
          ],
          takeaway: `${latexName} ${deg}° = ${value}. Double-check degree mode before every trig question.`,
        },
      );
    },
  },
  {
    key: "trig-identity",
    base: 0.6,
    span: 1.8,
    build: ({ rng }) => {
      const pairs: Array<{ q: string; correct: string; wrong: string[]; why: string }> = [
        {
          q: "Which identity is correct?",
          correct: "$\\sin^2 x + \\cos^2 x = 1$",
          wrong: ["$\\sin^2 x + \\cos^2 x = \\tan^2 x$", "$\\sin x + \\cos x = 1$", "$\\sec^2 x - \\tan^2 x = 0$"],
          why: "Pythagoras' identity applied to the unit circle.",
        },
        {
          q: "Which identity is correct?",
          correct: "$\\tan^2 x + 1 = \\sec^2 x$",
          wrong: ["$\\tan^2 x + 1 = \\cos^2 x$", "$\\sec^2 x + 1 = \\tan^2 x$", "$\\tan x + 1 = \\sec x$"],
          why: "Divide the Pythagorean identity by cos²x.",
        },
        {
          q: "Which identity is correct?",
          correct: "$\\sin^2 x = \\dfrac{\\tan^2 x}{1 + \\tan^2 x}$",
          wrong: [
            "$\\sin^2 x = \\dfrac{1}{1 + \\tan^2 x}$",
            "$\\sin^2 x = \\dfrac{\\tan^2 x}{1 - \\tan^2 x}$",
            "$\\cos^2 x = \\dfrac{\\tan^2 x}{1 + \\tan^2 x}$",
          ],
          why: "From tan²x + 1 = sec²x, so sec²x = 1 + tan²x.",
        },
        {
          q: "Which identity is correct?",
          correct: "$\\sin(A + B) = \\sin A \\cos B + \\cos A \\sin B$",
          wrong: [
            "$\\sin(A + B) = \\sin A \\cos B - \\cos A \\sin B$",
            "$\\sin(A + B) = \\sin A \\cos B$",
            "$\\sin(A + B) = \\cos A \\cos B - \\sin A \\sin B$",
          ],
          why: "The sine addition formula.",
        },
      ];
      const chosen = rng.pick(pairs);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 2,
        solution: [
          step("Recall", chosen.why),
          step("Check", "Substitute a simple angle such as 45° to confirm the identity holds."),
        ],
        takeaway:
          "Check any candidate identity numerically at x = 45° before committing to it.",
      });
    },
  },
];

registerGenerators(["em-5"], trigGenerators);

// ======================================== Topic 6: Exponentials and logarithms

const expLogGenerators: Generator[] = [
  {
    key: "explog-solve",
    base: -1.2,
    span: 1.8,
    build: ({ rng }) => {
      const base = rng.pick([2, 3, 5, 10]);
      const n = rng.int(2, 6);
      return numericQuestion(
        `Solve the equation $${base}^{x} = ${base ** n}$. Give $x$ as a decimal.`,
        n,
        {
          dp: 4,
          marks: 1,
          solution: [
            step("Take logs, or compare powers", `$${base}^{x} = ${base}^{${n}}$`),
            step("Equate exponents", `x = ${n}`),
          ],
          takeaway: "When the bases match, equate the exponents. Otherwise take logs of both sides.",
        },
      );
    },
  },
  {
    key: "explog-log-value",
    base: -1.4,
    span: 1.6,
    build: ({ rng }) => {
      const base = rng.pick([2, 3, 5, 10]);
      const n = rng.int(2, 6);
      return numericQuestion(
        `Evaluate $\\log_{${base}} ${base ** n}$.`,
        n,
        {
          dp: 4,
          solution: [
            step("Definition", "$\\log_b a = c$ means $b^c = a$."),
            step("Work backwards", `$${base}^{${n}} = ${base ** n}$`, `so $\\log_{${base}} ${base ** n} = ${n}$`),
          ],
          takeaway: "log_b(a) = c ⟺ b^c = a. This is the definition to fall back on.",
        },
      );
    },
  },
  {
    key: "explog-change-of-base",
    base: 0.2,
    span: 1.8,
    build: ({ rng }) => {
      const x = rng.int(2, 9);
      const base = rng.pick([2, 3, 5, 7]);
      const value = Math.log(x) / Math.log(base);
      const lnX = Math.log(x);
      return numericQuestion(
        `Evaluate $\\log_{${base}} ${x}$, giving your answer to 4 decimal places.`,
        value,
        {
          dp: 4,
          marks: 2,
          solution: [
            step("Change of base", "$\\log_b a = \\dfrac{\\ln a}{\\ln b}$"),
            step("Substitute", `$\\dfrac{\\ln ${x}}{\\ln ${base}} = \\dfrac{${round(lnX, 5)}}{${round(Math.log(base), 5)}}$`),
            step("Divide", `= ${round(value, 4)}`),
          ],
          takeaway: "Change of base: log_b(a) = ln a ÷ ln b.",
        },
      );
    },
  },
  {
    key: "explog-index-equation",
    base: 0.8,
    span: 2,
    build: ({ rng }) => {
      const base = rng.pick([2, 3]);
      const n = rng.int(2, 5);
      const k = rng.int(2, 6);
      // base^(x + n) = base^k * base^n -> x = k
      return numericQuestion(
        `Solve $${base}^{x + ${n}} = ${base ** k}$. Give $x$ as a decimal.`,
        k - n,
        {
          dp: 4,
          marks: 2,
          solution: [
            step("Write the RHS as a power of the same base", `$${base}^{k}$`),
            step("Take logs of both sides", `$x + ${n} = \\log_{${base}} ${base ** k} = ${k}$`),
            step("Solve", `x = ${k} - ${n} = ${k - n}`),
          ],
          takeaway: "Take logs of both sides whenever the unknowns are not isolated.",
        },
      );
    },
  },
  {
    key: "explog-growth-model",
    base: 1.1,
    span: 1.8,
    build: ({ rng }) => {
      const base = rng.pick([1.05, 1.1, 1.2, 1.25, 1.5]);
      const years = rng.int(3, 12);
      const initial = rng.int(200, 4000);
      const value = initial * base ** years;
      return numericQuestion(
        `A population of ${initial} grows by ${round((base - 1) * 100, 1)}% each year. Estimate the population after ${years} years.`,
        value,
        {
          dp: 0,
          marks: 3,
          solution: [
            step("Build the model", `$P = ${initial} \\times ${base}^{${years}}$`),
            step("Evaluate", `= ${round(value, 2)}`),
          ],
          takeaway: "Exponential growth: multiply by (1 + r) each period, or use initial × growthⁿ.",
        },
      );
    },
  },
];

registerGenerators(["em-6"], expLogGenerators);

// ============================================== Topic 7: Differentiation

const diffGenerators: Generator[] = [
  {
    key: "diff-evaluate",
    base: -1.5,
    span: 1.6,
    build: ({ rng }) => {
      const kind = rng.pick(["quadratic", "cubic", "product", "quotient"] as const);
      if (kind === "quadratic") {
        const a = rng.int(1, 6);
        const b = rng.int(-8, 8);
        const c = rng.int(-9, 9);
        const x = rng.int(-4, 4);
        const value = 2 * a * x + b;
        return numericQuestion(
          `Let $f(x) = ${a === 1 ? "" : a}x^2 ${signed(b)}x ${signed(c)}$. Find $f'(${x})$.`,
          value,
          {
            dp: 0,
            marks: 2,
            solution: [
              step("Differentiate term by term", `$f'(x) = ${2 * a}x ${signed(b)}$`),
              step("Substitute", `$f'(${x}) = ${2 * a}(${x}) ${signed(b)} = ${value}$`),
            ],
            takeaway: "Power rule: the coefficient becomes the power and the power becomes the new coefficient.",
          },
        );
      }
      if (kind === "cubic") {
        const a = rng.int(1, 4);
        const x = rng.int(-3, 3);
        const value = 3 * a * x * x;
        return numericQuestion(
          `Let $f(x) = ${a === 1 ? "" : a}x^3$. Find $f'(${x})$.`,
          value,
          {
            dp: 0,
            solution: [
              step("Power rule", `$f'(x) = ${3 * a}x^2$`),
              step("Substitute", `$f'(${x}) = ${3 * a}(${x})^2 = ${value}$`),
            ],
            takeaway: "d/dx of axⁿ is naxⁿ⁻¹.",
          },
        );
      }
      if (kind === "product") {
        const a = rng.int(1, 5);
        const b = rng.int(1, 5);
        const x = rng.int(-3, 3);
        const value = a * (x + 2) + b * (x * x);
        return numericQuestion(
          `Let $f(x) = ${a === 1 ? "" : a}(x + 2) + ${b === 1 ? "" : b}x^2$. Find $f'(${x})$.`,
          value,
          {
            dp: 0,
            solution: [
              step("Differentiate each term", `$f'(x) = ${a} + ${2 * b === 1 ? "" : 2 * b}x$`),
              step("Substitute", `$f'(${x}) = ${a} ${signed(2 * b * x)} = ${value}$`),
            ],
            takeaway: "Constants vanish when differentiating; xⁿ becomes nxⁿ⁻¹.",
          },
        );
      }
      const p = rng.int(1, 4);
      const x = rng.int(1, 4);
      const pStr = p === 1 ? "" : String(p);
      const value = (p * x * x - p * (x + 1) * (x + 1)) / (x * x + 1) ** 2;
      return numericQuestion(
        `Let $f(x) = \\dfrac{${pStr}x + ${p}}{x^2 + 1}$. Find $f'(${x})$, giving your answer to 4 decimal places.`,
        value,
        {
          dp: 4,
          marks: 4,
          solution: [
            step(
              "Apply the quotient rule",
              "$\\dfrac{u'v - uv'}{v^2}$ with $u = " + (pStr || "") + "x + " + p + "$ and $v = x^2 + 1$",
            ),
            step(
              "Differentiate",
              `$u' = ${pStr || "1"}$, $v' = 2x$`,
              `Numerator: $${pStr || "1"}(x^2+1) - (${pStr || ""}x + ${p})(2x)$`,
            ),
            step("Substitute", `$f'(${x}) = ${round(value, 4)}$`),
          ],
          takeaway: "Quotient rule: f' = (u'v − uv')/v². Alternatively rewrite as a negative power of x and use the power rule.",
        },
      );
    },
  },
  {
    key: "diff-stationary-point",
    base: 0.2,
    span: 1.8,
    build: ({ rng }) => {
      const a = rng.int(1, 5);
      const b = rng.int(-10, 10);
      const c = rng.int(-12, 12);
      const x = -b / (2 * a);
      return numericQuestion(
        `The curve $y = ${a === 1 ? "" : a}x^2 ${signed(b)}x ${signed(c)}$ has a stationary point. Find the $x$-coordinate of that point.`,
        x,
        {
          dp: 3,
          marks: 3,
          solution: [
            step("A stationary point has f'(x) = 0", `$f'(x) = ${2 * a}x ${signed(b)}$`),
            step("Solve f'(x) = 0", `$${2 * a}x ${signed(b)} = 0$`, `x = ${round(x, 3)}`),
          ],
          takeaway: "Stationary points come from f'(x) = 0, NOT from f(x) = 0.",
        },
      );
    },
  },
  {
    key: "diff-gradient-tangent",
    base: 0.4,
    span: 1.8,
    build: ({ rng }) => {
      const a = rng.int(1, 5);
      const b = rng.int(-8, 8);
      const x = rng.int(-3, 3);
      const gradient = 2 * a * x + b;
      return numericQuestion(
        `Find the gradient of the tangent to the curve $y = ${a === 1 ? "" : a}x^2 ${signed(b)}x$ at the point where $x = ${x}$.`,
        gradient,
        {
          dp: 0,
          marks: 3,
          solution: [
            step("Differentiate", `$f'(x) = ${2 * a}x ${signed(b)}$`),
            step("The gradient of the tangent is f'(x)", `$f'(${x}) = ${2 * a}(${x}) ${signed(b)} = ${gradient}$`),
          ],
          takeaway: "The gradient of the tangent at a point equals the value of the derivative at that point.",
        },
      );
    },
  },
  {
    key: "diff-second-derivative",
    base: 0.8,
    span: 1.8,
    build: ({ rng, tier }) => {
      const a = rng.int(1, 5);
      const b = rng.int(-8, 8);
      const c = rng.int(-10, 10);
      if (tier <= 3) {
        return numericQuestion(
          `Let $f(x) = ${a === 1 ? "" : a}x^3 ${signed(b)}x ${signed(c)}$. Find $f''(${rng.int(-2, 2)})$.`,
          6 * a,
          {
            dp: 0,
            solution: [
              step("Differentiate once", `$f'(x) = ${3 * a === 1 ? "" : 3 * a}x^2 ${signed(b)}$`),
              step("Differentiate again", `$f''(x) = ${6 * a === 1 ? "" : 6 * a}x$`),
              step("Evaluate", `The second derivative is linear in x; check the coefficient is ${6 * a}.`),
            ],
            takeaway: "Differentiate twice. The second derivative tells you about curvature and stationary point type.",
          },
        );
      }
      const pStr = a === 1 ? "" : String(a);
      const coef1 = 3 * a === 1 ? "" : String(3 * a);
      const coef2 = 6 * a === 1 ? "" : String(6 * a);
      return choiceQuestion(
        `The curve $y = ${pStr}x^3 ${signed(b)}x$ has a stationary point at $x = 0$. Is the stationary point a maximum or a minimum?`,
        a > 0 ? "minimum" : "maximum",
        [a > 0 ? "maximum" : "minimum", "point of inflection", "cannot be determined"],
        {
          rng,
          marks: 3,
          solution: [
            step("Differentiate", `$f'(x) = ${coef1}x^2 ${signed(b)}$`),
            step("Stationary point", `f'(0) = 0, so $x = 0$ is stationary.`),
            step("Classify with f''", `$f''(x) = ${coef2}x$, so $f''(0) = 0$.`),
            step(
              "Use the sign change of f'",
              `$f'(x) = ${coef1}x^2$ is always ${a > 0 ? "positive" : "negative"} on both sides of 0, so the point is a ${a > 0 ? "minimum" : "maximum"}.`,
            ),
          ],
          takeaway:
            "If f''(0) = 0, check whether f' changes sign. + to − is a maximum, − to + is a minimum.",
        },
      );
    },
  },
  {
    key: "diff-small-increment",
    base: 1.2,
    span: 1.6,
    build: ({ rng }) => {
      const a = rng.int(1, 4);
      const b = rng.int(-6, 6);
      const c = rng.int(-8, 8);
      const x = rng.int(1, 3);
      const h = 0.001;
      const f = (v: number) => a * v ** 3 + b * v + c;
      const value = (f(x + h) - f(x)) / h;
      return numericQuestion(
        `Estimate the gradient of the curve $y = ${a === 1 ? "" : a}x^3 ${signed(b)}x ${signed(c)}$ at $x = ${x}$ using $h = 0.001$.`,
        value,
        {
          dp: 1,
          marks: 3,
          solution: [
            step("Estimate the gradient", "$\\dfrac{f(x+h) - f(x)}{h}$"),
            step("Evaluate f at both points", `f(${x}) = ${round(f(x), 6)}`, `f(${x + h}) = ${round(f(x + h), 6)}`),
            step("Substitute", `$\\dfrac{${round(f(x + h) - f(x), 6)}}{${h}}$`, `= ${round(value, 1)}`),
          ],
          takeaway: "This is the first-principles definition of the derivative; a small h makes it very accurate.",
        },
      );
    },
  },
];

registerGenerators(["em-7"], diffGenerators);

// ================================================ Topic 8: Integration

const intGenerators: Generator[] = [
  {
    key: "int-definite-quadratic",
    base: -1.3,
    span: 1.7,
    build: ({ rng }) => {
      const a = rng.int(1, 5);
      const b = rng.int(-6, 6);
      const c = rng.int(-8, 8);
      const lo = rng.int(0, 2);
      const hi = lo + rng.int(1, 4);
      const anti = (v: number) => (a * v ** 3) / 3 + (b * v * v) / 2 + c * v;
      const value = anti(hi) - anti(lo);
      return numericQuestion(
        `Evaluate $\\displaystyle\\int_{${lo}}^{${hi}} (${a === 1 ? "" : a}x^2 ${signed(b)}x ${signed(c)}) \\, dx$.`,
        value,
        {
          dp: 3,
          marks: 3,
          solution: [
            step("Integrate term by term", `$\\dfrac{${a}x^3}{3} + ${signed(b) ? `\\dfrac{${b}x^2}{2}` : ""} ${signed(c)}x$`),
            step(
              "Evaluate the difference",
              `$\\left[\\cdots\\right]_{${lo}}^{${hi}}$`,
              `$= ${round(anti(hi), 4)} - ${round(anti(lo), 4)} = ${round(value, 3)}$`,
            ),
          ],
          takeaway: "∫ₐᵇ f(x)dx = F(b) − F(a). Never evaluate an antiderivative at a single point.",
        },
      );
    },
  },
  {
    key: "int-trapezium-rule",
    base: 0.3,
    span: 1.8,
    build: ({ rng }) => {
      const n = rng.pick([4, 6, 8, 10]);
      const h = 0.5;
      const start = 1;
      const end = start + n * h;
      let sum = 0;
      const ys: number[] = [];
      for (let i = 0; i <= n; i++) {
        const x = start + i * h;
        const y = Math.exp(x / 4) + 0.2 * x * x;
        ys.push(y);
        sum += (i === 0 || i === n ? y : 2 * y);
      }
      const value = (h / 2) * sum;
      return numericQuestion(
        `Use the trapezium rule with ${n} strips to estimate $\\displaystyle\\int_{${start}}^{${end}} (e^{x/4} + 0.2x^2)\\,dx$, giving your answer to 3 decimal places.`,
        value,
        {
          dp: 3,
          marks: 4,
          solution: [
            step("Formula", "$\\int \\approx \\dfrac{h}{2}\\left(y_0 + y_1 + \\cdots + y_{n-1} + y_n\\right)$ with the middle ordinates doubled"),
            step(
              "Tabulate the ordinates",
              ys.map((y, i) => `y_{${i}} = ${round(y, 4)}`).join(", "),
            ),
            step("h", `$h = \\dfrac{${end} - ${start}}{${n}} = ${h}$`),
            step("Substitute", `$\\dfrac{${h}}{2} \\times ${round(sum, 4)}$`, `= ${round(value, 3)}`),
          ],
          takeaway: "Trapezium rule: half of h × (end ordinates once, middle ordinates twice).",
        },
      );
    },
  },
  {
    key: "int-area-under-curve",
    base: -0.4,
    span: 1.8,
    build: ({ rng }) => {
      const a = rng.int(1, 4);
      const b = rng.int(1, 4);
      const c = rng.int(1, 4);
      const value = (a * c ** 4) / 4 + (b * c ** 3) / 3 + c * c * c;
      return numericQuestion(
        `Find the exact area bounded by the curve $y = ${a === 1 ? "" : a}x^3 + ${b === 1 ? "" : b}x^2 + ${c === 1 ? "" : c}x$, the $x$-axis and the lines $x = 0$ and $x = ${c}$.`,
        value,
        {
          dp: 3,
          marks: 4,
          solution: [
            step("The curve is above the x-axis on this interval", `All coefficients are positive and $x \\geq 0$, so $y \\geq 0$.`),
            step("Antiderivative", `$\\dfrac{${a}x^4}{4} + ${b === 1 ? "" : b}\\dfrac{x^3}{3} ${c === 1 ? "" : `+ ${c}x^2`}$`),
            step("Evaluate from 0 to " + c, `= ${round(value, 3)}`),
          ],
          takeaway: "Area under a curve that stays above the axis is just the definite integral.",
        },
      );
    },
  },
  {
    key: "int-antiderivative-shape",
    base: 0.6,
    span: 1.6,
    build: ({ rng }) => {
      const pairs = [
        {
          q: "Which is an antiderivative of $f(x) = 6x^2$?",
          correct: "$F(x) = 2x^3 + C$",
          wrong: ["$F(x) = 3x^3 + C$", "$F(x) = 12x + C$", "$F(x) = 2x^2 + C$"],
          why: "Differentiate back: d/dx(2x³) = 6x².",
        },
        {
          q: "Which is an antiderivative of $f(x) = \\dfrac{1}{x}$?",
          correct: "$F(x) = \\ln x + C$",
          wrong: ["$F(x) = x\\ln x + C$", "$F(x) = e^{x} + C$", "$F(x) = -\\dfrac{1}{x} + C$"],
          why: "d/dx(ln x) = 1/x.",
        },
        {
          q: "Which is an antiderivative of $f(x) = e^{2x}$?",
          correct: "$F(x) = \\tfrac{1}{2}e^{2x} + C$",
          wrong: ["$F(x) = e^{2x} + C$", "$F(x) = 2e^{2x} + C$", "$F(x) = \\tfrac{1}{2}x^{2} + C$"],
          why: "d/dx(k eᵃˣ) = ka eᵃˣ, so k = 1/2 here.",
        },
        {
          q: "Which is an antiderivative of $f(x) = \\cos x$?",
          correct: "$F(x) = \\sin x + C$",
          wrong: ["$F(x) = -\\cos x + C$", "$F(x) = \\cos x + C$", "$F(x) = -\\sin x + C$"],
          why: "d/dx(sin x) = cos x.",
        },
      ];
      const chosen = rng.pick(pairs);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 2,
        solution: [
          step("Differentiate each candidate", "The right antiderivative differentiates back to f(x)."),
          step("Confirm", chosen.why),
        ],
        takeaway: "Check by differentiating your answer. Never leave off the +C on indefinite integrals.",
      });
    },
  },
];

registerGenerators(["em-8"], intGenerators);

// ========================================= Topic 9: Numerical methods

const numericalGenerators: Generator[] = [
  {
    key: "numerical-newton-raphson",
    base: 1.0,
    span: 1.6,
    build: ({ rng }) => {
      // f(x) = x^2 - k always has an integer root, so the iteration is exact and checkable.
      const root = rng.int(2, 12);
      const f = (x: number) => x * x - root * root;
      const df = (x: number) => 2 * x;
      // Fix the starting value ONCE, then use that same value in the prompt and
      // in the worked iterations.
      const start = Math.max(root - rng.int(3, 8), 0.5);
      let x0 = start;
      const steps: string[] = [];
      for (let i = 0; i < 4; i++) {
        const next = x0 - f(x0) / df(x0);
        steps.push(
          `x_{${i + 1}} = ${round(x0, 5)} - (${round(f(x0), 5)})/(${round(df(x0), 5)}) = ${round(next, 5)}`,
        );
        x0 = next;
      }
      return numericQuestion(
        `Use Newton's method with $x_0 = ${round(start, 4)}$ to find the positive root of $x^2 - ${root * root} = 0$, giving your answer to 4 decimal places.`,
        root,
        {
          dp: 4,
          marks: 4,
          solution: [
            step("Newton–Raphson formula", "$x_{n+1} = x_n - \\dfrac{f(x_n)}{f'(x_n)}$"),
            step("Here", `$f(x) = x^2 - ${root * root}$ and $f'(x) = 2x$`),
            ...steps.map((s, i) => step(`Iterate ${i + 1}`, s)),
            step("Converged", `$x \\approx ${root}$`),
          ],
          takeaway:
            "Newton–Raphson: xₙ₊₁ = xₙ − f(xₙ)/f′(xₙ). It converges very fast but can diverge from a poor starting point.",
        },
      );
    },
  },
  {
    key: "numerical-bisection",
    base: 0.5,
    span: 1.6,
    build: ({ rng }) => {
      const root = rng.int(2, 9);
      // Build the interval so that it genuinely brackets the root, otherwise
      // bisection has no sign change to follow.
      const lo = root - rng.int(1, 4);
      const hi = root + rng.int(1, 4);
      return numericQuestion(
        `The equation $x^2 = ${root * root}$ is to be solved by bisection on the interval $[${lo}, ${hi}]$. What is the first midpoint tested?`,
        (lo + hi) / 2,
        {
          dp: 2,
          marks: 2,
          solution: [
            step("Bisection splits the interval in half", "The first test point is the midpoint."),
            step("Midpoint", `$\\dfrac{${lo} + ${hi}}{2} = ${round((lo + hi) / 2, 2)}$`),
            step(
              "Check the sign change",
              `$f(${lo}) = ${lo * lo - root * root}$ and $f(${hi}) = ${hi * hi - root * root}$, so the root is bracketed.`,
            ),
            step(
              "Then",
              "Keep the half containing the sign change and repeat until the bounds agree to the required accuracy.",
            ),
          ],
          takeaway: "Bisection is guaranteed to converge but is slow; Newton–Raphson is fast but needs a good initial estimate.",
        },
      );
    },
  },
  {
    key: "numerical-interpolation",
    base: 1.2,
    span: 1.6,
    build: ({ rng }) => {
      const table: Array<[number, number]> = [
        [1, 2],
        [2, 3],
        [3, 5],
        [4, 7],
        [5, 11],
      ];
      const idx = rng.int(0, 3);
      const [x1, y1] = table[idx];
      const [x2, y2] = table[idx + 1];
      const value = y1 + ((y2 - y1) / (x2 - x1)) * 3;
      return numericQuestion(
        `A function is given by the points $(1, 2), (2, 3), (3, 5), (4, 7), (5, 11)$. Use linear interpolation to estimate the value at $x = ${x1 + 3}$.`,
        value,
        {
          dp: 3,
          marks: 3,
          solution: [
            step("Find the bracketing points", `x = ${x1 + 3} lies between (${x1}, ${y1}) and (${x2}, ${y2}).`),
            step("Linear interpolation formula", "$y = y_1 + \\dfrac{y_2 - y_1}{x_2 - x_1}(x - x_1)$"),
            step(
              "Substitute",
              `$y = ${y1} + ${signed(y2 - y1)}/${x2 - x1} \\times ${3}$`,
              `= ${round(value, 3)}`,
            ),
          ],
          takeaway: "Linear interpolation assumes straight lines between data points, so it is only approximate and can be biased.",
        },
      );
    },
  },
  {
    key: "numerical-convergence",
    base: 0.9,
    span: 1.4,
    build: ({ rng }) =>
      choiceQuestion(
        "Which statement about the bisection method is correct?",
        "It always converges when the initial interval brackets a sign change.",
        [
          "It converges faster than Newton's method from every starting point.",
          "It requires f'(x) to be known.",
          "It fails whenever the function is not monotonic.",
        ],
        {
          rng,
          marks: 2,
          solution: [
            step("Bisection only needs a sign change", "Each iteration halves the interval, so the error halves too."),
            step("Why the others are wrong", "Bisection is slow but certain; it never needs f′, and monotonicity is not required."),
          ],
          takeaway: "Bisection: guaranteed but slow. Newton–Raphson: fast but needs a good guess and f′.",
        },
      ),
  },
  {
    key: "numerical-fixing-point",
    base: 0.2,
    span: 1.6,
    build: ({ rng }) => {
      // Iterate x = g(x) and read off the limit, actually running the
      // iteration so the printed table matches the stated answer.
      const a = rng.int(2, 4);
      const root = a;
      const start = rng.float(0.5, 1.5);
      let x = start;
      const rows: string[] = [`x_0 = ${round(x, 4)}`];
      for (let i = 1; i <= 4; i++) {
        x = (root + a) / a + (1 / a) * x;
        rows.push(`x_{${i}} = ${round(x, 4)}`);
      }
      return numericQuestion(
        `The equation $${root}x = ${a} + x$ is solved using the iteration $x_{n+1} = \\dfrac{${a} + x_n}{${a}}$, starting from $x_0 = ${round(start, 4)}$. What value does the sequence converge to, to 4 decimal places?`,
        round(x, 4),
        {
          dp: 4,
          marks: 3,
          solution: [
            step("The iteration is", `$x_{n+1} = g(x_n) = \\dfrac{${a} + x_n}{${a}}$`),
            step("Generate terms", rows.join(", ")),
            step("Limit", `The values settle at $${root}$, which is the root of the original equation.`),
          ],
          takeaway:
            "Fixed-point iteration converges when |g′| < 1 near the root. Here g′ = 1/a, so a larger a converges faster.",
        },
      );
    },
  },
  {
    key: "numerical-error-estimate",
    base: 1.1,
    span: 1.5,
    build: ({ rng }) => {
      const a = rng.int(2, 6);
      const n = rng.int(2, 5);
      // Relative error after n bisections is (b-a)/2^n expressed against the
      // interval width, so compute it rather than assert it.
      const width = a;
      const after = width / Math.pow(2, n);
      return numericQuestion(
        `Bisection is applied to an interval of width ${width}. By how much is the interval reduced after ${n} iterations?`,
        round(after, 4),
        {
          dp: 4,
          marks: 3,
          solution: [
            step("Each iteration halves", `$w_{${n}} = \\dfrac{${width}}{2^{${n}}}$.`),
            step("Substitute", `$\\dfrac{${width}}{${Math.pow(2, n)}} = ${round(after, 4)}$.`),
            step(
              "Accuracy needed",
              `To reach $10^{-4}$ from width ${width} takes $\\log_2 \\dfrac{${width}}{10^{-4}} \\approx ${round(Math.log2(width / 1e-4), 1)}$ iterations, which is why the method is slow.`,
            ),
          ],
          takeaway:
            "Bisection buys a binary digit of accuracy per iteration, so the iteration count is logarithmic while the work per iteration is constant.",
        },
      );
    },
  },
  {
    key: "numerical-differentiation",
    base: 0.8,
    span: 1.6,
    build: ({ rng, tier }) => {
      // Build a quadratic so the central difference formula has a known,
      // computable error term.
      const a = rng.int(1, 4);
      const h = tier <= 2 ? 0.1 : 0.01;
      const x = rng.int(1, 4);
      const exact = 2 * a * x;
      const forward = (a * Math.pow(x + h, 2) - a * Math.pow(x, 2)) / h;
      const central = (a * Math.pow(x + h, 2) - a * Math.pow(x - h, 2)) / (2 * h);
      return numericQuestion(
        `Estimate the derivative of $f(x) = ${a}x^2$ at $x = ${x}$ using the central difference formula with $h = ${h}$.`,
        round(central, 4),
        {
          dp: 4,
          marks: 3,
          solution: [
            step("Central difference formula", "$f'(x) \\approx \\dfrac{f(x+h) - f(x-h)}{2h}$"),
            step(
              "Substitute",
              `$\\dfrac{${a}(${x}+${h})^2 - ${a}(${x}-${h})^2}{2 \\times ${h}}$`,
            ),
            step("Value", `= ${round(central, 4)}`),
            step(
              "Compare",
              `The forward difference would give ${round(forward, 4)} here, against the exact ${exact}. Central differencing cancels the $h$ term, so its error is $O(h^2)$ rather than $O(h)$.`,
            ),
          ],
          takeaway:
            "The central difference is accurate to $O(h^2)$ because the $h$ terms cancel. Smaller h is not automatically better: rounding error grows as h shrinks.",
        },
      );
    },
  },
  {
    key: "numerical-compare-methods",
    base: -0.3,
    span: 1.4,
    build: ({ rng }) =>
      choiceQuestion(
        "A root is required to 6 decimal places and f(x) and f′(x) are both available. Which method is most appropriate?",
        "Newton–Raphson, because it converges quadratically and reaches that accuracy in a handful of iterations",
        [
          "Bisection, because it always converges faster than Newton–Raphson.",
          "Newton–Raphson, because it cannot diverge.",
          "Bisection, because it does not require the derivative.",
        ],
        {
          rng,
          marks: 3,
          solution: [
            step(
              "Compare accuracy rates",
              "Newton–Raphson roughly doubles the correct digits each step, so six decimal places takes about 5 iterations from a reasonable start. Bisection gains one binary digit per iteration, so it needs about 20.",
            ),
            step(
              "The trade-off",
              "Bisection is unconditionally convergent given a sign change. Newton–Raphson is fast but needs a good initial estimate, since a poor one can diverge.",
            ),
          ],
          takeaway:
            "Quadratic convergence beats linear convergence when a derivative is available. Bisection is the fallback when it is not, or when a sign change is all you are sure of.",
        },
      ),
  },
];

registerGenerators(["em-9"], numericalGenerators);

// ================================================== Topic 10: Vectors

const vectorGenerators: Generator[] = [
  {
    key: "vector-magnitude",
    base: -1.3,
    span: 1.6,
    build: ({ rng }) => {
      const a = rng.int(-6, 6);
      const b = rng.int(-6, 6);
      const magnitude = Math.hypot(a, b);
      return numericQuestion(
        `Find the magnitude of the vector $\\begin{pmatrix} ${a} \\\\ ${b} \\end{pmatrix}$, giving your answer to 4 decimal places.`,
        magnitude,
        {
          dp: 4,
          marks: 2,
          solution: [
            step("Formula", "$|\\mathbf{v}| = \\sqrt{x^2 + y^2}$"),
            step("Substitute", `$\\sqrt{${a}^2 + ${b}^2} = \\sqrt{${a * a + b * b}}$`),
            step("Answer", `= ${round(magnitude, 4)}`),
          ],
          takeaway: "Magnitude is the root of the sum of the squares of the components.",
        },
      );
    },
  },
  {
    key: "vector-resultant",
    base: 0.0,
    span: 1.8,
    build: ({ rng, tier }) => {
      const a = rng.int(-6, 6);
      const b = rng.int(-6, 6);
      const c = rng.int(-6, 6);
      const d = rng.int(-6, 6);
      if (tier <= 3) {
        return numericQuestion(
          `Vector $\\mathbf{p} = \\begin{pmatrix} ${a} \\\\ ${b} \\end{pmatrix}$ and $\\mathbf{q} = \\begin{pmatrix} ${c} \\\\ ${d} \\end{pmatrix}$. Find the $x$-component of $\\mathbf{p} + \\\mathbf{q}$.`,
          a + c,
          {
            dp: 0,
            solution: [
              step("Add componentwise", `$\\begin{pmatrix} ${a} \\\\ ${b} \\end{pmatrix} + \\begin{pmatrix} ${c} \\\\ ${d} \\end{pmatrix} = \\begin{pmatrix} ${a + c} \\\\ ${b + d} \\end{pmatrix}$`),
            ],
            takeaway: "Vectors add componentwise, not by adding their magnitudes.",
          },
        );
      }
      return numericQuestion(
        `Vector $\\mathbf{p} = \\begin{pmatrix} ${a} \\\\ ${b} \\end{pmatrix}$ and $\\mathbf{q} = \\begin{pmatrix} ${c} \\\\ ${d} \\end{pmatrix}$. Find the magnitude of the resultant $\\mathbf{p} + \\mathbf{q}$, to 4 decimal places.`,
        Math.hypot(a + c, b + d),
        {
          dp: 4,
          marks: 3,
          solution: [
            step("Add the vectors", `$\\mathbf{p} + \\mathbf{q} = \\begin{pmatrix} ${a + c} \\\\ ${b + d} \\end{pmatrix}$`),
            step("Take the magnitude", `$\\sqrt{${a + c}^2 + ${b + d}^2}$`),
            step("Answer", `= ${round(Math.hypot(a + c, b + d), 4)}`),
          ],
          takeaway: "Always add first, then take the magnitude — the two operations do not commute.",
        },
      );
    },
  },
  {
    key: "vector-collinearity",
    base: 0.5,
    span: 1.7,
    build: ({ rng }) => {
      const k = rng.int(-4, 4) || 3;
      const a = rng.int(1, 5);
      const b = rng.int(1, 5);
      const bx = a * k;
      const by = b * k;
      return numericQuestion(
        `Point $A$ has position vector $\\begin{pmatrix} ${a} \\\\ ${b} \\end{pmatrix}$ and point $B$ has position vector $\\begin{pmatrix} ${bx} \\\\ ${by} \\end{pmatrix}$. Find the ratio $AB$ in the form $k = m:n$ where $m$ is the multiplier relating A to B.`,
        k,
        {
          dp: 0,
          marks: 3,
          solution: [
            step("Compare the components", `${bx} / ${a} = ${bx / a}`),
            step("Check the other component", `${by} / ${b} = ${by / b}`),
            step("Conclusion", `Both match, so $\\mathbf{b} = ${k}\\mathbf{a}$.`),
            step(
              "Therefore",
              k === 0 ? "B is at the origin." : `A, B and the origin are collinear, and $B$ lies on the line through A and the origin.`,
            ),
          ],
          takeaway: "Position vectors are parallel exactly when one is a scalar multiple of the other.",
        },
      );
    },
  },
  {
    key: "vector-equation-line",
    base: 0.9,
    span: 1.8,
    build: ({ rng }) => {
      const m = rng.pick([1, 2, 3, 4, -1, -2, -3]);
      const x = rng.int(1, 5);
      // Choose the parameter value first, then derive the target coordinate so
      // the question and the solution can never disagree.
      const targetT = rng.pick([1, 2, 3, -1, -2]);
      const targetX = x + m * targetT;
      if (targetX === x) {
        // Degenerate: the equation would read "x = x", giving no information.
        return numericQuestion(
          `The line $AB$ has equation $\\mathbf{r} = \\begin{pmatrix} ${x} \\\\ ${2 * x} \\end{pmatrix} + t\\begin{pmatrix} 1 \\\\ 2 \\end{pmatrix}$. Find the value of $t$ when the $x$-coordinate is ${x + 3}.`,
          3,
          {
            dp: 0,
            marks: 2,
            solution: [
              step("Write the x-component", `$x = ${x} + t$`),
              step("Substitute", `$${x + 3} = ${x} + t$`),
              step("Rearrange", `$t = ${x + 3} - ${x} = 3$`),
            ],
            takeaway:
              "For a parametric line r = a + tb, every component shares the same parameter t.",
          },
        );
      }
      return numericQuestion(
        `The line $AB$ has equation $\\mathbf{r} = \\begin{pmatrix} ${x} \\\\ ${2 * x} \\end{pmatrix} + t\\begin{pmatrix} ${m} \\\\ ${2 * m} \\end{pmatrix}$. Find the value of $t$ when the $x$-coordinate is ${targetX}.`,
        targetT,
        {
          dp: 0,
          marks: 3,
          solution: [
            step("Write the x-component", `$x = ${x} ${signed(m)}t$`),
            step("Substitute the target x-coordinate", `$${targetX} = ${x} ${signed(m)}t$`),
            step("Rearrange", `$${signed(targetX - x)} = ${signed(m)}t$`),
            step(
              "Divide",
              `$t = \\dfrac{${targetX - x}}{${m}} = ${targetT}$`,
            ),
          ],
          takeaway:
            "For a parametric line r = a + tb, every component shares the same parameter t.",
        },
      );
    },
  },
];

registerGenerators(["em-10"], vectorGenerators);

// ================================================== Statistics (Paper 3)

/**
 * Deterministic fallback for the Venn diagram templates.
 *
 * The randomised version occasionally draws regions that overflow the survey
 * total, so this gives a valid, self-consistent diagram instead.
 */
function aVennFallback() {
  const total = 200;
  const aOnly = 40;
  const both = 25;
  const bOnly = 35;
  const neither = total - aOnly - both - bOnly;
  return numericQuestion(
    `In a survey of ${total} people, ${aOnly} take part in sport only, ${both} take part in both sport and music, and ${bOnly} take part in music only. How many take part in neither?`,
    neither,
    {
      dp: 0,
      marks: 3,
      solution: [
        step("Total the three regions", `$${aOnly} + ${both} + ${bOnly} = ${aOnly + both + bOnly}$`),
        step("Subtract from the total", `$${total} - ${aOnly + both + bOnly} = ${neither}$`),
      ],
      takeaway: "The three regions of a two-circle Venn diagram must sum to the total. Check they do.",
    },
  );
}

const statsGenerators: Generator[] = [
  // --- em-s1 Statistical sampling
  {
    key: "sampling-methods",
    base: -1.5,
    span: 1.4,
    build: ({ rng }) => {
      const scenarios: Array<{ q: string; correct: string; wrong: string[]; why: string }> = [
        {
          q: "A factory wants to test whether a component is faulty. Which sampling method is most appropriate?",
          correct: "Systematic sampling — take every kth item along the production line.",
          wrong: [
            "Quota sampling — interview a set number of workers.",
            "Stratified sampling — divide the workforce by age band.",
            "Simple random — draw 100 names from a hat.",
          ],
          why: "Items arrive in a random order along a line, so a regular interval removes time-of-day bias.",
        },
        {
          q: "A survey of school pupils' opinions should use which method to guarantee proportional representation of year groups?",
          correct: "Stratified sampling — split the population into year groups and sample each proportionally.",
          wrong: [
            "Simple random sampling of all 1,200 pupils.",
            "Systematic sampling — choose every 12th pupil from a list.",
            "Volunteer sampling — ask pupils who pass by.",
          ],
          why: "Stratification guarantees each subgroup is represented in the right proportion.",
        },
        {
          q: "A pharmaceutical company wants maximum confidence in a drug's safety. Which method is best?",
          correct: "A census of the whole population.",
          wrong: [
            "A small sample of volunteers.",
            "Quota sampling of 50 volunteers.",
            "Systematic sampling of 30 pharmacies.",
          ],
          why: "A census removes sampling error entirely, which matters when the cost of a missed side effect is high.",
        },
        {
          q: "An online poll asks people to self-select by clicking a link. What is the main problem?",
          correct: "Volunteer bias — the sample is unlikely to represent the population.",
          wrong: [
            "The sample size is too small to be reliable.",
            "The question is not a random variable.",
            "It is impossible to calculate a mean from the data.",
          ],
          why: "Self-selection means people with strong opinions are far more likely to respond.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 3,
        solution: [
          step("Consider the sampling frame", "Who is in the population, and how were they selected?"),
          step("Check for bias", chosen.why),
          step("Reliability", "Larger samples reduce random error, but they cannot fix systematic bias."),
        ],
        takeaway:
          "A big biased sample is still biased. Increasing the size reduces random error, not selection bias.",
      });
    },
  },
  {
    key: "sampling-fraction",
    base: -1.2,
    span: 1.4,
    build: ({ rng }) => {
      // Choose a sample size first, then build a population that it fits into
      // with a realistic (not 1:1) sampling fraction.
      const sample = rng.pick([20, 25, 40, 50, 80, 100, 120, 200]);
      const multiplier = rng.pick([4, 5, 8, 10, 20]);
      const population = sample * multiplier;
      return numericQuestion(
        `A researcher samples 1 in ${multiplier} of a population of ${population} people. How many people are sampled?`,
        sample,
        {
          dp: 0,
          marks: 2,
          solution: [
            step("Sampling fraction", `$\\dfrac{1}{${multiplier}} = ${round(1 / multiplier, 4)}$`),
            step(
              "Sample size = fraction × population",
              `$${population} \\times \\dfrac{1}{${multiplier}} = ${sample}$`,
            ),
            step("Check", `$${sample} \\times ${multiplier} = ${population}$ ✓`),
          ],
          takeaway:
            "Sample size = sampling fraction × population. A fraction of 1 in 1 would be a census, not a sample.",
        },
      );
    },
  },
  {
    key: "sampling-probability",
    base: -0.6,
    span: 1.6,
    build: ({ rng }) => {
      const n = rng.pick([10, 20, 25, 50]);
      // r must be a valid count for a bag of n, so pick it inside that range.
      const r = rng.int(2, Math.max(2, n - 2));
      const p = r / n;
      return numericQuestion(
        `A bag contains ${n} counters, ${r} of which are red. One counter is taken at random. Find the probability that it is red.`,
        p,
        {
          dp: 4,
          marks: 1,
          solution: [
            step("Probability", "$P(\\text{red}) = \\dfrac{\\text{number of red}}{\\text{total}}$"),
            step("Substitute", `$\\dfrac{${r}}{${n}} = ${round(p, 4)}$`),
          ],
          takeaway: "P = favourable outcomes ÷ total outcomes.",
        },
      );
    },
  },

  // --- em-s2 Descriptive statistics
  {
    key: "stats-averages",
    base: -1.6,
    span: 1.6,
    build: ({ rng, tier }) => {
      const n = rng.pick([5, 7]);
      const data: number[] = [];
      for (let i = 0; i < n; i++) data.push(rng.int(1, 30));
      const sorted = [...data].sort((x, y) => x - y);
      const mean = data.reduce((s, v) => s + v, 0) / n;
      const mid = Math.floor(n / 2);
      const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      const range = sorted[n - 1] - sorted[0];
      if (tier <= 2) {
        return numericQuestion(
          `Find the mean of the data ${data.join(", ")}.`,
          mean,
          {
            dp: 3,
            solution: [step("Add and divide", `$\\dfrac{${data.join(" + ")}}{${n}} = ${round(mean, 3)}$`)],
            takeaway: "The mean uses every data value, so one extreme value shifts it considerably.",
          },
        );
      }
      if (tier === 3) {
        return numericQuestion(
          `Find the median of the data ${data.join(", ")}.`,
          median,
          {
            dp: 2,
            solution: [
              step("Order the data", sorted.join(", ")),
              step(
                n % 2 === 0 ? "Average the two middle values" : "Take the middle value",
                `median = ${round(median, 2)}`,
              ),
            ],
            takeaway:
              n % 2 === 0
                ? "With an even count, the median is the mean of the two central values."
                : "With an odd count, the median is the single central value once ordered.",
          },
        );
      }
      return numericQuestion(
        `Find the range of the data ${data.join(", ")}.`,
        range,
        {
          dp: 0,
          solution: [step("Largest minus smallest", `$${sorted[n - 1]} - ${sorted[0]} = ${range}$`)],
          takeaway:
            "The range only uses two values, so it says nothing about how the rest of the data is spread.",
        },
      );
    },
  },
  {
    key: "stats-iqr",
    base: -0.2,
    span: 1.8,
    build: ({ rng }) => {
      const n = rng.pick([20, 40, 60, 100]);
      const q1 = rng.int(10, 30);
      const q3 = q1 + rng.int(5, 25);
      return numericQuestion(
        `For a data set of ${n} values, the first quartile is ${q1} and the third quartile is ${q3}. Calculate the interquartile range.`,
        q3 - q1,
        {
          dp: 0,
          solution: [
            step("Definition", "IQR = Q3 − Q1"),
            step("Substitute", `$${q3} - ${q1} = ${q3 - q1}$`),
          ],
          takeaway: "The IQR measures the spread of the middle 50% of the data and is unaffected by outliers.",
        },
      );
    },
  },
  {
    key: "stats-standard-deviation",
    base: 0.6,
    span: 2,
    build: ({ rng }) => {
      const mean = rng.int(5, 15);
      const sd = rng.pick([2, 3, 4, 5]);
      const z = rng.pick([1, 1, 2]);
      const value = mean + z * sd;
      return numericQuestion(
        `The mean of a distribution is ${mean} and the standard deviation is ${sd}. Find the value that lies ${z} standard deviations **above** the mean.`,
        value,
        {
          dp: 2,
          marks: 2,
          solution: [
            step("Standardised position", `x = \\mu + z\\sigma`),
            step("Substitute", `$${mean} + ${z}(${sd}) = ${value}$`),
          ],
          takeaway: "x = μ + zσ moves you up the distribution; x = μ − zσ moves you down.",
        },
      );
    },
  },
  {
    key: "stats-standardise",
    base: 0.4,
    span: 1.8,
    build: ({ rng }) => {
      const mean = rng.int(10, 30);
      const sd = rng.pick([2, 4, 5, 6]);
      const x = mean + rng.pick([1, 2, 2, 3]) * sd;
      const z = (x - mean) / sd;
      return numericQuestion(
        `A value $x = ${x}$ comes from a distribution with mean ${mean} and standard deviation ${sd}. Find its standardised value $z$.`,
        z,
        {
          dp: 2,
          solution: [
            step("Formula", "$z = \\dfrac{x - \\mu}{\\sigma}$"),
            step("Substitute", `$\\dfrac{${x} - ${mean}}{${sd}} = ${round(z, 2)}$`),
          ],
          takeaway:
            "Standardising makes distributions comparable: z = 0 is the mean, z = 1 is one standard deviation above.",
        },
      );
    },
  },

  // --- em-s3 Probability
  {
    key: "probability-combinations",
    base: -1.2,
    span: 1.8,
    build: ({ rng }) => {
      const n = rng.pick([5, 6, 7, 8, 10]);
      const r = rng.int(2, 3);
      return numericQuestion(
        `A team of ${r} is chosen at random from ${n} candidates. How many different teams are possible?`,
        binomialCoefficient(n, r),
        {
          dp: 0,
          marks: 3,
          solution: [
            step("Order does not matter", "A team is a combination, not a permutation."),
            step("Formula", "$\\binom{n}{r} = \\dfrac{n!}{r!(n-r)!}$"),
            step("Substitute", `$\\binom{${n}}{${r}} = ${binomialCoefficient(n, r)}$`),
          ],
          takeaway:
            "Use combinations when order does not matter (teams, selections) and permutations when it does (ranks, orders).",
        },
      );
    },
  },
  {
    key: "probability-conditional",
    base: 0.0,
    span: 1.8,
    build: ({ rng }) => {
      const total = rng.pick([50, 60, 80, 100, 120, 200]);
      const bCount = Math.round(total * rng.pick([0.4, 0.5, 0.6]));
      const both = Math.round(bCount * rng.pick([0.3, 0.5, 0.7]));
      return numericQuestion(
        `In a group of ${total} people, ${bCount} own a bicycle. Of those ${bCount} bicycle owners, ${both} also own a car. Given that a person owns a bicycle, find the probability that they also own a car.`,
        both / bCount,
        {
          dp: 4,
          marks: 3,
          solution: [
            step("Conditional probability", "$P(A \\mid B) = \\dfrac{P(A \\cap B)}{P(B)}$"),
            step("We condition on owning a bicycle", `So restrict attention to the ${bCount} owners.`),
            step("Substitute", `$\\dfrac{${both}}{${bCount}} = ${round(both / bCount, 4)}$`),
          ],
          takeaway:
            "Conditional probability changes the sample space. Drawing a diagram makes it much easier to see the right ratio.",
        },
      );
    },
  },
  {
    key: "probability-addition-rule",
    base: -0.8,
    span: 1.6,
    build: ({ rng }) => {
      const pA = rng.pick([0.3, 0.4, 0.5, 0.6]);
      const pB = rng.pick([0.2, 0.3, 0.4, 0.5]);
      const pBoth = rng.pick([0.1, 0.15, 0.2]);
      const sum = pA + pB - pBoth;
      return numericQuestion(
        `In a survey, $P(A) = ${pA}$, $P(B) = ${pB}$ and $P(A \\cap B) = ${pBoth}$. Find $P(A \\cup B)$.`,
        sum,
        {
          dp: 3,
          solution: [
            step("Addition rule", "$P(A \\cup B) = P(A) + P(B) - P(A \\cap B)$"),
            step("Subtract the overlap", "We would otherwise double-count the intersection."),
            step("Substitute", `$${pA} + ${pB} - ${pBoth} = ${round(sum, 3)}$`),
          ],
          takeaway: "Add, then subtract the intersection. For mutually exclusive events the intersection is 0.",
        },
      );
    },
  },
  {
    key: "probability-venn-diagram",
    base: 0.2,
    span: 1.6,
    build: ({ rng }) => {
      const n = rng.pick([100, 200, 300, 500]);
      // Build the three inner regions first, then size the survey so that a
      // sensible "neither" region is left over.
      const aOnly = rng.int(15, 40);
      const both = rng.int(10, 35);
      const bOnly = rng.int(15, 40);
      const inner = aOnly + both + bOnly;
      if (inner >= n) return aVennFallback();
      const neither = n - inner;
      return numericQuestion(
        `In a survey of ${n} people, ${aOnly} take part in sport only, ${both} take part in both sport and music, and ${bOnly} take part in music only. How many take part in neither?`,
        neither,
        {
          dp: 0,
          marks: 3,
          solution: [
            step("Total the three regions", `$${aOnly} + ${both} + ${bOnly} = ${inner}$`),
            step("Subtract from the total", `$${n} - ${inner} = ${neither}$`),
            step(
              "Sanity check",
              `The three regions total ${inner}, which is less than ${n}, so the remainder is positive.`,
            ),
          ],
          takeaway: "The three regions of a two-circle Venn diagram must sum to the total. Check they do.",
        },
      );
    },
  },
  {
    key: "probability-venn-union",
    base: 0.6,
    span: 1.7,
    build: ({ rng }) => {
      const total = rng.pick([80, 120, 200, 300]);
      const aOnly = rng.int(15, 40);
      const both = rng.int(10, 30);
      const bOnly = rng.int(15, 40);
      const neither = total - aOnly - both - bOnly;
      if (neither < 0) return aVennFallback();
      const union = aOnly + both + bOnly;
      return numericQuestion(
        `In a survey of ${total} people, ${aOnly} take part in sport only, ${both} take part in both sport and music, and ${bOnly} take part in music only. How many take part in at least one of the two?`,
        union,
        {
          dp: 0,
          marks: 3,
          solution: [
            step("Add the three regions", `Sport only, both, and music only: $${aOnly} + ${both} + ${bOnly}$`),
            step("Total", `$= ${union}$`),
            step("Cross-check", `$${total} - ${neither} = ${union}$, which agrees.`),
          ],
          takeaway:
            "The 'at least one' region of a Venn diagram is the union: subtract the 'neither' region from the total.",
        },
      );
    },
  },

  // --- em-s4 Random variables and distributions
  {
    key: "distribution-expectation",
    base: -1.1,
    span: 1.8,
    build: ({ rng }) => {
      const p1 = rng.pick([0.1, 0.2, 0.3, 0.4]);
      const p2 = rng.pick([0.2, 0.3, 0.4]);
      const p3 = rng.pick([0.3, 0.4]);
      const p4 = round(1 - p1 - p2 - p3, 3);
      if (p4 <= 0) {
        return numericQuestion(
          `A discrete random variable $X$ takes values 0, 1, 2 with probabilities 0.2, 0.3 and 0.5. Find $E(X)$.`,
          1.3,
          {
            dp: 2,
            solution: [
              step("Expected value", "$E(X) = \\sum x\\,P(X=x)$"),
              step("Substitute", "$0(0.2) + 1(0.3) + 2(0.5) = 1.3$"),
            ],
            takeaway: "Multiply each value by its probability, then add. That weighted average is E(X).",
          },
        );
      }
      const values = [1, 2, 3, 4];
      const ex = values.reduce((s, v, i) => s + v * [p1, p2, p3, p4][i], 0);
      return numericQuestion(
        `A discrete random variable $X$ takes values 1, 2, 3, 4 with probabilities ${[p1, p2, p3, p4].join(", ")}. Find $E(X)$.`,
        ex,
        {
          dp: 3,
          marks: 3,
          solution: [
            step("Expected value formula", "$E(X) = \\sum x \\, P(X = x)$"),
            step("Multiply each value by its probability", `${values.map((v, i) => `${v} \\times ${[p1, p2, p3, p4][i]}`).join(", ")}`),
            step("Add", `= ${round(ex, 3)}`),
          ],
          takeaway: "E(X) is the long-run average of X. It does not have to be a value X can actually take.",
        },
      );
    },
  },
  {
    key: "distribution-variance",
    base: 0.2,
    span: 1.8,
    build: ({ rng }) => {
      const p1 = rng.pick([0.2, 0.3]);
      const p2 = rng.pick([0.3, 0.4]);
      const p3 = rng.pick([0.4, 0.3]);
      const p4 = round(1 - p1 - p2 - p3, 3);
      if (p4 <= 0) {
        return numericQuestion(
          `X takes values 0, 1, 2 with probabilities 0.2, 0.3, 0.5. Find $\\operatorname{Var}(X)$.`,
          0.61,
          {
            dp: 3,
            solution: [
              step("Expected value", "$E(X) = 0(0.2) + 1(0.3) + 2(0.5) = 1.3$"),
              step("E(X²)", "$E(X^2) = 0 + 0.3 + 4(0.5) = 2.3$"),
              step("Variance", "$2.3 - 1.3^2 = 2.3 - 1.69 = 0.61$"),
            ],
            takeaway: "Var(X) = E(X²) − (E(X))². Do not subtract the mean before squaring.",
          },
        );
      }
      const values = [1, 2, 3, 4];
      const probs = [p1, p2, p3, p4];
      const ex = values.reduce((s, v, i) => s + v * probs[i], 0);
      const ex2 = values.reduce((s, v, i) => s + v * v * probs[i], 0);
      return numericQuestion(
        `X takes values 1, 2, 3, 4 with probabilities ${probs.join(", ")}. Find $\\operatorname{Var}(X)$.`,
        ex2 - ex * ex,
        {
          dp: 4,
          marks: 4,
          solution: [
            step("Expected value", `$E(X) = ${round(ex, 4)}$`),
            step("Second moment", `$E(X^2) = ${round(ex2, 4)}$`),
            step("Variance", `$\\operatorname{Var}(X) = E(X^2) - (E(X))^2$`),
            step("Substitute", `$${round(ex2, 4)} - ${round(ex * ex, 4)} = ${round(ex2 - ex * ex, 4)}$`),
          ],
          takeaway: "Var(X) = E(X²) − (E(X))². The standard deviation is the square root of this.",
        },
      );
    },
  },
  {
    key: "distribution-binomial",
    base: 0.5,
    span: 1.8,
    build: ({ rng }) => {
      const n = rng.pick([5, 8, 10, 12, 15]);
      const p = rng.pick([0.2, 0.25, 0.3, 0.4, 0.5]);
      const r = rng.int(1, Math.min(4, n - 1));
      const comb = binomialCoefficient(n, r);
      const value = comb * p ** r * (1 - p) ** (n - r);
      return numericQuestion(
        `X ~ Bin(${n}, ${p}). Find $P(X = ${r})$, giving your answer to 5 decimal places.`,
        value,
        {
          dp: 5,
          marks: 3,
          solution: [
            step("Binomial formula", "$P(X = r) = \\binom{n}{r} p^r (1-p)^{n-r}$"),
            step("Substitute", `$\\binom{${n}}{${r}} \\times ${p}^{${r}} \\times ${(1 - p).toFixed(2)}^{${n - r}}$`),
            step("Evaluate", `$= ${comb} \\times ${round(p ** r, 6)} \\times ${round((1 - p) ** (n - r), 6)}$`, `= ${round(value, 5)}`),
          ],
          takeaway:
            "The binomial models the number of successes in n independent trials where each has the same probability p.",
        },
      );
    },
  },
  {
    key: "distribution-binomial-conditions",
    base: 0.0,
    span: 1.4,
    build: () =>
      choiceQuestion(
        "Which set of conditions must hold for a binomial distribution to be valid?",
        "Fixed number of independent trials, with the same probability of success on each.",
        [
          "The number of trials can vary, as long as the probability is constant.",
          "Trials must be dependent so that the outcomes interact.",
          "The probability of success may change between trials.",
        ],
        {
          rng: new Rng("binomial-conditions"),
          marks: 2,
          solution: [
            step("State the conditions", "n is fixed, trials are independent, and p is the same every time."),
            step("Check the options", "Each wrong option breaks one of the three conditions."),
          ],
          takeaway: "Fixed n, independence, constant p. If any fails, the binomial does not apply.",
        },
      ),
  },
];

registerGenerators(["em-s1", "em-s2", "em-s3", "em-s4"], statsGenerators);

// --- em-s5 Statistical distributions (normal distribution)
const normalGenerators: Generator[] = [
  {
    key: "normal-percentage",
    base: -1.0,
    span: 1.6,
    build: ({ rng, tier }) => {
      const table: Array<{ z: number; above: number; below: number }> = [
        { z: 1, above: 0.1587, below: 0.8413 },
        { z: 2, above: 0.0228, below: 0.9772 },
        { z: 1.5, above: 0.0668, below: 0.9332 },
        { z: 2.5, above: 0.0062, below: 0.9938 },
      ];
      // Pick the table row FIRST, then build x from it, so that the value in
      // the question and the probability read from the table always agree.
      const row = rng.pick(table);
      const mean = rng.pick([10, 20, 25, 30, 40, 50]);
      const sd = rng.pick([2, 3, 4, 5, 6]);
      const x = mean + row.z * sd;
      const rightTail = rng.bool(0.5);

      if (tier <= 3) {
        return numericQuestion(
          `$X$ is normally distributed with mean ${mean} and standard deviation ${sd}. Find $P(X < ${x})$.`,
          row.below,
          {
            dp: 4,
            marks: 3,
            solution: [
              step("Standardise", `$z = \\dfrac{${x} - ${mean}}{${sd}} = ${row.z}$`),
              step("Read from the table", `$P(Z < ${row.z}) = ${row.below}$`),
              step("Symmetry check", `The normal distribution is symmetric about its mean.`),
            ],
            takeaway: "Always standardise to Z ~ N(0, 1) before using the table.",
          },
        );
      }

      return numericQuestion(
        `$X$ is normally distributed with mean ${mean} and standard deviation ${sd}. Find $P(X ${rightTail ? ">" : "<"} ${x})$.`,
        rightTail ? row.above : row.below,
        {
          dp: 4,
          marks: 4,
          solution: [
            step("Standardise", `$z = \\dfrac{${x} - ${mean}}{${sd}} = ${row.z}$`),
            rightTail
              ? step(
                  "Take one from the left-hand area",
                  `Tables give $P(Z < ${row.z}) = ${row.below}$, so $P(X > ${x}) = 1 - ${row.below} = ${row.above}$.`,
                )
              : step("Read the left-hand area", `$P(X < ${x}) = P(Z < ${row.z}) = ${row.below}$.`),
            step("Convert back if needed", `$x = \\mu + z\\sigma = ${mean} + ${row.z}(${sd}) = ${x}$.`),
          ],
          takeaway: "The tables usually give the area to the LEFT of z. Take 1 − that for a right-hand tail.",
        },
      );
    },
  },
  {
    key: "normal-inverse",
    base: 0.4,
    span: 1.8,
    build: ({ rng }) => {
      const pairs: Array<{ pct: number; z: number }> = [
        { pct: 0.5, z: 0 },
        { pct: 0.8413, z: 1 },
        { pct: 0.9772, z: 2 },
        { pct: 0.9332, z: 1.5 },
        { pct: 0.9938, z: 2.5 },
      ];
      const row = rng.pick(pairs.slice(1));
      const mean = rng.int(20, 50);
      const sd = rng.pick([2, 3, 4, 5, 6]);
      const value = mean + row.z * sd;
      return numericQuestion(
        `X is normally distributed with mean ${mean} and standard deviation ${sd}. $P(X < x) = ${row.pct}$. Find $x$.`,
        value,
        {
          dp: 2,
          marks: 4,
          solution: [
            step("Work in standard units", `Find $z$ such that $P(Z < z) = ${row.pct}$.`),
            step("Read from the table", `$z = ${row.z}$`),
            step("Convert back", `$x = \\mu + z\\sigma = ${mean} + ${row.z}(${sd}) = ${round(value, 2)}$`),
          ],
          takeaway: "Inverse normal problems go Z → X with x = μ + zσ. Do not forget the conversion back.",
        },
      );
    },
  },
  {
    key: "normal-continuity-correction",
    base: 0.8,
    span: 1.8,
    build: ({ rng }) => {
      const n = rng.pick([50, 80, 100, 150]);
      const p = rng.pick([0.2, 0.25, 0.3, 0.4, 0.5]);
      const r = rng.int(Math.floor(n * p) - 3, Math.floor(n * p) + 3);
      const atLeast = rng.bool(0.5);

      const mu = n * p;
      const sigma = Math.sqrt(n * p * (1 - p));
      // Continuity correction: P(X >= r) -> P(Y > r - 0.5),
      // and P(X <= r) -> P(Y < r + 0.5).
      const boundary = atLeast ? r - 0.5 : r + 0.5;
      const z = (boundary - mu) / sigma;
      const value = atLeast ? standardNormalUpperTail(z) : standardNormalCdf(z);

      return numericQuestion(
        `$X \\sim \\mathrm{Bin}(${n}, ${p})$. Use the normal approximation with a continuity correction to estimate $P(X ${atLeast ? "\\geq" : "\\leq"} ${r})$. Give the answer as a decimal.`,
        value,
        {
          dp: 4,
          marks: 4,
          solution: [
            step(
              "Binomial parameters",
              `$\\mu = np = ${n}(${p}) = ${round(mu, 2)}$, $\\sigma = \\sqrt{np(1-p)} = ${round(sigma, 4)}$`,
            ),
            step(
              "Apply the continuity correction",
              atLeast
                ? `$P(X \\geq ${r}) \\approx P(Y > ${r} - 0.5) = P(Y > ${boundary})$`
                : `$P(X \\leq ${r}) \\approx P(Y < ${r} + 0.5) = P(Y < ${boundary})$`,
            ),
            step("Standardise", `$z = \\dfrac{${boundary} - ${round(mu, 2)}}{${round(sigma, 4)}} = ${round(z, 4)}$`),
            step(
              "Look up the area",
              atLeast
                ? `$P(Z > ${round(z, 4)}) = 1 - P(Z < ${round(z, 4)}) = ${round(value, 4)}$`
                : `$P(Z < ${round(z, 4)}) = ${round(value, 4)}$`,
            ),
          ],
          takeaway:
            "P(X ≥ r) becomes P(Y > r − 0.5), and P(X ≤ r) becomes P(Y < r + 0.5). Skipping the correction loses a mark.",
        },
      );
    },
  },
  {
    key: "normal-check-validity",
    base: -0.2,
    span: 1.4,
    build: () =>
      choiceQuestion(
        "When is the normal approximation to a binomial distribution appropriate?",
        "When np and n(1 − p) are both at least 10.",
        [
          "Whenever n is at least 10.",
          "Whenever p is greater than 0.5.",
          "Whenever n is even.",
        ],
        {
          rng: new Rng("normal-validity"),
          marks: 2,
          solution: [
            step("Both tails need to be well populated", "np counts expected successes and n(1−p) counts expected failures."),
            step("Requirement", "Both should be at least 10 for the approximation to be reliable."),
          ],
          takeaway: "Check np ≥ 10 and n(1−p) ≥ 10 before approximating. Examiners expect this check.",
        },
      ),
  },
];

registerGenerators(["em-s5"], normalGenerators);

// --- em-s6 Statistical hypothesis testing
const hypothesisGenerators: Generator[] = [
  {
    key: "hypothesis-interpretation",
    base: -1.4,
    span: 1.6,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "A manufacturer claims a new battery lasts longer than 10 hours on average. Which test is needed?",
          correct: "A one-tailed test, because the claim is directional (greater than).",
          wrong: [
            "A two-tailed test, because any difference matters.",
            "A one-tailed test, because 10 hours is the mean.",
            "A two-tailed test, because the sample size is unknown.",
          ],
          why: "The alternative hypothesis is directional, so only one tail is used.",
        },
        {
          q: "A study claims a new drug has a different effect from the existing treatment. Which test is needed?",
          correct: "A two-tailed test, because the claim is non-directional (different).",
          wrong: [
            "A one-tailed test, because drugs improve outcomes.",
            "A one-tailed test, because the sample is small.",
            "A two-tailed test, because the null hypothesis is always true.",
          ],
          why: "'Different' could mean higher or lower, so both tails are needed.",
        },
        {
          q: "A p-value of 0.02 is found and the significance level is 0.05. What is the conclusion?",
          correct: "Reject the null hypothesis — the result is statistically significant.",
          wrong: [
            "Accept the null hypothesis — 0.02 is close to 0.05.",
            "Reject the null hypothesis — 0.02 is more than 0.05.",
            "Neither can be concluded without knowing the sample size.",
          ],
          why: "p-value 0.02 < 0.05, so the result is significant at the 5% level.",
        },
        {
          q: "A p-value of 0.08 is found and the significance level is 0.05. What is the conclusion?",
          correct: "Do not reject the null hypothesis — the result is not statistically significant.",
          wrong: [
            "Reject the null hypothesis — 0.08 is close to 0.05.",
            "Accept the null hypothesis — the effect is proven to be zero.",
            "Repeat the test until the p-value falls below 0.05.",
          ],
          why: "0.08 > 0.05. You never 'accept' the null hypothesis, only fail to reject it.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 3,
        solution: [
          step("Identify the alternative hypothesis", chosen.why),
          step("Compare p-value to significance level", "Reject H₀ only when p ≤ the significance level."),
        ],
        takeaway:
          "You either reject H₀ or fail to reject it. 'Accepting' H₀ is never technically correct.",
      });
    },
  },
  {
    key: "hypothesis-errors",
    base: 0.2,
    span: 1.6,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "A new medicine is wrongly declared ineffective when it actually works. What type of error is this?",
          correct: "Type II — you failed to reject a false null hypothesis.",
          wrong: ["Type I", "A random error", "A sampling frame error"],
          why: "H₀ said 'no effect' but the effect exists, and it was not detected.",
        },
        {
          q: "A new medicine is wrongly declared to have an effect when it does not. What type of error is this?",
          correct: "Type I — you rejected a true null hypothesis.",
          wrong: ["Type II", "A random error", "A systematic sampling error"],
          why: "H₀ said 'no effect' and it was true, but it was rejected anyway.",
        },
        {
          q: "How does reducing the significance level from 5% to 1% affect the probability of a Type I error?",
          correct: "It decreases, because the critical region becomes smaller.",
          wrong: [
            "It increases, because more tests are significant.",
            "It stays the same, because the sample size is unchanged.",
            "It decreases the probability of a Type II error.",
          ],
          why: "The significance level IS the probability of a Type I error.",
        },
        {
          q: "Why is a Type I error more serious when testing a new drug for side effects?",
          correct: "Patients could be given an unsafe treatment that does not work.",
          wrong: [
            "A useful treatment might be withdrawn from patients who need it.",
            "It would increase the sample size required.",
            "It would make the p-value smaller.",
          ],
          why: "The cost of harm outweighs the cost of a missed benefit in this context.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 2,
        solution: [step("Define both error types", "Type I = false positive (rejected a true H₀). Type II = false negative."), step("Apply", chosen.why)],
        takeaway: "Lowering the significance level reduces Type I errors but increases Type II errors.",
      });
    },
  },
  {
    key: "hypothesis-test-from-data",
    base: 0.2,
    span: 1.9,
    build: ({ rng, tier }) => {
      // Build a two-tailed test whose outcome is decided by comparing a test
      // statistic with a critical value, so the answer is derived, not asserted.
      const n = rng.pick([20, 25, 30, 36, 49]);
      const nullMean = rng.pick([10, 20, 50, 100]);
      const sigma = rng.pick([2, 4, 5, 10, 20]);
      const level = rng.pick([0.05, 0.01]);

      // Critical z: 1.96 at 5%, 2.576 at 1%.
      const zCrit = level === 0.05 ? 1.96 : 2.576;

      // Either land inside or outside the critical region.
      const reject = rng.bool(0.5);
      const zStat = reject
        ? round(zCrit + rng.float(0.05, 0.9), 3)
        : round(zCrit - rng.float(0.2, 1.4), 3);

      const rejectText = reject
        ? "Reject H₀: the result is statistically significant."
        : "Do not reject H₀: the result is not statistically significant.";

      return choiceQuestion(
        `A sample of ${n} values has mean ${round(nullMean + zStat * (sigma / Math.sqrt(n)), 2)}, where the null hypothesis is that the population mean is ${nullMean} and the population standard deviation is known to be ${sigma}. The test is two-tailed at the ${level * 100}% significance level. What is the correct conclusion?`,
        rejectText,
        [
          reject
            ? "Do not reject H₀: the result is not statistically significant."
            : "Reject H₀: the result is statistically significant.",
          "Accept H₀: the population mean has been proven to be " + nullMean + ".",
          "Reject H₀, because a p-value below " + level + " proves the null hypothesis is false.",
        ],
        {
          rng,
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step(
              "Standardise",
              `$z = \\dfrac{\\bar{x} - \\mu_0}{\\sigma/\\sqrt{n}} = ${zStat}$.`,
            ),
            step(
              "Critical region",
              `Two-tailed at ${level * 100}% gives a critical value of $z = \\pm ${zCrit}$, so reject when $|z| > ${zCrit}$.`,
            ),
            step(
              "Compare",
              `Here $|z| = ${Math.abs(zStat)}$ ${Math.abs(zStat) > zCrit ? "exceeds" : "is below"} ${zCrit}, so the correct conclusion is: ${rejectText.toLowerCase()}`,
            ),
          ],
          takeaway:
            "Never write 'accept H₀'. Failing to reject is not proof of the null hypothesis, and a small p-value does not prove it false either.",
        },
      );
    },
  },
  {
    key: "hypothesis-critical-region",
    base: 0.5,
    span: 1.8,
    build: ({ rng, tier }) => {
      const level = rng.pick([0.05, 0.01]);
      const tails = rng.pick([1, 2] as const);
      const k = 1 - level / tails;
      // Upper-tail percentage critical value for common levels.
      const table: Record<string, number> = {
        "0.9": 1.282,
        "0.975": 1.96,
        "0.98": 2.054,
        "0.995": 2.576,
        "0.999": 3.291,
      };
      const z = table[String(round(k, 3))] ?? 1.96;

      return numericQuestion(
        `Find the critical value of the test statistic for a **${tails === 1 ? "one" : "two"}-tailed** test at the ${level * 100}% significance level.`,
        z,
        {
          dp: 3,
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step(
              "Split the level",
              `A ${tails}-tailed test splits the ${level * 100}% across ${tails} tail${tails === 1 ? "" : "s"}, so each tail is ${round(level / tails, 4)}.`,
            ),
            step(
              "Look up the normal distribution",
              `The value with ${round(1 - level / tails, 3)} of the distribution below it is $z = ${z}$.`,
            ),
            step(
              "Check the shape",
              `A one-tailed critical region is $z > ${z}$; a two-tailed one is $|z| > ${z}$.`,
            ),
          ],
          takeaway:
            "A two-tailed test halves the significance level per tail, so its critical values are further from zero. Read the table at 1 − α/2, not at 1 − α.",
        },
      );
    },
  },
  {
    key: "hypothesis-p-value",
    base: 0.3,
    span: 1.8,
    build: ({ rng, tier }) => {
      const p = rng.pick([0.02, 0.03, 0.04, 0.06, 0.08, 0.15, 0.22]);
      const level = rng.pick([0.05, 0.1]);
      const reject = p < level;
      const significant = reject
        ? `statistically significant at the ${level * 100}% level`
        : `not statistically significant at the ${level * 100}% level`;

      return choiceQuestion(
        `A hypothesis test gives a p-value of **${p}**. The test is carried out at the ${level * 100}% significance level. How should the result be interpreted?`,
        `The result is ${significant}.`,
        [
          `The result is ${reject ? "not statistically significant" : "statistically significant"} at the ${level * 100}% level.`,
          `There is a ${p * 100}% probability that the null hypothesis is true.`,
          `There is a ${(1 - p) * 100}% probability that the alternative hypothesis is true.`,
        ],
        {
          rng,
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step(
              "Compare to the level",
              `The p-value ${p} is ${p < level ? "less than" : "greater than"} the significance level ${level}.`,
            ),
            step(
              "Decision",
              reject
                ? `Since p < ${level}, reject H₀ and call the result ${significant}.`
                : `Since p > ${level}, do not reject H₀ and call the result ${significant}.`,
            ),
            step(
              "The trap",
              "A p-value is the probability of data this extreme if H₀ were true. It is not the probability that H₀ is true, which is why both 'there is a p% chance H₀ is true' options are wrong.",
            ),
          ],
          takeaway:
            "A p-value measures how surprising the data would be if H₀ held. It says nothing about the probability that H₀ is true.",
        },
      );
    },
  },
];

registerGenerators(["em-s6"], hypothesisGenerators);

// --- em-s7 Further probability and em-s8 Further statistics
const furtherGenerators: Generator[] = [
  {
    key: "further-modelling-assumptions",
    base: -0.4,
    span: 1.6,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "A model assumes each person independently has a 1% chance of catching flu. What is a key criticism?",
          correct: "People in the same household or school are not independent, so probabilities are overestimated.",
          wrong: [
            "1% is too high a probability to be realistic.",
            "The binomial distribution cannot handle a probability of 0.01.",
            "Independence is guaranteed by the definition of the binomial distribution.",
          ],
          why: "Independence is an assumption, and it often fails in practice.",
        },
        {
          q: "A coin is modelled as fair. What is a key criticism?",
          correct: "Real coins are usually slightly biased, so the assumption of fairness may not hold.",
          wrong: [
            "Coins cannot be used in probability models.",
            "The model assumes independence which is impossible for a coin.",
            "The probability of heads must be greater than 0.5 in any valid model.",
          ],
          why: "Model assumptions should be tested against evidence where possible.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 3,
        solution: [
          step("State the assumption", "Each trial is independent with constant probability."),
          step("Critique", chosen.why),
          step("Effect on the answer", "Overestimating independence tends to push probabilities towards 0.5."),
        ],
        takeaway: "A model is only as good as its assumptions — always ask whether they are reasonable.",
      });
    },
  },
  {
    key: "further-covariance",
    base: 0.6,
    span: 1.8,
    build: ({ rng }) => {
      const ex = rng.pick([3, 4, 5]);
      const ey = rng.pick([6, 8, 10]);
      const cov = rng.pick([-2, -1, 1, 2, 3]);
      return numericQuestion(
        `Given $E(X) = ${ex}$ and $E(Y) = ${ey}$, find $E(XY) - E(X)E(Y)$ — that is, the covariance of X and Y.`,
        cov,
        {
          dp: 2,
          marks: 2,
          solution: [
            step("Definition of covariance", "$\\operatorname{Cov}(X, Y) = E(XY) - E(X)E(Y)$"),
            step("Sign tells you the relationship", cov > 0 ? "A positive value means X and Y tend to increase together." : "A negative value means they tend to move in opposite directions."),
          ],
          takeaway:
            "Covariance generalises variance. If Y = X, then Cov(X, Y) = Var(X); if Y = 2X, it is 2Var(X).",
        },
      );
    },
  },
  {
    key: "further-correlation",
    base: 0.4,
    span: 1.8,
    build: ({ rng }) => {
      const r = rng.pick([0.2, 0.45, 0.6, 0.85, -0.3, -0.7]);
      const r2 = r * r;
      const strength =
        Math.abs(r) < 0.4 ? "weak" : Math.abs(r) < 0.7 ? "moderate" : "strong";
      return numericQuestion(
        `The correlation coefficient between two variables is $r = ${r}$. Calculate the coefficient of determination $r^2$, giving your answer to 4 decimal places.`,
        r2,
        {
          dp: 4,
          marks: 2,
          solution: [
            step("Square the correlation", `$r^2 = (${r})^2 = ${round(r2, 4)}$`),
            step("Interpret", `r² = ${round(r2, 4)}, so ${round(r2 * 100, 1)}% of the variation in one variable is explained by the other (a ${strength} relationship).`),
          ],
          takeaway:
            "r measures direction and strength of a linear relationship; r² is the proportion of variation explained.",
        },
      );
    },
  },
  {
    key: "further-residuals",
    base: 0.8,
    span: 1.6,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "A least squares line is drawn and one point sits far above all the others. What does this suggest?",
          correct: "That point is an influential outlier and the model may be a poor fit for it.",
          wrong: [
            "The point confirms the model is a good fit.",
            "The residual for that point must be zero.",
            "The line of best fit must pass through every data point.",
          ],
          why: "Least squares minimises total squared error, so outliers can drag the line towards themselves.",
        },
        {
          q: "Residuals for a model are all positive or all negative across the range. What does this indicate?",
          correct: "The model is systematically wrong — it is biased, not just noisy.",
          wrong: [
            "The model is a very good fit.",
            "The sample size is too small.",
            "The data is perfectly random.",
          ],
          why: "Random residuals should sit above and below the line with no clear pattern.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 3,
        solution: [
          step("Residual = actual − predicted", "A large residual means the model misses that point badly."),
          step("Apply", chosen.why),
          step("Good fit", "Residuals should be small, random and centred on zero."),
        ],
        takeaway: "A scatter of residuals with no pattern is the sign of a sensible model.",
      });
    },
  },
];

registerGenerators(["em-s7", "em-s8"], furtherGenerators);

// ================================================= Mechanics (Paper 3)

const kinematicsGenerators: Generator[] = [
  {
    key: "mech-units",
    base: -1.8,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        { from: "km/h", to: "m/s", factor: 1 / 3.6, v: rng.pick([18, 36, 72, 90, 108]) },
        { from: "m/s", to: "km/h", factor: 3.6, v: rng.pick([2, 5, 10, 15, 20]) },
      ];
      const item = rng.pick(items);
      return numericQuestion(
        `Convert ${item.v} ${item.from} into ${item.to}. Give your answer to 4 decimal places.`,
        item.v * item.factor,
        {
          dp: 4,
          marks: 2,
          solution: [
            step("Conversion factor", `1 ${item.to} = ${item.factor === 1 / 3.6 ? "3.6" : "1/3.6"} ${item.from}`),
            step("Multiply", `$${item.v} ${item.to === "m/s" ? "÷ 3.6" : "× 3.6"}$`, `= ${round(item.v * item.factor, 4)} ${item.to}`),
          ],
          takeaway: "1 m/s = 3.6 km/h. In exams, state the conversion explicitly to earn the mark.",
        },
      );
    },
  },
  {
    key: "mech-suvat-vu-at",
    base: -1.4,
    span: 1.7,
    build: ({ rng, tier }) => {
      const a = rng.pick([2, 4, 5, 6, 9, 10]);
      const t = rng.pick([2, 3, 4, 5, 6]);

      if (tier <= 2) {
        // Starts from rest, so u = 0 is stated rather than implied.
        return numericQuestion(
          `A particle starts from rest and accelerates uniformly at ${a} m s⁻² for ${t} seconds. Find its speed after ${t} seconds.`,
          a * t,
          {
            dp: 2,
            unit: "m/s",
            marks: 2,
            solution: [
              step("Choose the formula", "$v = u + at$"),
              step("From rest", "$u = 0$"),
              step("Substitute", `$v = 0 + ${a}(${t}) = ${a * t}$ m s⁻¹`),
            ],
            takeaway: "SUVAT: pick the formula that contains exactly the three quantities you know.",
          },
        );
      }

      const u = rng.pick([2, 5, 8, 10, 12]);
      return numericQuestion(
        `A particle is travelling at ${u} m s⁻¹ and accelerates uniformly at ${a} m s⁻² for ${t} seconds. Find its speed after ${t} seconds.`,
        u + a * t,
        {
          dp: 2,
          unit: "m/s",
          marks: 3,
          solution: [
            step(
              "Choose the formula",
              "$v = u + at$ — final velocity, initial velocity, acceleration, time.",
            ),
            step("Substitute", `$v = ${u} + ${a}(${t}) = ${u + a * t}$ m s⁻¹`),
          ],
          takeaway: "SUVAT: pick the formula that contains exactly the three quantities you know.",
        },
      );
    },
  },
  {
    key: "mech-suvat-distance",
    base: -1.0,
    span: 1.8,
    build: ({ rng }) => {
      const u = rng.pick([0, 2, 4, 6, 8, 10]);
      const a = rng.pick([2, 4, 5, 6, 8]);
      const t = rng.pick([2, 3, 4, 5, 6]);
      const s = u * t + 0.5 * a * t * t;
      return numericQuestion(
        `A particle has initial velocity ${u} m s⁻¹ and accelerates uniformly at ${a} m s⁻². Find the distance travelled in the first ${t} seconds.`,
        s,
        {
          dp: 2,
          unit: "m",
          marks: 3,
          solution: [
            step("Choose the formula", "$s = ut + \\frac{1}{2}at^2$"),
            step("Substitute", `$s = ${u}(${t}) + \\frac{1}{2}(${a})(${t})^2$`),
            step("Evaluate", `$= ${u * t} + ${round(0.5 * a * t * t, 2)} = ${round(s, 2)}$`),
          ],
          takeaway: "Check units on every answer. Distance in metres requires u in m/s and a in m/s².",
        },
      );
    },
  },
  {
    key: "mech-suvat-solve-missing",
    base: 0.2,
    span: 1.8,
    build: ({ rng }) => {
      const u = rng.pick([0, 4, 6, 10]);
      const v = rng.pick([12, 15, 20, 25]);
      const t = rng.pick([2, 3, 4]);
      const a = (v - u) / t;
      return numericQuestion(
        `A particle accelerates uniformly from ${u} m s⁻¹ to ${v} m s⁻¹ in ${t} seconds. Find its acceleration.`,
        a,
        {
          dp: 2,
          unit: "m/s^2",
          marks: 3,
          solution: [
            step("Rearrange $v = u + at$", "$a = \\dfrac{v - u}{t}$"),
            step("Substitute", `$a = \\dfrac{${v} - ${u}}{${t}}$`),
            step("Answer", `= ${round(a, 2)} m s⁻²`),
          ],
          takeaway: "Every SUVAT equation can be rearranged. Identify what you want, then rearrange the formula.",
        },
      );
    },
  },
  {
    key: "mech-average-speed",
    base: -1.6,
    span: 1.4,
    build: ({ rng }) => {
      const d1 = rng.pick([30, 40, 50, 60, 80, 100]);
      const s1 = rng.pick([10, 20, 25, 30]);
      const d2 = rng.pick([40, 50, 60, 80, 100]);
      const s2 = rng.pick([15, 20, 25, 30]);
      const value = (d1 + d2) / (d1 / s1 + d2 / s2);
      return numericQuestion(
        `A car travels ${d1} km at ${s1} m s⁻¹ and then ${d2} km at ${s2} m s⁻¹. Find the average speed for the whole journey, in m s⁻¹.`,
        value,
        {
          dp: 3,
          unit: "m/s",
          marks: 4,
          solution: [
            step("Convert the second leg", `${d2} km = ${round((d2 * 1000) / s2, 2)} s`),
            step("Convert the first leg", `${d1} km = ${round((d1 * 1000) / s1, 2)} s`),
            step(
              "Average speed = total distance ÷ total time",
              `$\\dfrac{${(d1 + d2) * 1000}}{${round((d1 * 1000) / s1 + (d2 * 1000) / s2, 2)}}$`,
              `= ${round(value, 3)} m s⁻¹`,
            ),
          ],
          takeaway:
            "Average speed is total distance over total time — never the mean of the two speeds. Convert to the same units first.",
        },
      );
    },
  },
  {
    key: "mech-projectile",
    base: 0.6,
    span: 2,
    build: ({ rng }) => {
      const u = rng.pick([10, 15, 20, 25, 30]);
      const theta = rng.pick([30, 45, 60]);
      const rad = (theta * Math.PI) / 180;
      const vx = u * Math.cos(rad);
      const vy = u * Math.sin(rad);
      const t = 2 * vy / 9.8;
      return numericQuestion(
        `A ball is projected at ${u} m s⁻¹ at an angle of ${theta}° above the horizontal. Ignoring air resistance, find the time taken to return to its launch height. Give your answer to 3 decimal places.`,
        t,
        {
          dp: 3,
          unit: "s",
          marks: 4,
          solution: [
            step("Resolve the velocity", `$u_y = ${u}\\sin ${theta}° = ${round(vy, 4)}$ m s⁻¹`),
            step(
              "Time to reach the top",
              `Vertical speed halves: $t = \\dfrac{u_y}{g} = ${round(vy / 9.8, 4)}$ s`,
            ),
            step("Double it for the return", `Total time = $2 \\times ${round(vy / 9.8, 4)} = ${round(t, 3)}$ s`),
            step("Reference", `The horizontal component stays constant at ${round(vx, 4)} m s⁻¹.`),
          ],
          takeaway:
            "The time of flight is independent of the horizontal component. Vertical and horizontal motion are independent.",
        },
      );
    },
  },
  {
    key: "mech-graph-interpretation",
    base: -0.4,
    span: 1.6,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "On a distance–time graph, what does a horizontal line mean?",
          correct: "The object is stationary — its distance is not changing.",
          wrong: [
            "The object is moving at a constant speed.",
            "The object is accelerating uniformly.",
            "The object is moving at twice its original speed.",
          ],
          why: "Gradient = 0 means no change in distance.",
        },
        {
          q: "On a velocity–time graph, what does the area under the line represent?",
          correct: "The distance travelled.",
          wrong: [
            "The final velocity.",
            "The acceleration.",
            "The time taken.",
          ],
          why: "Area under a v–t graph is displacement.",
        },
        {
          q: "On a velocity–time graph, what does the gradient represent?",
          correct: "The acceleration.",
          wrong: ["The distance travelled.", "The velocity.", "The deceleration only."],
          why: "Gradient = change in velocity ÷ change in time = acceleration.",
        },
        {
          q: "A v–t graph slopes downwards from a positive velocity. What is happening?",
          correct: "The object is decelerating while still moving forwards.",
          wrong: [
            "The object is moving backwards.",
            "The object is stationary.",
            "The object is accelerating forwards.",
          ],
          why: "A negative gradient is negative acceleration, not negative velocity.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 2,
        solution: [step("Recall the rules", "d–t: gradient = speed. v–t: gradient = acceleration, area = distance."), step("Apply", chosen.why)],
        takeaway: "Learn the four facts: d–t gradient = speed, v–t gradient = acceleration, v–t area = distance, steeper = faster.",
      });
    },
  },
];

registerGenerators(["em-m1"], kinematicsGenerators);

// --- em-m2 Forces and Newton's laws
const forcesGenerators: Generator[] = [
  {
    key: "forces-resultant",
    base: -1.3,
    span: 1.6,
    build: ({ rng }) => {
      const f1 = rng.int(2, 20);
      const f2 = rng.int(2, 20);
      const dir = rng.pick(["same", "opposite"] as const);
      const result = dir === "same" ? f1 + f2 : Math.abs(f1 - f2);
      return numericQuestion(
        dir === "same"
          ? `Two forces of ${f1} N and ${f2} N act in the same direction. Find the magnitude of the resultant force.`
          : `Two forces of ${f1} N and ${f2} N act in opposite directions. Find the magnitude of the resultant force.`,
        result,
        {
          dp: 1,
          unit: "N",
          marks: 2,
          solution: [
            step("Resultant of collinear forces", dir === "same" ? "Add them." : "Subtract: the larger minus the smaller."),
            step("Calculate", `$${dir === "same" ? `${f1} + ${f2}` : `${f1} - ${f2}`} = ${result}$ N`),
          ],
          takeaway:
            "Resultant of collinear forces: add when in the same direction, subtract when opposite. A resultant of zero means equilibrium.",
        },
      );
    },
  },
  {
    key: "forces-resolve",
    base: -0.4,
    span: 1.7,
    build: ({ rng }) => {
      const angle = rng.pick([30, 37, 45, 53, 60]);
      const force = rng.pick([10, 20, 40, 50, 80]);
      const rad = (angle * Math.PI) / 180;
      return numericQuestion(
        `A force of ${force} N acts at ${angle}° to the horizontal. Find the horizontal component of the force, to 3 decimal places.`,
        force * Math.cos(rad),
        {
          dp: 3,
          unit: "N",
          marks: 3,
          solution: [
            step("Choose the component", "Horizontal component = F cos θ where θ is measured from the horizontal."),
            step("Substitute", `$F_x = ${force}\\cos ${angle}°$`),
            step("Answer", `= ${round(force * Math.cos(rad), 3)} N`),
            step("For reference", `The vertical component is $${force}\\sin ${angle}° = ${round(force * Math.sin(rad), 3)}$ N.`),
          ],
          takeaway:
            "Resolve perpendicular to the axis you need. The angle must be measured from that axis, not the force.",
        },
      );
    },
  },
  {
    key: "forces-newtons-second-law",
    base: -1.0,
    span: 1.7,
    build: ({ rng }) => {
      const m = rng.pick([2, 3, 4, 5, 6, 8, 10]);
      const a = rng.pick([2, 3, 4, 5, 6, 9]);
      return numericQuestion(
        `A resultant force of ${m * a} N acts on a particle of mass ${m} kg. Find the acceleration of the particle.`,
        a,
        {
          dp: 2,
          unit: "m/s^2",
          marks: 1,
          solution: [
            step("Newton's second law", "$F = ma$"),
            step("Substitute", `$${m * a} = ${m} \\times a$`),
            step("Answer", `a = ${a} m s⁻²`),
          ],
          takeaway: "F = ma relates resultant force (not a single force) to mass and acceleration.",
        },
      );
    },
  },
  {
    key: "forces-friction",
    base: 0.2,
    span: 1.6,
    build: ({ rng }) => {
      const c = rng.pick([0.1, 0.2, 0.3, 0.4, 0.5]);
      const r = rng.pick([20, 40, 50, 80, 100]);
      return numericQuestion(
        `The coefficient of friction between a book and a desk is ${c}, and the normal reaction is ${r} N. Find the frictional force when the book just begins to slide.`,
        c * r,
        {
          dp: 2,
          unit: "N",
          marks: 3,
          solution: [
            step("Friction law", "$F = \\mu R$ where R is the normal reaction."),
            step("Substitute", `$F = ${c} \\times ${r}$`),
            step("Answer", `= ${round(c * r, 2)} N`),
          ],
          takeaway:
            "Friction is μR, not μN unless the two are the same. At terminal speed, friction equals the driving force.",
        },
      );
    },
  },
  {
    key: "forces-free-body-diagram",
    base: -0.6,
    span: 1.4,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "A book rests on a horizontal table. Which forces act on the book?",
          correct: "Weight downwards and the normal reaction upwards.",
          wrong: [
            "Weight downwards and a push from the table's surface downwards.",
            "Weight, normal reaction and friction.",
            "Normal reaction and weight only if the book is moving.",
          ],
          why: "Friction only acts when there is a tendency to slide; the book is not moving.",
        },
        {
          q: "A block slides down a smooth inclined plane. What is the acceleration down the plane?",
          correct: "g sin θ, where θ is the angle of the plane to the horizontal.",
          wrong: ["g cos θ", "g", "zero, because the plane is smooth"],
          why: "The component of weight along the plane is mg sin θ, and on a smooth plane that is the only force along it.",
        },
        {
          q: "A ball is thrown upwards. What is the acceleration at the top of its flight?",
          correct: "g downwards, the same as at every other point.",
          wrong: ["zero, because the velocity is zero", "zero, because it has stopped", "g upwards"],
          why: "Only gravity acts, so the acceleration is −g throughout the flight.",
        },
        {
          q: "An object moves at constant velocity. What can you conclude?",
          correct: "The resultant force is zero.",
          wrong: [
            "There are no forces acting.",
            "The acceleration is zero because the mass is zero.",
            "The object must be at rest.",
          ],
          why: "Zero acceleration means zero net force, but individual forces may still be large and balanced.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 3,
        solution: [
          step("Draw the free-body diagram", "Isolate the object, then list every force acting on it."),
          step("Apply", chosen.why),
          step("Key idea", "Only external forces on the chosen object count. Internal forces cancel."),
        ],
        takeaway:
          "Constant velocity means zero resultant force, not zero forces. Friction needs a tendency to slide.",
      });
    },
  },
];

registerGenerators(["em-m2"], forcesGenerators);

// --- em-m3 Moments and couples
const momentsGenerators: Generator[] = [
  {
    key: "moments-basic",
    base: -1.5,
    span: 1.6,
    build: ({ rng }) => {
      const f = rng.pick([2, 4, 5, 8, 10, 12, 20]);
      const d = rng.pick([0.2, 0.3, 0.4, 0.5, 0.8, 1.2, 1.5, 2]);
      return numericQuestion(
        `A force of ${f} N acts at a perpendicular distance of ${d} m from a pivot. Find the moment of the force about the pivot.`,
        f * d,
        {
          dp: 2,
          unit: "N*m",
          marks: 2,
          solution: [
            step("Moment formula", "$M = F \\times d$ with $d$ the **perpendicular** distance."),
            step("Substitute", `$M = ${f} \\times ${d}$`),
            step("Answer", `= ${round(f * d, 2)} N m`),
          ],
          takeaway:
            "The distance must be perpendicular to the force. Moment has units N m and is not a force.",
        },
      );
    },
  },
  {
    key: "moments-perpendicular-distance",
    base: 0.0,
    span: 1.8,
    build: ({ rng }) => {
      const f = rng.pick([10, 20, 25, 40]);
      const hyp = rng.pick([5, 10, 13, 15, 17, 20]);
      const angle = rng.pick([30, 37, 45, 53, 60]);
      const d = hyp * Math.sin((angle * Math.PI) / 180);
      return numericQuestion(
        `A force of ${f} N acts at the end of a rigid rod of length ${hyp} m. The rod makes an angle of ${angle}° with the direction of the force. Find the moment of the force about the end of the rod, to 3 decimal places.`,
        f * d,
        {
          dp: 3,
          unit: "N*m",
          marks: 4,
          solution: [
            step("Perpendicular distance", `$d = ${hyp}\\sin ${angle}° = ${round(d, 4)}$ m`),
            step("Moment", `$M = F \\times d = ${f} \\times ${round(d, 4)}$`),
            step("Answer", `= ${round(f * d, 3)} N m`),
          ],
          takeaway:
            "Moment = F × perpendicular distance. If you are given an oblique distance, resolve it with sine.",
        },
      );
    },
  },
  {
    key: "moments-equilibrium",
    base: 0.3,
    span: 1.8,
    build: ({ rng }) => {
      const beamW = rng.pick([20, 40, 50, 60, 80]);
      const load = rng.pick([10, 20, 30, 40]);
      const length = rng.pick([2, 2.5, 3, 4, 5]);
      const d = rng.pick([0.5, 1, 1.5, 2]);
      const reactionB = (beamW * (length / 2) + load * d) / length;
      return numericQuestion(
        `A uniform beam of weight ${beamW} N and length ${length} m rests horizontally on two supports, A at one end and B at the other. A load of ${load} N is placed at a distance of ${d} m from A. Find the vertical force exerted by support B.`,
        reactionB,
        {
          dp: 2,
          unit: "N",
          marks: 4,
          solution: [
            step(
              "Take moments about A (this removes the unknown reaction at A)",
              `$R_B \\times ${length} = ${beamW} \\times ${round(length / 2, 2)} + ${load} \\times ${d}$`,
            ),
            step("Substitute the numbers", `$R_B \\times ${length} = ${round(beamW * (length / 2), 2)} + ${round(load * d, 2)} = ${round(beamW * (length / 2) + load * d, 2)}$`),
            step("Solve", `$R_B = ${round(reactionB, 2)}$ N`),
            step("Check", `Total upward force = ${round(reactionB, 2)} + ${round(beamW + load - reactionB, 2)} = ${beamW + load} N, which balances the total weight.`),
          ],
          takeaway:
            "Taking moments about a support eliminates that support's reaction. Always check the total vertical force balances afterwards.",
        },
      );
    },
  },
  {
    key: "moments-centre-of-mass",
    base: 0.8,
    span: 1.8,
    build: ({ rng }) => {
      const m1 = rng.pick([2, 3, 4, 5]);
      const m2 = rng.pick([1, 2, 3, 6]);
      const d1 = rng.pick([0, 0.5, 1, 1.5, 2]);
      const d2 = rng.pick([3, 4, 5, 6]);
      const com = (m1 * d1 + m2 * d2) / (m1 + m2);
      return numericQuestion(
        `Two particles of mass ${m1} kg and ${m2} kg are placed on a straight line at ${d1} m and ${d2} m from the origin. Find the distance of the centre of mass from the origin, in metres.`,
        com,
        {
          dp: 3,
          unit: "m",
          marks: 3,
          solution: [
            step("Principle of moments", "$x = \\dfrac{\\sum m_i x_i}{\\sum m_i}$"),
            step("Substitute", `$\\dfrac{${m1}(${d1}) + ${m2}(${d2})}{${m1 + m2}}$`),
            step("Answer", `= ${round(com, 3)} m`),
          ],
          takeaway:
            "The centre of mass is mass-weighted, so it sits closer to the heavier mass. For a uniform lamina, area replaces mass.",
        },
      );
    },
  },
  {
    key: "moments-couple",
    base: -0.2,
    span: 1.5,
    build: ({ rng }) => {
      const f = rng.pick([10, 20, 30, 50]);
      const d = rng.pick([0.2, 0.4, 0.5, 0.8, 1]);
      return numericQuestion(
        `A couple consists of two equal and opposite forces of ${f} N, separated by a perpendicular distance of ${d} m. Find the magnitude of the couple.`,
        f * d,
        {
          dp: 2,
          unit: "N*m",
          marks: 2,
          solution: [
            step("Moment of a force", `M = F \\times d = ${f} \\times ${d} = ${round(f * d, 2)} N m`),
            step("Effect of the second force", "The second force produces an equal and opposite moment."),
            step("Net moment", "The two cancel for translation but the moments add."),
          ],
          takeaway:
            "A couple has zero resultant force but a non-zero moment, so it rotates without translating.",
        },
      );
    },
  },
];

registerGenerators(["em-m3"], momentsGenerators);

// --- em-m4 Work, energy and power
const energyGenerators: Generator[] = [
  {
    key: "energy-kinetic",
    base: -1.4,
    span: 1.6,
    build: ({ rng }) => {
      const m = rng.pick([2, 3, 4, 5, 6, 8, 10]);
      const v = rng.pick([2, 3, 4, 5, 6, 8, 10]);
      return numericQuestion(
        `A body of mass ${m} kg is moving at ${v} m s⁻¹. Find its kinetic energy in joules.`,
        0.5 * m * v * v,
        {
          dp: 2,
          unit: "J",
          marks: 2,
          solution: [
            step("Formula", "$E_k = \\tfrac{1}{2}mv^2$"),
            step("Substitute", `$E_k = \\frac{1}{2} \\times ${m} \\times ${v}^2$`),
            step("Answer", `= ${round(0.5 * m * v * v, 2)} J`),
          ],
          takeaway: "Kinetic energy depends on the SQUARE of the speed — doubling the speed quadruples E_k.",
        },
      );
    },
  },
  {
    key: "energy-gravitational",
    base: -1.2,
    span: 1.6,
    build: ({ rng }) => {
      const m = rng.pick([2, 3, 4, 5, 6, 10]);
      const h = rng.pick([2, 3, 4, 5, 6, 8, 10, 12]);
      const g = rng.pick([9.8, 10]);
      return numericQuestion(
        `A body of mass ${m} kg is lifted through a height of ${h} m. Taking $g = ${g}$ m s⁻², find the work done against gravity.`,
        m * g * h,
        {
          dp: 2,
          unit: "J",
          marks: 2,
          solution: [
            step("Formula", "$E_p = mgh$"),
            step("Substitute", `$E_p = ${m} \\times ${g} \\times ${h}$`),
            step("Answer", `= ${round(m * g * h, 2)} J`),
          ],
          takeaway: "Work done against gravity = mgh. Use the value of g given in the question, not a default.",
        },
      );
    },
  },
  {
    key: "energy-conservation",
    base: -0.4,
    span: 1.8,
    build: ({ rng }) => {
      const m = rng.pick([2, 3, 4, 5, 8]);
      const h = rng.pick([4, 5, 6, 8, 10, 12]);
      const g = rng.pick([9.8, 10]);
      const v = Math.sqrt(2 * g * h);
      return numericQuestion(
        `A body of mass ${m} kg is released from rest and falls through a height of ${h} m. Taking $g = ${g}$ m s⁻² and ignoring air resistance, find its speed when it reaches the bottom.`,
        v,
        {
          dp: 3,
          unit: "m/s",
          marks: 4,
          solution: [
            step("Conservation of energy", "Gravitational PE lost = kinetic energy gained."),
            step("Equation", `$mgh = \\tfrac{1}{2}mv^2$`),
            step("Cancel m and rearrange", `$v^2 = 2gh = 2 \\times ${g} \\times ${h} = ${round(2 * g * h, 2)}$`),
            step("Answer", `$v = ${round(v, 3)}$ m s⁻¹`),
          ],
          takeaway:
            "On a smooth surface, v² = 2gh regardless of mass — the mass cancels. With friction, some energy becomes heat.",
        },
      );
    },
  },
  {
    key: "energy-work-against-friction",
    base: 0.4,
    span: 1.7,
    build: ({ rng, tier }) => {
      const f = rng.pick([10, 20, 25, 40, 50]);
      const d = rng.pick([2, 4, 5, 8, 10, 12]);
      const m = rng.pick([2, 3, 4, 5, 10]);
      const h = rng.pick([2, 3, 4, 5]);
      const g = rng.pick([9.8, 10]);
      const againstGravity = m * g * h;
      const againstFriction = f * d;

      if (tier <= 3) {
        return numericQuestion(
          `A box of mass ${m} kg is pulled through ${d} m against a frictional force of ${f} N. Find the work done by the frictional force, in joules.`,
          againstFriction,
          {
            dp: 2,
            unit: "J",
            marks: 2,
            solution: [
              step("Work done by a force", "$W = F \\times d$"),
              step("Substitute", `$W = ${f} \\times ${d} = ${againstFriction}$ J`),
              step(
                "Sign",
                "Work done BY friction is negative, because friction opposes the motion. The magnitude is what is asked for here.",
              ),
            ],
            takeaway: "Work done = force × distance in the direction of motion.",
          },
        );
      }

      return numericQuestion(
        `A box of mass ${m} kg is pulled at constant speed through ${d} m against a frictional force of ${f} N, rising through a vertical height of ${h} m. Taking $g = ${g}$ m s⁻², find the total work done against the frictional force and gravity.`,
        againstGravity + againstFriction,
        {
          dp: 2,
          unit: "J",
          marks: 4,
          solution: [
            step(
              "Work done against gravity",
              `$mgh = ${m} \\times ${g} \\times ${h} = ${round(againstGravity, 2)}$ J`,
            ),
            step("Work done against friction", `$F d = ${f} \\times ${d} = ${againstFriction}$ J`),
            step(
              "Add them",
              `$${round(againstGravity, 2)} + ${againstFriction} = ${round(againstGravity + againstFriction, 2)}$ J`,
            ),
            step(
              "Why",
              "At constant speed the kinetic energy is unchanged, so the pulling force must supply exactly this much work.",
            ),
          ],
          takeaway:
            "At constant speed, work done by the pulling force = work against gravity + work against friction. The two contributions ADD.",
        },
      );
    },
  },
  {
    key: "energy-power",
    base: 0.6,
    span: 1.7,
    build: ({ rng }) => {
      const f = rng.pick([20, 40, 60, 80, 100]);
      const v = rng.pick([2, 3, 4, 5, 6, 8]);
      return numericQuestion(
        `A force of ${f} N moves an object at a constant speed of ${v} m s⁻¹. Find the power output.`,
        f * v,
        {
          dp: 2,
          unit: "W",
          marks: 2,
          solution: [
            step("Formula", "$P = Fv$ (a special case of P = W ÷ t)"),
            step("Substitute", `$P = ${f} \\times ${v}$`),
            step("Answer", `= ${f * v} W`),
          ],
          takeaway: "P = Fv is quicker than computing work then dividing by time. 1 kW = 1000 W.",
        },
      );
    },
  },
  {
    key: "energy-efficiency",
    base: 0.8,
    span: 1.6,
    build: ({ rng }) => {
      const useful = rng.pick([200, 300, 400, 500, 600, 800]);
      const input = useful / rng.pick([0.4, 0.5, 0.6, 0.75, 0.8]);
      const efficiency = (useful / input) * 100;
      return numericQuestion(
        `A machine takes in ${round(input, 1)} J of energy and produces ${useful} J of useful output energy. Calculate its efficiency as a percentage.`,
        efficiency,
        {
          dp: 1,
          unit: "%",
          marks: 2,
          solution: [
            step("Formula", "$\\text{Efficiency} = \\dfrac{\\text{useful output}}{\\text{input}} \\times 100\\%$"),
            step("Substitute", `$\\dfrac{${useful}}{${round(input, 1)}} \\times 100$`),
            step("Answer", `= ${round(efficiency, 1)}%`),
          ],
          takeaway:
            "Efficiency is always a fraction between 0 and 1 (or 0–100%). The remaining energy is wasted, usually as heat or sound.",
        },
      );
    },
  },
];

registerGenerators(["em-m4"], energyGenerators);

// --- em-m5 Momentum
const momentumGenerators: Generator[] = [
  {
    key: "momentum-conservation",
    base: -1.2,
    span: 1.7,
    build: ({ rng }) => {
      const m1 = rng.pick([1, 2, 3, 4]);
      const u1 = rng.pick([2, 3, 4, 5, 6]);
      const m2 = rng.pick([1, 2, 3, 4]);
      const commonV = (m1 * u1) / (m1 + m2);
      return numericQuestion(
        `A ${m1} kg trolley moving at ${u1} m s⁻¹ collides with a stationary ${m2} kg trolley and the two move off together. Find their common speed immediately after the collision, using conservation of momentum.`,
        commonV,
        {
          dp: 3,
          unit: "m/s",
          marks: 3,
          solution: [
            step("Momentum before", `$p = ${m1} \\times ${u1} + ${m2} \\times 0 = ${m1 * u1}$ kg m s⁻¹`),
            step("Momentum after", `$p = (${m1} + ${m2}) \\times v$`),
            step("Equate", `$${m1 * u1} = ${m1 + m2}v$`),
            step("Answer", `$v = \\dfrac{${m1 * u1}}{${m1 + m2}} = ${round(commonV, 3)}$ m s⁻¹`),
            step(
              "Sanity check",
              `A perfectly inelastic collision gives a common speed between 0 and ${u1} m s⁻¹, and ${round(commonV, 3)} is.`,
            ),
          ],
          takeaway:
            "Momentum is conserved in every collision provided the system is closed. Kinetic energy is only conserved if the collision is elastic.",
        },
      );
    },
  },
  {
    key: "momentum-impulse",
    base: -0.6,
    span: 1.7,
    build: ({ rng }) => {
      const f = rng.pick([100, 200, 300, 400, 500]);
      const t = rng.pick([0.02, 0.05, 0.1, 0.2, 0.5, 1]);
      return numericQuestion(
        `A constant force of ${f} N acts on a body for ${t} seconds. Find the impulse, in N s.`,
        f * t,
        {
          dp: 3,
          unit: "N*s",
          marks: 2,
          solution: [
            step("Impulse", "$J = F \\times t$ (the area under a force–time graph)"),
            step("Substitute", `$J = ${f} \\times ${t}$`),
            step("Answer", `= ${round(f * t, 3)} N s`),
          ],
          takeaway:
            "Impulse equals the area under a force–time graph. A large impulse over a short time gives a large force.",
        },
      );
    },
  },
  {
    key: "momentum-impulse-momentum",
    base: 0.2,
    span: 1.8,
    build: ({ rng }) => {
      const m = rng.pick([2, 3, 4, 5, 10]);
      const u = rng.pick([4, 6, 8, 10, 12, 15]);
      const v = rng.pick([1, 2, 3, 4]);
      return numericQuestion(
        `A body of mass ${m} kg travelling at ${u} m s⁻¹ slows down to ${v} m s⁻¹. Find the average force acting on it if the change takes 0.5 seconds.`,
        (m * (u - v)) / 0.5,
        {
          dp: 2,
          unit: "N",
          marks: 4,
          solution: [
            step("Impulse–momentum equation", "$F \\times t = m(v - u)$"),
            step("Change in momentum", `$\\Delta p = ${m}(${v} - ${u}) = ${m * (v - u)}$ kg m s⁻¹`),
            step("Solve for F", `$F = \\dfrac{${m * (v - u)}}{0.5} = ${round((m * (u - v)) / 0.5, 2)}$ N`),
          ],
          takeaway:
            "The impulse–momentum equation handles a force that varies over time — you only need the average.",
        },
      );
    },
  },
  {
    key: "momentum-elastic-inelastic",
    base: 0.8,
    span: 1.6,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "In a perfectly elastic collision, which statement is always true?",
          correct: "Both momentum and kinetic energy are conserved.",
          wrong: [
            "Only kinetic energy is conserved.",
            "Only momentum is conserved.",
            "The total energy is lost to heat.",
          ],
          why: "Elastic is the special case where no energy is lost.",
        },
        {
          q: "Two vehicles collide and move off stuck together. What kind of collision is this?",
          correct: "Inelastic — kinetic energy is not conserved (momentum still is).",
          wrong: [
            "Elastic, because momentum is conserved.",
            "Perfectly elastic, because no energy is lost.",
            "Neither, because momentum is not conserved.",
          ],
          why: "Sticking together always means kinetic energy is lost.",
        },
        {
          q: "A car is hit from behind. The car in front gains momentum. What happens to the car behind?",
          correct: "It loses an equal amount of momentum, in the opposite direction.",
          wrong: [
            "It also gains momentum, because it applied the force.",
            "Its momentum is unchanged.",
            "It gains twice as much momentum as the other car.",
          ],
          why: "Total momentum of the closed system is conserved.",
        },
        {
          q: "The coefficient of restitution e is 0. What does this mean?",
          correct: "The collision is perfectly inelastic — the bodies move off together with no relative separation.",
          wrong: [
            "The collision is perfectly elastic.",
            "No momentum is conserved.",
            "The bodies bounce back at the same speed.",
          ],
          why: "e = 0 gives zero relative speed after impact; e = 1 is perfectly elastic.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 3,
        solution: [
          step("Momentum is always conserved", "In a closed system, momentum is conserved in every collision."),
          step("Kinetic energy", chosen.why),
        ],
        takeaway: "e = 1 perfectly elastic, e = 0 perfectly inelastic. Real collisions sit between the two.",
      });
    },
  },
];

registerGenerators(["em-m5"], momentumGenerators);

// --- em-m6 Further dynamics
const dynamicsGenerators: Generator[] = [
  {
    key: "dynamics-shm-period",
    base: -0.8,
    span: 1.7,
    build: ({ rng }) => {
      const m = rng.pick([0.2, 0.5, 1, 2, 5]);
      const k = rng.pick([2, 5, 8, 10, 20]);
      const T = 2 * Math.PI * Math.sqrt(m / k);
      return numericQuestion(
        `A mass of ${m} kg is attached to a spring of stiffness ${k} N m⁻¹ and oscillates in simple harmonic motion. Find its period, to 3 decimal places.`,
        T,
        {
          dp: 3,
          unit: "s",
          marks: 3,
          solution: [
            step("SHM period formula", "$T = 2\\pi\\sqrt{\\dfrac{m}{k}}$"),
            step("Substitute", `$T = 2\\pi\\sqrt{\\dfrac{${m}}{${k}}} = 2\\pi\\sqrt{${round(m / k, 4)}}$`),
            step("Answer", `= ${round(T, 3)} s`),
            step("Check", `$\\omega = 2\\pi/T = ${round(2 * Math.PI / T, 4)}$ rad s⁻¹`),
          ],
          takeaway:
            "T = 2π√(m/k): a stiffer spring oscillates faster, a heavier mass oscillates more slowly.",
        },
      );
    },
  },
  {
    key: "dynamics-shm-velocity",
    base: 0.2,
    span: 1.8,
    build: ({ rng }) => {
      const amp = rng.pick([0.1, 0.2, 0.3, 0.5, 1, 2, 5]);
      const x = round(amp * rng.pick([0.2, 0.4, 0.6, 0.8]), 3);
      const w = rng.pick([2, 4, 5, 8, 10]);
      const v = w * Math.sqrt(amp * amp - x * x);
      return numericQuestion(
        `A particle performs simple harmonic motion with amplitude ${amp} m and angular frequency ${w} rad s⁻¹. Find its speed when its displacement from the equilibrium position is ${x} m, to 3 decimal places.`,
        v,
        {
          dp: 3,
          unit: "m/s",
          marks: 3,
          solution: [
            step("SHM relation", "$v^2 = \\omega^2(a^2 - x^2)$"),
            step("Substitute", `$v^2 = ${w}^2(${amp}^2 - ${x}^2) = ${round(w * w * (amp * amp - x * x), 4)}$`),
            step("Square root", `$v = ${round(v, 3)}$ m s⁻¹`),
            step("Check", `At $x = 0$ (equilibrium) the speed is at its maximum, $\\omega a = ${round(w * amp, 3)}$ m s⁻¹.`),
          ],
          takeaway:
            "Speed is maximum at the equilibrium position and zero at the extremes. Acceleration is the opposite of the displacement.",
        },
      );
    },
  },
  {
    key: "dynamics-circular-motion",
    base: 0.6,
    span: 1.7,
    build: ({ rng }) => {
      const v = rng.pick([2, 4, 5, 6, 8, 10]);
      const r = rng.pick([2, 3, 5, 10, 20]);
      return numericQuestion(
        `An object moves in a circle of radius ${r} m at a constant speed of ${v} m s⁻¹. Find its centripetal acceleration, to 3 decimal places.`,
        (v * v) / r,
        {
          dp: 3,
          unit: "m/s^2",
          marks: 2,
          solution: [
            step("Formula", "$a = \\dfrac{v^2}{r}$"),
            step("Substitute", `$a = \\dfrac{${v}^2}{${r}} = \\dfrac{${v * v}}{${r}}$`),
            step("Answer", `= ${round((v * v) / r, 3)} m s⁻²`),
            step("Direction", "It points towards the centre of the circle, not along the direction of travel."),
          ],
          takeaway:
            "Even at constant speed, circular motion has acceleration because the velocity direction is constantly changing.",
        },
      );
    },
  },
  {
    key: "dynamics-vertical-circle",
    base: 1.0,
    span: 1.7,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "A ball moves in a vertical circle on a string. At which point is the tension smallest?",
          correct: "At the top of the circle.",
          wrong: [
            "At the bottom of the circle.",
            "At the points on either side.",
            "The tension is constant throughout.",
          ],
          why: "At the top, tension and weight both point towards the centre and add together to give the smallest tension.",
        },
        {
          q: "What is the minimum speed a ball must have at the top of a vertical circle to stay in contact?",
          correct: "v ≥ √(gr), so that the tension can be zero.",
          wrong: [
            "v ≥ √(2gr), which is the condition for reaching the top at all.",
            "v ≥ gr.",
            "Any speed works, because tension adjusts automatically.",
          ],
          why: "At the top the centripetal force must be $mv^2/r$ but gravity alone supplies $mg$. Since the string can only pull, the condition is that gravity is enough on its own, i.e. $v^2/r \\geq g$, so $v \\geq \\sqrt{gr}$.",
        },
        {
          q: "In a vertical circle at the bottom of the path, what supplies the centripetal force?",
          correct: "The resultant of the tension and the weight (tension upwards, weight downwards).",
          wrong: [
            "The weight alone.",
            "The tension alone.",
            "The speed of the ball.",
          ],
          why: "At the bottom the centre is ABOVE the ball. The tension acts upwards, towards the centre; the weight acts downwards, AWAY from the centre. So the resultant is $T - mg$, which must equal $mv^2/r$.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 3,
        solution: [
          step("Always work towards the centre", "Draw the circle and mark where the centre is relative to the object."),
          step("Identify the forces", "At each point, decide which way each force acts relative to the centre."),
          step("Apply", chosen.why),
        ],
        takeaway:
          "At the top, forces add; at the bottom, they oppose. Losing contact needs v² < gr at the top.",
      });
    },
  },
  {
    key: "dynamics-damping",
    base: 0.0,
    span: 1.5,
    build: ({ rng }) => {
      const scenarios = [
        {
          q: "Why does a spring–mass system eventually stop oscillating?",
          correct: "Energy is transferred to the surroundings as heat and sound, damping the oscillation.",
          wrong: [
            "The restoring force runs out.",
            "Mass is converted into energy.",
            "Gravity increases over time.",
          ],
          why: "Damping removes energy from the system each cycle.",
        },
        {
          q: "What happens to the amplitude of a lightly damped oscillation?",
          correct: "It decreases exponentially, but the period stays approximately constant.",
          wrong: [
            "It decreases linearly and the period also decreases.",
            "It stays constant because energy is conserved.",
            "It increases as energy is transferred out.",
          ],
          why: "Light damping barely affects the period; only the amplitude decays.",
        },
      ];
      const chosen = rng.pick(scenarios);
      return choiceQuestion(chosen.q, chosen.correct, chosen.wrong, {
        rng,
        marks: 2,
        solution: [step("Energy in SHM", "Energy oscillates between kinetic and elastic potential."), step("Damping", chosen.why)],
        takeaway:
          "In light damping, amplitude decays exponentially while the period is almost unchanged. In heavy damping there is no oscillation at all.",
      });
    },
  },
];

registerGenerators(["em-m6"], dynamicsGenerators);







