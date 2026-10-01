import { registerGenerators } from "./registry";
import type { Generator, QuestionBody } from "./types";
import { choiceQuestion, numericQuestion, step } from "./types";
import { round } from "@/lib/math-utils";
import type { DiagramSpec } from "@/lib/types";

/*
  OCR A-level Computer Science H446.

  The distinctive part of this specification is section 2: pseudocode, trace
  tables, data structures, big-O and Boolean algebra. Those are the topics where
  a learner can read a question and still not know what to do, so most of these
  generators produce an executable-looking artefact the learner has to work
  through rather than a fact to recall.

  The trace-table generators are the highest-value ones and also the easiest to
  get wrong, so each one computes its own expected trace with a real
  interpreter-like walk rather than hard-coding an answer.
*/

// ------------------------------------------------------------------ helpers

function codeQuestion(
  prompt: string,
  code: string,
  answer: string,
  opts: {
    language?: string;
    marks?: number;
    solution: QuestionBody["solution"];
    takeaway: string;
    context?: string;
    diagram?: DiagramSpec;
  },
): QuestionBody {
  return {
    prompt,
    answer,
    marks: opts.marks ?? 2,
    format: { kind: "code", language: opts.language ?? "text" },
    solution: opts.solution,
    takeaway: opts.takeaway,
    context: opts.context,
    diagram: opts.diagram,
  };
}

// ============================================== 1.1 Structure and representation

const representationGenerators: Generator[] = [
  {
    key: "cs-binary-conversion",
    base: -0.7,
    span: 1.7,
    build: ({ rng, tier }) => {
      const value = tier <= 2 ? rng.int(2, 15) : rng.int(20, 250);
      const hex = value.toString(16).toUpperCase();
      const bits = value.toString(2).length;

      return choiceQuestion(
        `The decimal number **${value}** is written in hexadecimal. What is it?`,
        hex,
        [
          value.toString(16).toUpperCase().split("").reverse().join(""),
          (value + 1).toString(16).toUpperCase(),
          (value * 16).toString(16).toUpperCase(),
        ],
        {
          rng,
          marks: 2,
          solution: [
            step("Repeated division by 16", `Dividing ${value} by 16 repeatedly and reading the remainders upwards gives ${hex}.`),
            step("Check the width", `${value} needs ${bits} binary bits, i.e. ${Math.ceil(bits / 4)} hex digit${Math.ceil(bits / 4) === 1 ? "" : "s"}.`),
          ],
          takeaway: "One hex digit is exactly four bits, so hex is a compact way of writing binary.",
        },
      );
    },
  },
  {
    key: "cs-bounds-nibble",
    base: 0.0,
    span: 1.6,
    build: ({ rng, tier }) => {
      const bits = tier <= 2 ? rng.pick([4, 8]) : rng.pick([4, 8, 12, 16]);
      const unsignedMax = Math.pow(2, bits) - 1;
      const signedMin = -Math.pow(2, bits - 1);
      const inRange = rng.bool();
      const value = inRange
        ? rng.int(signedMin + 1, unsignedMax - 1)
        : unsignedMax + rng.int(1, 500);

      return choiceQuestion(
        `An integer is stored in **${bits}** bits in two's complement. Which of the following can be stored?`,
        String(value),
        [
          String(-Math.pow(2, bits)),
          String(Math.pow(2, bits)),
          String(-Math.pow(2, bits) - 1),
        ],
        {
          rng,
          marks: 3,
          solution: [
            step("Range in two's complement", `$${-Math.pow(2, bits - 1)}$ to $${unsignedMax - 1}$, that is ${signedMin} to ${unsignedMax - 1}.`),
            step("Test the option", `${value} ${value >= signedMin && value <= unsignedMax - 1 ? "falls inside" : "falls outside"} that range.`),
          ],
          takeaway:
            "n bits in two's complement gives $2^{n-1}$ values, from $-2^{n-1}$ to $2^{n-1}-1$. Check the sign of the upper bound.",
        },
      );
    },
  },
  {
    key: "cs-two-complement-negative",
    base: 0.2,
    span: 1.6,
    build: ({ rng }) => {
      const value = rng.int(5, 90);
      const bits = Math.max(4, Math.ceil(Math.log2(value + 1)));
      const unsigned = value + Math.pow(2, bits);
      const binary = unsigned.toString(2).padStart(bits, "0");

      return numericQuestion(
        `What is the decimal value of the ${bits}-bit two's complement number \\( ${binary}_2 \\)?`,
        -value,
        {
          marks: 3,
          solution: [
            step("Read the leading bit", `The leading 1 signals a negative number in two's complement.`),
            step(
              "Invert and add one",
              `Inverting every bit and adding one gives ${value}, so the stored value represents $-${value}$.`,
            ),
            step("Check the range", `${bits} bits in two's complement spans $-${Math.pow(2, bits - 1)}$ to ${Math.pow(2, bits - 1) - 1}, so $-${value}$ is representable.`),
          ],
          takeaway:
            "Two's complement negative numbers are found by inverting every bit and adding one. Sign-magnitude and one's complement both have a wasted pattern.",
        },
      );
    },
  },
  {
    key: "cs-units",
    base: -0.9,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        { u: "1 byte", b: 8, why: "A byte is 8 bits by definition." },
        { u: "1 KiB", b: 8 * 1024, why: "A kibibyte is 2^10 = 1024 bytes." },
        { u: "1 MiB", b: 8 * 1024 * 1024, why: "A mebibyte is 2^20 bytes." },
        { u: "1 nibble", b: 4, why: "A nibble is 4 bits, half a byte." },
      ];
      const item = rng.pick(items);
      return numericQuestion(
        `How many bits are there in ${item.u}?`,
        item.b,
        { marks: 2, solution: [step("Convert", item.why)], takeaway: "Binary units use powers of two: 1024, not 1000." },
      );
    },
  },
];

// ================================================== 1.2 Data types and structures

const dataTypeGenerators: Generator[] = [
  {
    key: "cs-real-range",
    base: -0.4,
    span: 1.6,
    build: ({ rng }) => {
      const kind = rng.pick([
        { t: "8-bit unsigned integer", min: 0, max: 255, bits: 8 },
        { t: "8-bit signed integer (two's complement)", min: -128, max: 127, bits: 8 },
        { t: "16-bit unsigned integer", min: 0, max: 65535, bits: 16 },
        { t: "16-bit signed integer (two's complement)", min: -32768, max: 32767, bits: 16 },
      ]);
      const inRange = rng.bool(0.6);
      const value = inRange
        ? rng.int(kind.min + 1, kind.max - 1)
        : kind.max + rng.int(1, 1000);

      return choiceQuestion(
        `Which of these values can be stored exactly in a ${kind.t}?`,
        String(value),
        [
          String(kind.min - 1),
          String(kind.max + 1),
          String(-kind.max - 1),
        ],
        {
          rng,
          marks: 2,
          solution: [
            step("Range", `$${kind.min}$ to $${kind.max}$.`),
            step(
              "Check",
              `${value} is ${inRange ? "inside" : "outside"} the range, so it ${inRange ? "can" : "cannot"} be stored.`,
            ),
          ],
          takeaway: "Unsigned doubles the positive range. Signed spends the top bit on the sign.",
        },
      );
    },
  },
  {
    key: "cs-real-encoding",
    base: 0.3,
    span: 1.7,
    build: ({ rng, tier }) => {
      const mantissa = rng.pick([23, 52, 10, 15]);
      const store = rng.pick([1, 2, 4, 8]);
      return choiceQuestion(
        `A floating point number is stored using **${mantissa}** bits of mantissa and **${store}** bit${store === 1 ? "" : "s"} of exponent. How many bits does the number occupy in total?`,
        String(mantissa + store),
        [
          String(mantissa * store),
          String(mantissa + store + 1),
          String(2 * (mantissa + store)),
        ],
        {
          rng,
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Add the fields", `Mantissa and exponent are stored in separate fields, so the total is ${mantissa} + ${store} = ${mantissa + store} bits.`),
            step("Note", "An explicit sign bit would add one more, but is optional in this scheme."),
          ],
          takeaway: "IEEE 754 single precision is 1 sign + 8 exponent + 23 mantissa = 32 bits.",
        },
      );
    },
  },
  {
    key: "cs-character-encoding",
    base: -0.3,
    span: 1.6,
    build: ({ rng }) => {
      const chars = rng.int(20, 200);
      const bitsPerChar = rng.pick([7, 8, 16]);
      return numericQuestion(
        `A message of **${chars}** characters is stored using an encoding that assigns **${bitsPerChar}** bits to each character. How many bytes does the message occupy?`,
        round((chars * bitsPerChar) / 8, 2),
        {
          marks: 3,
          solution: [
            step("Total bits", `${chars} \\times ${bitsPerChar} = ${chars * bitsPerChar} bits.`),
            step("Convert to bytes", `\\dfrac{${chars * bitsPerChar}}{8} = ${round((chars * bitsPerChar) / 8, 2)}$ bytes.`),
          ],
          takeaway:
            "Bit-packed encodings can waste bits. Seven-bit ASCII in bytes leaves a whole bit unused per character, which is why a packed encoding exists.",
        },
      );
    },
  },
  {
    key: "cs-bcd",
    base: 0.4,
    span: 1.7,
    build: ({ rng, tier }) => {
      const digits = rng.int(2, 6);
      const perDigit = 4;
      const bits = digits * perDigit;
      const bytes = round(bits / 8, 2);

      return numericQuestion(
        `A positive integer with **${digits}** decimal digits is stored using binary-coded decimal, with each digit in a nibble. How many bytes are needed?`,
        bytes,
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Nibbles per digit", "BCD uses 4 bits for each of the ten decimal digits."),
            step("Total bits", `${digits} \\times ${perDigit} = ${bits} bits.`),
            step("Bytes", `\\dfrac{${bits}}{8} = ${bytes}$ bytes.`),
          ],
          takeaway:
            "BCD wastes 6 of the 16 possible nibble values per digit, but makes decimal-to-binary conversion trivial.",
        },
      );
    },
  },
  {
    key: "cs-compression-ratio",
    base: 0.3,
    span: 1.7,
    build: ({ rng, tier }) => {
      const original = rng.int(4, 60) * 1024;
      const method = rng.pick(["lossless", "lossy"] as const);
      const ratio = method === "lossless" ? rng.pick([0.4, 0.5, 0.6, 0.75]) : rng.pick([0.05, 0.1, 0.2, 0.3]);
      const compressed = round(original * ratio, 0);

      return numericQuestion(
        `A ${round(original / 1024, 0)} KB image is stored with ${method} compression to **${compressed}** KB. What is the compression ratio?`,
        round(compressed / original, 3),
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Definition", "Compression ratio = compressed size ÷ original size."),
            step("Substitute", `\\dfrac{${compressed}}{${original}} = ${round(compressed / original, 3)}.`),
            step(
              "Type of compression",
              method === "lossless"
                ? "Lossless compression always allows the original to be perfectly reconstructed."
                : "Lossy compression discards data permanently, so the original cannot be recovered.",
            ),
          ],
          takeaway:
            "A ratio below 1 means compression worked. Lossless is reversible; lossy is not, and is only appropriate for media where that is acceptable.",
        },
      );
    },
  },
  {
    key: "cs-rle",
    base: 0.5,
    span: 1.8,
    build: ({ rng, tier }) => {
      // Build a run-length-encoded string, then ask for the encoded length.
      const symbols = ["A", "B", "C", "D"];
      const runs: Array<{ sym: string; n: number }> = [];
      let remaining = rng.int(8, 30);
      while (remaining > 0) {
        const sym = rng.pick(symbols);
        const n = Math.min(remaining, rng.int(1, 6));
        runs.push({ sym, n });
        remaining -= n;
      }
      const original = runs.reduce((s, r) => s + r.n, 0);
      // Each run costs a symbol plus a count nibble, so 2 characters.
      const encoded = runs.length * 2;

      return numericQuestion(
        `A monochrome image row is run-length encoded. The row consists of these runs in order: ${runs
          .map((r) => `${r.n} × ${r.sym}`)
          .join(", ")}. The encoding uses one character for the symbol and one for the count. How many characters does the encoded row occupy?`,
        encoded,
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Count the runs", `There are ${runs.length} separate runs.`),
            step("Cost per run", `Each run costs 2 characters, so ${runs.length} \\times 2 = ${encoded}$.`),
            step(
              "Compare",
              `The original was ${original} characters, so the ratio is ${round(encoded / original, 3)}.`,
            ),
          ],
          takeaway:
            "RLE compresses well on images with large flat areas and badly on noisy or photographic data, where the encoding can be larger than the original.",
        },
      );
    },
  },
];

// ================================================== 1.3 Compression and encryption

const securityGenerators: Generator[] = [
  {
    key: "cs-hash-purpose",
    base: -0.2,
    span: 1.5,
    build: ({ rng }) => {
      const uses = [
        { u: "Storing passwords so they cannot be read back", c: "Hashing with a salt", why: "A one-way hash means an attacker who gains access to the file still cannot recover the passwords." },
        { u: "Verifying that a downloaded file has not been altered", c: "A hash function", why: "Comparing the recomputed hash against the published one detects any change." },
        { u: "Keeping a message secret during transmission", c: "Symmetric encryption", why: "Only a shared key is needed, and confidentiality is what is required." },
        { u: "Proving who sent a message", c: "Asymmetric encryption or a digital signature", why: "Authenticity needs a private key that only the sender holds." },
      ];
      const item = rng.pick(uses);
      return choiceQuestion(item.u + ". What is the appropriate technique?", item.c, [
        "A reversible cipher using a key stored alongside the data",
        "Run-length encoding",
        "A checksum with no key",
      ], {
        rng,
        marks: 2,
        solution: [
          step("Identify the requirement", item.why),
          step(
            "Distinguish",
            "Hashing is one-way and gives integrity, not confidentiality. Encryption is reversible and gives confidentiality.",
          ),
        ],
        takeaway:
          "Hashing answers 'has this changed?'. Encryption answers 'can others read this?'. Conflating them is a common exam error.",
      });
    },
  },
  {
    key: "cs-symmetric-asymmetric",
    base: 0.1,
    span: 1.5,
    build: ({ rng, tier }) => {
      const people = rng.int(3, 9);
      const n = people;
      const symmetric = (n * (n - 1)) / 2;

      const items = [
        {
          q: `How many keys are needed for **${n}** people to exchange encrypted messages using asymmetric encryption?`,
          c: String(n * 2),
          wrong: [String(n), String(symmetric), "One shared key for everyone"],
          why: `Each person holds a public key and a matching private key, so ${n} × 2 = ${n * 2} keys in total.`,
          takeaway:
            "Asymmetric needs two keys per person, but only the pair counts, so distribution is manageable at any size.",
        },
        {
          q: `How many shared keys are needed for **${n}** people to exchange encrypted messages using symmetric encryption, so that every pair can read each other?`,
          c: String(symmetric),
          wrong: [String(n), String(n * 2), "One shared key for everyone"],
          why: `Every pair of people needs its own secret: n choose 2 = n(n−1)/2 = ${symmetric}.`,
          takeaway:
            "Symmetric encryption scales quadratically in the number of participants, which is exactly the problem asymmetric keys solve.",
        },
      ];

      if (tier >= 3) {
        const item = rng.pick(items);
        return choiceQuestion(item.q, item.c, item.wrong, {
          rng,
          marks: 3,
          solution: [step("Count the keys", item.why)],
          takeaway: item.takeaway,
        });
      }

      return choiceQuestion(
        "Why is asymmetric encryption used to establish a symmetric key in practice, rather than to encrypt all the data?",
        "Exchanging keys is the hard problem, and bulk encryption is far faster with a symmetric cipher",
        [
          "Asymmetric encryption is the only method that provides confidentiality",
          "Symmetric ciphers cannot be used on files larger than a kilobyte",
          "Asymmetric encryption guarantees delivery faster than symmetric encryption",
        ],
        {
          rng,
          marks: 3,
          solution: [
            step(
              "Why not asymmetric throughout",
              "Asymmetric algorithms are far slower and produce much larger ciphertext, so they are impractical for bulk data.",
            ),
            step(
              "The hybrid approach",
              "Asymmetric establishes a shared secret cheaply, then a fast symmetric cipher handles the payload.",
            ),
          ],
          takeaway: "Hybrid encryption is the standard design: slow asymmetric key exchange, fast symmetric bulk transfer.",
        },
      );
    },
  },
];

// ==================================================== 1.4 Data structures

const structureDataGenerators: Generator[] = [
  {
    key: "cs-array-index",
    base: -0.8,
    span: 1.4,
    build: ({ rng }) => {
      const lower = rng.int(0, 3);
      const upper = rng.int(8, 30);
      return numericQuestion(
        `An array is declared with lower bound **${lower}** and upper bound **${upper}**. How many elements does it hold?`,
        upper - lower + 1,
        {
          marks: 3,
          solution: [
            step("Count inclusively", `From ${lower} to ${upper} inclusive is ${upper} - ${lower} + 1 = ${upper - lower + 1}$ elements.`),
            step("Why the +1", "Because both bounds are valid indices, so one extra element exists beyond the difference."),
          ],
          takeaway:
            "The formula upper − lower + 1 catches out almost everyone. Two-bound arrays also allow a computed address: base + (i − lower) × size.",
        },
      );
    },
  },
  {
    key: "cs-binary-search-steps",
    base: 0.2,
    span: 1.7,
    build: ({ rng, tier }) => {
      const n = rng.pick([16, 32, 64, 128, 256]);
      const worst = Math.ceil(Math.log2(n + 1));
      return numericQuestion(
        `What is the worst-case number of comparisons needed to find a value in a sorted array of **${n}** elements using binary search?`,
        worst,
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Halving", "Each comparison halves the search space."),
            step("Iterate", `$\\lceil \\log_2(${n} + 1) \\rceil = ${worst}$.`),
            step(
              "Order of growth",
              "This is $O(\\log n)$, so a large array is dramatically faster than a linear search.",
            ),
          ],
          takeaway: "Binary search requires sorted data. Unsorted, it gives no advantage at all.",
        },
      );
    },
  },
  {
    key: "cs-queue-stack-behaviour",
    base: -0.4,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        { c: "a printer spool", w: "A queue, because jobs must be output in the order they arrived" },
        { c: "undo functionality in an editor", w: "A stack, because the most recent action is undone first" },
        { c: "a call stack for function calls", w: "A stack, because a function must complete before the one that called it" },
        { c: "breadth-first search of a graph", w: "A queue, because it explores nodes in order of distance from the start" },
        { c: "evaluating a mathematical expression written in prefix notation", w: "A stack, because the most recent operator is applied first" },
      ];
      const item = rng.pick(items);
      return choiceQuestion(`Which data structure is the natural choice for ${item.c}, and why?`, item.w, [
        "A stack, because it is the most memory efficient",
        "A queue, because it supports searching",
        "Neither, because a linked list cannot store this data",
      ], {
        rng,
        marks: 2,
        solution: [
          step("Decide the access order", item.w),
          step("Contrast", "A queue is first in, first out. A stack is last in, first out."),
        ],
        takeaway: "LIFO means stack, FIFO means queue. Match the order the problem actually requires.",
      });
    },
  },
  {
    key: "cs-traversal-order",
    base: 0.3,
    span: 1.7,
    build: ({ rng }) => {
      const tree = rng.pick([
        { root: 8, left: 3, right: 10, inorder: "3, 8, 10", preorder: "8, 3, 10", postorder: "3, 10, 8" },
        { root: 5, left: 2, right: 7, inorder: "2, 5, 7", preorder: "5, 2, 7", postorder: "2, 7, 5" },
        { root: 20, left: 15, right: 30, inorder: "15, 20, 30", preorder: "20, 15, 30", postorder: "15, 30, 20" },
      ]);
      const askInorder = rng.bool();
      const correct = askInorder ? tree.inorder : tree.preorder;
      const name = askInorder ? "in-order" : "pre-order";

      return choiceQuestion(
        `A binary tree search has root **${tree.root}**, left child **${tree.left}** and right child **${tree.right}**, each leaf having no children. Which sequence is the ${name} traversal?`,
        correct,
        [
          askInorder ? tree.preorder : tree.inorder,
          tree.postorder,
          `${tree.left}, ${tree.right}, ${tree.root}`,
        ].filter((x) => x !== correct),
        {
          rng,
          marks: 3,
          solution: [
            step("Recall the rule", `In ${name} traversal, visit ${askInorder ? "left subtree, then the node, then the right subtree" : "the node, then the left subtree, then the right subtree"}.`),
            step("Apply", `Root ${tree.root} with children ${tree.left} and ${tree.right} gives ${correct}.`),
          ],
          takeaway:
            "In-order on a binary search tree gives the values in ascending order, which is why it is the useful one for a BST.",
        },
      );
    },
  },
];

// ============================================== 1.5 Legal, ethical and environmental

const ethicalGenerators: Generator[] = [
  {
    key: "cs-data-protection",
    base: -0.3,
    span: 1.4,
    build: ({ rng }) => {
      const scenarios = [
        { s: "A supermarket links loyalty card data to medical records to target advertising for weight-loss products.", i: "Purpose limitation", why: "The data was collected for a different purpose than it is being used for." },
        { s: "An NHS trust is breached by ransomware and patient records are encrypted by the attackers.", i: "Confidentiality", why: "Patient data has been made available to unauthorised people." },
        { s: "An app requests access to the user's entire contact list to provide a single autofill feature.", i: "Data minimisation", why: "It collects far more than it needs for the stated purpose." },
        { s: "A facial recognition system is installed in a public square without any consultation or legal basis.", i: "Privacy", why: "People cannot meaningfully consent to being identified in a public space." },
      ];
      const item = rng.pick(scenarios);
      return choiceQuestion(item.s, item.i, ["Integrity", "Availability", "Authenticity"], {
        rng,
        marks: 3,
        solution: [
          step("Name the principle", item.why),
          step(
            "Distinguish",
            "Confidentiality is about disclosure, integrity about unauthorised alteration, availability about access.",
          ),
        ],
        takeaway: "UK GDPR is built on purpose limitation, data minimisation, accuracy, storage limitation and security.",
      });
    },
  },
  {
    key: "cs-bytes-bits-budget",
    base: -0.5,
    span: 1.6,
    build: ({ rng }) => {
      // A character encoding calculation, which is the sort of thing section 1.2
      // asks for and which OCR marks numerically.
      const symbols = rng.pick([26, 32, 64, 95, 128, 256, 1000]);
      const chars = rng.int(100, 5000);
      const bitsPerChar = Math.ceil(Math.log2(symbols));
      const totalBits = chars * bitsPerChar;
      const bytes = totalBits / 8;

      return numericQuestion(
        `An encoding must represent **${symbols}** different symbols, so it uses a fixed number of bits per character. A message of **${chars}** characters is stored. How many bytes does it occupy?`,
        bytes,
        {
          marks: 3,
          solution: [
            step(
              "Bits per character",
              `To represent ${symbols} symbols you need $\\lceil \\log_2 ${symbols} \\rceil = ${bitsPerChar}$ bits, because $2^{${bitsPerChar - 1}} < ${symbols} \\le 2^{${bitsPerChar}}$.`,
            ),
            step("Total bits", `${chars} \\times ${bitsPerChar} = ${totalBits} bits.`),
            step("Bytes", `$\\dfrac{${totalBits}}{8} = ${bytes}$ bytes.`),
            step(
              "Wastage",
              symbols === 26
                ? "Six-bit characters waste two bits per character, so 26 letters in bytes is inefficient. That is why teletext used 6-bit characters packed together."
                : "Check whether the bits per character divide into 8. If not, the storage is padded and some capacity is wasted.",
            ),
          ],
          takeaway:
            "The bit width is set by the size of the alphabet, not by the message. Work out the width first, then multiply up.",
        },
      );
    },
  },
  {
    key: "cs-environmental",
    base: -0.5,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        { q: "Which change reduces the environmental impact of a data centre most directly?", c: "Improving the PUE so a higher proportion of the power goes to computing rather than cooling", why: "PUE is total facility energy divided by IT equipment energy, so lowering it cuts overhead directly." },
        { q: "A company is considering moving its data processing to a region powered mainly by renewables. What is the main environmental benefit?", c: "Lower operational carbon emissions, though the embodied cost of new hardware remains", why: "Power is the dominant ongoing cost of computing; hardware impact is a one-off." },
        { q: "Why does data compression sometimes reduce environmental impact beyond saving storage?", c: "Less data to transmit and store means less energy consumed per operation", why: "The energy cost of moving and spinning data is significant in large systems." },
      ];
      const item = rng.pick(items);
      return choiceQuestion(item.q, item.c, [
        "It increases the available processing power at no cost",
        "It guarantees the data centre becomes carbon neutral",
        "It reduces the need for encryption",
      ], {
        rng,
        marks: 3,
        solution: [step("Reason", item.why)],
          takeaway: "PUE is the standard measure, and power consumption dominates a data centre's footprint.",
      });
    },
  },
  {
    key: "cs-ethical-data-use",
    base: -0.1,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          q: "A social network sells users' browsing histories to an advertising firm without asking. Which principle is breached?",
          c: "Consent and purpose limitation",
          why: "Data collected for one purpose is being reused for another, and the users were not asked.",
        },
        {
          q: "A bank discards a customer record after six months, deleting the name but keeping the transaction history. What is the concern?",
          c: "The data is not properly anonymised, because the transactions could still identify the person",
          why: "Simply deleting a name rarely makes data anonymous; pseudonymised data is still personal data.",
        },
        {
          q: "An AI recruitment tool is trained on ten years of past hiring data that mostly reflects male applicants. What is the main ethical risk?",
          c: "Algorithmic bias, because the model reproduces historic discrimination at scale",
          why: "Training on past decisions encodes their biases unless they are actively corrected.",
        },
        {
          q: "A government proposes compulsory data retention for all internet traffic. Which argument against it is strongest?",
          c: "It is disproportionate and risks chilling lawful expression",
          why: "Blanket retention of all traffic is a heavy-handed tool applied without regard to individual cases.",
        },
      ];
      const item = rng.pick(items);
      return choiceQuestion(item.q, item.c, [
        "Data accuracy, because the records may contain errors",
        "Availability, because the data may be offline too often",
        "Integrity, because the data could be altered",
      ], {
        rng,
        marks: 3,
        solution: [
          step("Identify the concern", item.why),
          step(
            "Name the principle",
            "UK GDPR requires a lawful basis, purpose limitation, data minimisation, accuracy and security.",
          ),
        ],
        takeaway:
          "Legal and ethical questions are distinguished by asking whether something is merely harmful or whether it breaches a specific principle.",
      });
    },
  },
];

// ================================================= 2.1 Algorithmic thinking

const algorithmicGenerators: Generator[] = [
  {
    key: "cs-big-o-merge-sort",
    base: 0.4,
    span: 1.8,
    build: ({ rng, tier }) => {
      const n = rng.pick([32, 64, 128, 256, 512, 1024]);
      const k = Math.round(Math.log2(n));
      return numericQuestion(
        `Merge sort on an array of **${n}** elements. Approximately how many comparisons are performed in the worst case?`,
        round(n * k - n + 1, 0),
        {
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step("Each merge", "Merging two sorted halves of total size m takes at most m − 1 comparisons."),
            step("Number of levels", `$\\log_2(${n}) = ${k}$ levels of merging.`),
            step("Total", `$\\sum_{i=1}^{${k}} \\dfrac{${n}}{2^i} \\times \\left(\\dfrac{${n}}{2^i} - 1\\right) \\approx ${n} \\times ${k} - ${n} + 1 = ${round(n * k - n + 1, 0)}$.`),
            step("Order", "That is $O(n \\log n)$."),
          ],
          takeaway:
            "$O(n \\log n)$ comes from $\\log n$ levels, each touching every element once. Quicksort shares this average case but merge sort guarantees it.",
        },
      );
    },
  },
  {
    key: "cs-linear-search-comparisons",
    base: -0.6,
    span: 1.5,
    build: ({ rng }) => {
      const n = rng.int(10, 500);
      const position = rng.int(1, n);
      return numericQuestion(
        `A linear search looks for a value in a list of **${n}** items. The value is the **${position}** item in the list. How many comparisons are made in the best case?`,
        position,
        {
          marks: 2,
          solution: [
            step("Worst case", `The target is last, so ${n} comparisons.`),
            step("Best case", "The target is first, so exactly 1 comparison."),
            step("Given position", `The target is item ${position}, so ${position} comparisons are made.`),
          ],
          takeaway:
            "Binary search would need about $\\log_2 n$ comparisons regardless, but only on sorted data.",
        },
      );
    },
  },
  {
    key: "cs-pseudocode-trace-loop",
    base: 0.5,
    span: 2.0,
    build: ({ rng, tier }) => {
      const start = rng.int(1, 4);
      const add = rng.int(2, 9);
      const times = rng.int(4, 9);
      let total = 0;
      for (let i = 0; i < times; i++) total += start + i * add;

      return numericQuestion(
        `The following pseudocode is executed. What is the value of \`total\` at the end?\n\n\`\`\`\ntotal ← 0\nFOR i ← 0 TO ${times - 1}\n    total ← total + (${start} + i × ${add})\nNEXT i\n\`\`\``,
        total,
        {
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step("Build a trace table", `Each iteration adds ${start} + i×${add}, giving ${Array.from({ length: times }, (_, i) => start + i * add).join(", ")}.`),
            step("Add them", `${Array.from({ length: times }, (_, i) => start + i * add).reduce((a, b) => a + b, 0)}.`),
            step(
              "Alternatively",
              "This is an arithmetic series, so $\\dfrac{${times}}{2}(2\\times${start} + (${times}-1)\\times${add})$, giving the same total.",
            ),
          ],
          takeaway:
            "Recognising an arithmetic series turns a loop that looks like it needs ${times} steps into one formula. Examiners accept either route.",
        },
      );
    },
  },
  {
    key: "cs-pseudocode-trace-accumulator",
    base: 0.3,
    span: 1.8,
    build: ({ rng, tier }) => {
      const n = rng.int(4, 12);
      const limit = rng.int(3, 9);
      const matched: number[] = [];
      for (let i = 1; i <= n; i++) if (i % limit === 0) matched.push(i);

      return numericQuestion(
        `The following pseudocode is executed. How many values are written to the array \`found\`?\n\n\`\`\`\nn ← ${n}\nlimit ← ${limit}\nfound ← []\nFOR i ← 1 TO n\n    IF i MOD limit = 0 THEN\n        APPEND i TO found\n    ENDIF\nNEXT i\n\`\`\``,
        matched.length,
        {
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step("Work out the condition", `i MOD ${limit} = 0 when i is a multiple of ${limit}.`),
            step(
              "List the matches",
              `Between 1 and ${n} those are ${matched.join(", ")} or "none", so ${matched.length} value${matched.length === 1 ? " is" : "s are"} appended.`,
            ),
          ],
          takeaway:
            "Counting trace questions are usually an arithmetic problem in disguise. Identify the pattern before drawing a table.",
        },
      );
    },
  },
  {
    key: "cs-swap-trace",
    base: 0.2,
    span: 1.7,
    build: ({ rng }) => {
      const a0 = rng.int(1, 20);
      const b0 = rng.int(21, 40);
      return codeQuestion(
        `After the following pseudocode runs, what are \`x\` and \`y\`?\n\n\`\`\`\nx ← ${a0}\ny ← ${b0}\ntemp ← x\nx ← y\ny ← temp\n\`\`\``,
        `x = ${b0}, y = ${a0}`,
        `pseudocode`,
        {
          marks: 2,
          solution: [
            step("Trace", `temp ← ${a0}, then x ← ${b0}, then y ← ${a0}.`),
            step("Result", `x = ${b0} and y = ${a0}.`),
            step(
              "If it fails",
              "Assigning x ← y before saving the old x would lose ${a0} permanently. The temp variable is what makes the swap safe.",
            ),
          ],
          takeaway: "Swapping needs a temporary. This is the most common pseudocode bug in exams.",
        },
      );
    },
  },
  {
    key: "cs-boolean-algebra",
    base: 0.6,
    span: 1.9,
    build: ({ rng, tier }) => {
      const a = rng.bool();
      const b = rng.bool();
      const c = rng.bool();
      const expr = rng.pick([
        { text: "(A AND B) OR (A AND C)", fn: (x: boolean, y: boolean, z: boolean) => (x && y) || (x && z) },
        { text: "A AND (B OR C)", fn: (x: boolean, y: boolean, z: boolean) => x && (y || z) },
        { text: "(A OR B) AND (B OR C)", fn: (x: boolean, y: boolean, z: boolean) => (x || y) && (y || z) },
        { text: "NOT(A) AND NOT(B) AND C", fn: (x: boolean, y: boolean, z: boolean) => !x && !y && z },
      ]);
      const value = expr.fn(a, b, c);
      const simplify = rng.pick([
        { q: "Which simplification is valid?", correct: "A AND (B OR C)", why: "Distributing A over the OR gives (A AND B) OR (A AND C).", wrong: "A OR (B AND C)" },
        { q: "Apply De Morgan's law to NOT(A OR B).", correct: "NOT A AND NOT B", why: "De Morgan negates each term and flips the operator.", wrong: "NOT A OR NOT B" },
        { q: "Which is the complement of A OR B?", correct: "NOT A AND NOT B", why: "De Morgan's law in reverse.", wrong: "NOT A OR NOT B" },
      ]);

      if (tier >= 3 && simplify) {
        return choiceQuestion(simplify.q, simplify.correct, [simplify.wrong, "A AND NOT B", "A OR NOT C"], {
          rng,
          marks: 3,
          solution: [
            step("Rule", simplify.why),
            step("Check", "Both forms give the same truth value for every combination of inputs."),
          ],
          takeaway:
            "Distributivity, associativity, commutativity, idempotency and De Morgan's law are the five simplifications worth knowing cold.",
        });
      }

      return choiceQuestion(
        `Evaluate \`${expr.text}\` when A is **${a ? "true" : "false"}**, B is **${b ? "true" : "false"}** and C is **${c ? "true" : "false"}**.`,
        value ? "True" : "False",
        [value ? "False" : "True", "Cannot be determined", "True only if all three are true"],
        {
          rng,
          marks: 2,
          solution: [
            step("Substitute", `A = ${a}, B = ${b}, C = ${c}.`),
            step("Evaluate innermost first", `\`${expr.text}\` evaluates to ${value ? "True" : "False"}.`),
          ],
          takeaway: "Brackets dictate order. Evaluate the innermost bracket first and work outwards.",
        },
      );
    },
  },
  {
    key: "cs-logic-gate-count",
    base: 0.5,
    span: 1.8,
    build: ({ rng, tier }) => {
      const n = rng.pick([2, 3, 4]);
      return numericQuestion(
        `A system needs to distinguish **${n}** different inputs, each ${n}-bit. How many bits of output are needed to encode which input occurred?`,
        Math.ceil(Math.log2(n)),
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Requirement", "With $b$ output bits you can distinguish $2^b$ cases."),
            step("Solve", `$\\lceil \\log_2 ${n} \\rceil = ${Math.ceil(Math.log2(n))}$.`),
          ],
          takeaway: "A decoder for n inputs needs $\\lceil \\log_2 n \\rceil$ outputs, and 2^n − 1 AND gates in its canonical form.",
        },
      );
    },
  },
];

// ======================================================= 2.2 Programming techniques

const programmingGenerators: Generator[] = [
  {
    key: "cs-recursion-fibonacci",
    base: 0.2,
    span: 1.7,
    build: ({ rng, tier }) => {
      const n = rng.pick([8, 10, 12, 15, 18, 20]);

      // Count calls for naive fib recursively, derived not recalled.
      const memo = new Map<number, number>();
      const calls = (k: number): number => {
        if (k < 2) return 1;
        const cached = memo.get(k);
        if (cached !== undefined) return cached;
        const total = 1 + calls(k - 1) + calls(k - 2);
        memo.set(k, total);
        return total;
      };
      const value = calls(n);

      return numericQuestion(
        `A naive recursive \`fib(n)\` defined as \`fib(n) = fib(n-1) + fib(n-2)\` with \`fib(0)=fib(1)=1\`. For \`fib(${n})\`, how many times is \`fib\` invoked in total, counting the initial call?`,
        value,
        {
          marks: tier >= 4 ? 4 : 3,
          solution: [
            step("Set up the recurrence", "$C(n) = 1 + C(n-1) + C(n-2)$ with $C(0) = C(1) = 1$."),
            step("Build the table", `Working up to n = ${n} gives $C(${n}) = ${value}$.`),
            step(
              "Why it matters",
              "The growth is exponential, so $O(2^n)$, and the same value is recomputed over and over. Memoisation reduces this to $O(n)$.",
            ),
          ],
          takeaway:
            "Naive recursion is $O(2^n)$ because each call spawns two more. Memoisation or an iterative version makes it $O(n)$.",
        },
      );
    },
  },
  {
    key: "cs-loop-count",
    base: -0.7,
    span: 1.5,
    build: ({ rng }) => {
      const start = rng.int(0, 5);
      const end = rng.int(10, 30);
      const increment = rng.int(1, 4);
      let count = 0;
      for (let i = start; i <= end; i += increment) count++;

      const visited = Array.from({ length: count }, (_, k) => start + k * increment);

      return numericQuestion(
        `How many times does the body of this loop execute?\n\n\`\`\`\nFOR i ← ${start} TO ${end} STEP ${increment}\n    OUTPUT i\nNEXT i\n\`\`\``,
        count,
        {
          marks: 3,
          solution: [
            step(
              "Count the values",
              `The loop visits i = ${visited.slice(0, 6).join(", ")}${
                visited.length > 6 ? ", ..." : ""
              }, which is ${count} value${count === 1 ? "" : "s"}.`,
            ),
            step(
              "Formula",
              `$\\left\\lfloor \\dfrac{${end} - ${start}}{${increment}} \\right\\rfloor + 1 = ${count}$.`,
            ),
          ],
          takeaway:
            "The +1 matters whenever the range is an exact multiple of the step. Forgetting it loses a mark.",
        },
      );
    },
  },
  {
    key: "cs-bubble-passes",
    base: 0.0,
    span: 1.7,
    build: ({ rng }) => {
      const n = rng.int(4, 20);
      const worst = n - 1;
      return numericQuestion(
        `A bubble sort of **${n}** items is implemented with an inner loop that always makes one fewer comparison per pass. What is the total number of comparisons in the worst case?`,
        round((n * (n - 1)) / 2, 0),
        {
          marks: 3,
          solution: [
            step("Comparisons per pass", `Pass 1 makes ${n - 1}, pass 2 makes ${n - 2}, and so on.`),
            step("Sum", `$\\dfrac{${n}(${n} - 1)}{2} = ${round((n * (n - 1)) / 2, 0)}$.`),
            step("Order", "Bubble sort is $O(n^2)$ in the worst case."),
          ],
          takeaway: `The $n-1$ maximum passes is why the final sorted element is already in place after pass ${worst}.`,
        },
      );
    },
  },
  {
    key: "cs-sort-order",
    base: -0.4,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        { q: "Which sort would you use to sort a very large file already stored on disk, where memory is the constraint?", c: "Merge sort", why: "Merge sort reads and writes in sequential runs, so it suits tape and disk better than quicksort's random access." },
        { q: "Which sort is generally fastest in practice on an in-memory array, and why?", c: "Quicksort, because it has good cache locality and a small constant factor", why: "Despite its $O(n^2)$ worst case, average $O(n \\log n)$ with excellent locality makes it fast in practice." },
        { q: "Why does insertion sort perform well on an almost-sorted array?", c: "Each element only has to move past a few others, giving close to $O(n)$", why: "Insertion sort's work is proportional to the number of inversions, which is small for nearly sorted data." },
      ];
      const item = rng.pick(items);
      return choiceQuestion(item.q, item.c, ["Bubble sort", "Selection sort", "Counting sort"], {
        rng,
        marks: 3,
        solution: [step("Reason", item.why)],
        takeaway: "Choosing the right sort for the data distribution matters as much as the average-case complexity.",
      });
    },
  },
  {
    key: "cs-two-dimensional-index",
    base: -0.3,
    span: 1.5,
    build: ({ rng }) => {
      const rows = rng.int(2, 9);
      const cols = rng.int(2, 9);
      const r = rng.int(0, rows - 1);
      const c = rng.int(0, cols - 1);
      return numericQuestion(
        `A two-dimensional array has **${rows}** rows and **${cols}** columns, both zero-indexed, stored in row-major order. What is the one-dimensional index of element \`[${r}][${c}]\`?`,
        r * cols + c,
        {
          marks: 3,
          solution: [
            step("Row-major rule", "Each row occupies a contiguous block of `cols` elements."),
            step("Compute", `index = row × cols + column = ${r} × ${cols} + ${c} = ${r * cols + c}.`),
            step(
              "Contrast",
              "Column-major, as used by Fortran and by some image formats, uses `col × rows + row` instead.",
            ),
          ],
          takeaway: "Row-major means rows are contiguous, so stepping along a row is a stride of 1.",
        },
      );
    },
  },
  {
    key: "cs-stack-depth",
    base: 0.4,
    span: 1.8,
    build: ({ rng, tier }) => {
      const n = rng.int(3, 12);
      return numericQuestion(
        `A recursive function \`f(n)\` is defined as: if \`n <= 1\` return 1, otherwise return \`f(n-1) + f(n-2)\` with the first argument reduced by 1 each call. What is the maximum depth of recursion when called as \`f(${n})\`?`,
        n,
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Follow one path", "Following the f(n−1) branch repeatedly gives f(n−1), f(n−2), and so on down to the base case."),
            step("Count", `There are ${n} nested calls before reaching the base case, so the stack depth is ${n}.`),
            step(
              "Consequence",
              "Deep recursion can exhaust the call stack, which is why an iterative version is often preferred.",
            ),
          ],
          takeaway: "Recursion depth grows with n, and each frame carries overhead. That is why iterative is preferred for large inputs.",
        },
      );
    },
  },
];

// ============================================== 2.3 Programming paradigms

const paradigmGenerators: Generator[] = [
  {
    key: "cs-paradigm-fit",
    base: -0.3,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        { s: "Processing a list of transactions, applying a rule to each one independently", p: "Functional programming, because it uses map, filter and reduce over immutable collections", why: "Each item is transformed without mutating shared state." },
        { s: "Modelling a bank account where a withdrawal must also adjust an available-balance field", p: "Object-oriented programming, because encapsulated objects keep the two values consistent", why: "The method owns the invariant; no other object can put it out of step." },
        { s: "Solving a maze where each path branches and the best route is not known in advance", p: "Imperative or object-oriented programming, using a search with a stack or queue", why: "The control flow is naturally stateful and exploratory." },
        { s: "Computing a fold over a large dataset with no side effects, possibly in parallel", p: "Functional programming, because referential transparency makes parallel evaluation safe", why: "Pure functions have no shared mutable state to race on." },
      ];
      const item = rng.pick(items);
      return choiceQuestion(item.s + ". Which paradigm is most appropriate?", item.p, [
        "Functional programming, because it always runs fastest",
        "Object-oriented programming, because it uses more memory",
        "Procedural programming, because it avoids procedures",
      ], {
        rng,
        marks: 3,
        solution: [step("Justify", item.why)],
        takeaway:
          "Paradigm choice follows the shape of the problem: transformations favour functional, shared mutable state favours objects.",
      });
    },
  },
  {
    key: "cs-object-oriented-feature",
    base: -0.5,
    span: 1.4,
    build: ({ rng }) => {
      const features = [
        { f: "Hiding the internal list so it can only be changed through a supplied method", c: "Encapsulation", why: "The class controls how its data changes, protecting the invariant." },
        { f: "A subclass overriding the discount method of a parent order class", c: "Inheritance with polymorphism", why: "The subclass provides a different implementation of an inherited interface." },
        { f: "Keeping order lines inside an order so lines cannot exist on their own", c: "Composition", why: "The part's lifetime is bound to the whole's." },
        { f: "Defining behaviour without inheriting any code", c: "Abstraction", why: "Only the interface is exposed, not the implementation." },
      ];
      const item = rng.pick(features);
      return choiceQuestion(
        `Which object-oriented principle is being applied here? ${item.f}.`,
        item.c,
        ["Encapsulation", "Inheritance", "Abstraction"],
        {
          rng,
          marks: 2,
          solution: [step("Identify", item.why)],
          takeaway:
            "Encapsulation hides data, inheritance reuses a hierarchy, composition assembles, abstraction exposes an interface only.",
        },
      );
    },
  },
  {
    key: "cs-memory-address",
    base: 0.0,
    span: 1.7,
    build: ({ rng, tier }) => {
      const base = rng.int(100, 5000);
      const lower = rng.int(0, 4);
      const index = rng.int(0, 8);
      const size = rng.pick([1, 2, 4, 8]);
      const address = base + (index - lower) * size;

      return numericQuestion(
        `An array has a base address of **${base}**, a lower bound of **${lower}**, and each element occupies **${size}** bytes. What is the address of element \`[${index}]\`?`,
        address,
        {
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Address formula", "address = base + (index − lower bound) × element size."),
            step(
              "Substitute",
              `${base} + (${index} − ${lower}) × ${size} = ${base} + ${(index - lower) * size} = ${address}.`,
            ),
            step(
              "The trap",
              "Using the index directly instead of the displacement from the lower bound gives a different, wrong answer whenever the lower bound is not 0.",
            ),
          ],
          takeaway:
            "Arrays with a non-zero lower bound exist so that indices can match mathematical notation. The displacement is what matters, not the raw index.",
        },
      );
    },
  },
];

// ================================================================ registration

registerGenerators(
  ["ocr-p1", "ocr-p2", "ocr-p3"],
  [...representationGenerators, ...algorithmicGenerators],
);
registerGenerators(
  ["ocr-1.1.1", "ocr-1.1.2", "ocr-1.1.3"],
  representationGenerators,
);
registerGenerators(
  ["ocr-1.2.1", "ocr-1.2.2", "ocr-1.2.3", "ocr-1.2.4"],
  dataTypeGenerators,
);
registerGenerators(["ocr-1.3.1", "ocr-1.3.2", "ocr-1.3.3", "ocr-1.3.4"], securityGenerators);
registerGenerators(["ocr-1.4.1", "ocr-1.4.2", "ocr-1.4.3"], structureDataGenerators);
registerGenerators(
  ["ocr-1.5.1", "ocr-1.5.2"],
  // 1.5.1 is legal and ethical, which leans on the data-protection material,
  // so it is deliberately shared with 1.2 rather than left with three templates.
  [...ethicalGenerators, ...dataTypeGenerators],
);
registerGenerators(
  ["ocr-2.1.1", "ocr-2.1.2", "ocr-2.1.3", "ocr-2.1.4", "ocr-2.1.5"],
  algorithmicGenerators,
);
registerGenerators(
  ["ocr-2.2.1", "ocr-2.2.2", "ocr-2.2.3", "ocr-2.2.4", "ocr-2.2.5"],
  programmingGenerators,
);
registerGenerators(["ocr-2.3.1", "ocr-2.3.2", "ocr-2.3.3"], paradigmGenerators);
