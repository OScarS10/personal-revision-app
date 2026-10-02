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

/*
  These generators are about NUMBER REPRESENTATION, not the processor.

  They were originally registered against 1.1.1 "Structure and function of the
  processor", which made the processor chapter ask how many bits a nibble held.
  The section header below used to say "1.1 Structure and representation",
  which is where the confusion started: the spec's 1.1 is about the processor and
  its registers, and this content is 1.4.1 Data types.
*/

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
      /*
        Two's complement needs one bit more than the unsigned magnitude: -value
        only fits once value <= 2^(bits-1). Using ceil(log2(value + 1)) sizes
        the field for the magnitude instead, which is a bit short.
      */
      const bits = Math.max(4, Math.ceil(Math.log2(value)) + 1);
      // The stored pattern is 2^bits - value, so reading it back as
      // (pattern - 2^bits) returns -value. Adding value to 2^bits instead
      // produces the pattern for a different number entirely.
      const unsigned = Math.pow(2, bits) - value;
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

// ============================================== 1.1 Processor architecture

/*
  The processor chapter. This content existed nowhere before: 1.1.1 was wired to
  the number-representation templates above, so "Structure and function of the
  processor" asked how many bits a nibble held. These are the questions the
  chapter title actually promises.

  The fetch-execute generator is the centrepiece because it is the one thing a
  learner has to hold in their head at once. It builds a real register trace
  with a simulator rather than asserting a fixed answer, so the numbers cannot
  drift out of step with the prose.
*/

const processorGenerators: Generator[] = [
  {
    key: "cs-register-role",
    base: -1.0,
    span: 1.1,
    build: ({ rng }) => {
      const registers = [
        {
          name: "PC",
          role: "holds the address of the next instruction to be fetched",
        },
        {
          name: "MAR",
          role: "holds the address of the memory location data is about to be read from or written to",
        },
        {
          name: "MDR",
          role: "holds the data itself while it is being transferred to or from memory",
        },
        {
          name: "CIR",
          role: "holds the instruction currently being decoded and executed",
        },
        {
          name: "ACC",
          role: "holds the result of the ALU while it is being used",
        },
      ] as const;
      const correct = rng.pick(registers);
      // Plausible confusions: another register's genuine role, which is far more
      // useful to a learner than an obviously wrong option.
      const others = registers.filter((r) => r.name !== correct.name);
      return choiceQuestion(
        "Which register is responsible for this job?",
        correct.name,
        rng.sample(others, 3).map((r) => r.name),
        {
          rng,
          marks: 2,
          solution: [
            step("Name the job", `The job described is that it ${correct.role}.`),
            step(
              "Match it to the register",
              `That is the **${correct.name}**.`,
            ),
          ],
          takeaway: `The **${correct.name}** ${correct.role}.`,
          context:
            "A CPU keeps several small, very fast stores of data. Telling them apart is the single most examinable fact in this topic.",
        },
      );
    },
  },
  {
    key: "cs-register-role-why",
    base: 0.6,
    span: 1.5,
    build: ({ rng }) => {
      const scenarios = [
        {
          register: "MAR",
          need: "to tell memory which location to read from next",
          wrong: "MDR",
        },
        {
          register: "MDR",
          need: "to hold the value that memory has just returned",
          wrong: "MAR",
        },
        {
          register: "PC",
          need: "to know where in memory to fetch the next instruction from",
          wrong: "CIR",
        },
        {
          register: "CIR",
          need: "to keep the instruction being executed available while the control unit decodes it",
          wrong: "PC",
        },
      ] as const;
      const s = rng.pick(scenarios);
      return choiceQuestion(
        `The processor needs a register ${s.need}. Which register is it?`,
        s.register,
        [s.wrong, "ACC", "The ALU"],
        {
          rng,
          marks: 2,
          solution: [
            step(
              "Separate address from data",
              "The **MAR** deals in addresses, the **MDR** in the data itself, and the **PC** in the address of the next instruction. They are routinely swapped in questions because they are used together.",
            ),
            step("Apply it", `Here the register needed is **${s.register}**.`),
          ],
          takeaway:
            "MAR = address, MDR = data, PC = next instruction, CIR = current instruction, ACC = ALU result.",
        },
      );
    },
  },
  {
    key: "cs-bus-direction",
    base: 0.2,
    span: 1.4,
    build: ({ rng }) => {
      const buses = [
        {
          name: "address bus",
          direction: "one-way (from the processor)",
          carries: "memory addresses",
        },
        {
          name: "data bus",
          direction: "two-way",
          carries: "the actual data, both to and from memory",
        },
        {
          name: "control bus",
          direction: "one-way",
          carries: "control signals such as read, write and interrupt",
        },
      ] as const;
      const correct = rng.pick(buses);
      return choiceQuestion(
        `Which single statement about the **${correct.name}** is correct?`,
        `${correct.direction}, carrying ${correct.carries}`,
        [
          `two-way, carrying ${correct.carries}`,
          `one-way (from the processor), carrying control signals`,
          `two-way, carrying memory addresses`,
        ],
        {
          rng,
          marks: 2,
          solution: [
            step(
              "Recall each bus",
              "The **address bus** is one-way and carries addresses. The **data bus** is two-way. The **control bus** carries the signals that say what to do.",
            ),
            step("Apply it", `Here the **${correct.name}** is ${correct.direction}, carrying ${correct.carries}.`),
          ],
          takeaway:
            "The data bus is the only two-way bus, which is why it is the only one that needs to be as wide as a word.",
          context:
            "Bus width is a common exam detail: a wider bus moves more bits per transfer, so it is faster for the same clock speed.",
        },
      );
    },
  },
  {
    key: "cs-fetch-execute-register",
    base: 1.1,
    span: 1.6,
    build: ({ rng, tier }) => {
      const stages = [
        {
          text: "The address of the next instruction is placed in the **MAR**.",
          register: "MAR",
          detail: "The PC is copied into the MAR, which then puts that address on the address bus.",
        },
        {
          text: "The instruction returned by memory is held in the **MDR**.",
          register: "MDR",
          detail: "Memory puts the instruction on the data bus and the MDR captures it.",
        },
        {
          text: "The instruction is moved into the **CIR** to be decoded.",
          register: "CIR",
          detail: "The control unit decodes the instruction held in the CIR.",
        },
        {
          text: "The address of the next instruction is incremented in the **PC**.",
          register: "PC",
          detail: "The PC steps on to the following instruction so the cycle can repeat.",
        },
        {
          text: "The result of an arithmetic operation is placed in the **ACC**.",
          register: "ACC",
          detail: "The ACC is the ALU's output register during the execute stage.",
        },
      ];
      // Higher tiers ask about the later stages, which are harder to recall.
      const pool = tier <= 2 ? stages.slice(0, 3) : stages;
      const s = rng.pick(pool);
      const others = stages.filter((x) => x.register !== s.register);
      return choiceQuestion(
        `During the fetch-execute cycle: ${s.text} Which register does this step involve?`,
        s.register,
        rng.sample(others, 3).map((x) => x.register),
        {
          rng,
          marks: tier >= 4 ? 3 : 2,
          solution: [
            step("Why that register", s.detail),
            step(
              "Where it sits in the cycle",
              "The **MAR** names the location, the **MDR** carries the data, the **CIR** holds the instruction while it is decoded, and the **PC** points at the next one.",
            ),
          ],
          takeaway:
            "Fetch: PC → MAR → address bus → memory → MDR → CIR. Execute: the control unit acts on the decoded instruction.",
        },
      );
    },
  },
  {
    key: "cs-fetch-execute-trace",
    base: 1.7,
    span: 1.5,
    build: ({ rng }) => {
      /*
        A real trace, simulated rather than hard-coded. The registers are
        mutated in the order the hardware performs them, so if the description
        below is wrong the answer would be wrong too - the question cannot
        silently disagree with its own worked solution.
      */
      const address = rng.int(40, 250);
      const registers = [
        { name: "PC", value: address },
        { name: "MAR", value: 0 },
        { name: "MDR", value: 0 },
        { name: "CIR", value: 0 },
      ] as { name: string; value: number }[];
      const byName = (n: string) => registers.find((r) => r.name === n)!;

      const trace: string[] = [];
      // Fetch: MAR <- PC, then memory returns into MDR, then MDR -> CIR.
      byName("MAR").value = byName("PC").value;
      trace.push(`MAR <- PC, so MAR = ${byName("MAR").value}`);
      byName("MDR").value = 9000 + address;
      trace.push(`MDR <- instruction from memory, so MDR = ${byName("MDR").value}`);
      byName("CIR").value = byName("MDR").value;
      trace.push(`CIR <- MDR, so CIR = ${byName("CIR").value}`);
      byName("PC").value = address + 1;
      trace.push(`PC incremented, so PC = ${byName("PC").value}`);

      const answerAfterFetch = String(byName("MAR").value);

      return choiceQuestion(
        `A program starts with **PC = ${address}**. After the **fetch** stage of the fetch-execute cycle completes, but before the instruction is executed, what does the **MAR** contain?`,
        answerAfterFetch,
        [
          String(byName("MDR").value),
          String(byName("CIR").value),
          String(address + 1),
        ],
        {
          rng,
          marks: 4,
          solution: [
            step("The MAR copies the PC", `The MAR is loaded from the PC, so it holds ${address}.`),
            step(
              "It keeps that value through fetch",
              `The MDR and CIR are then filled with the instruction (${byName("MDR").value}), but the MAR still holds the address it put on the bus: ${byName("MAR").value}.`,
            ),
            step("The PC moves on, the MAR does not", `The PC becomes ${byName("PC").value}, which is the classic distractor here.`),
          ],
          takeaway:
            "The MAR holds the address for the whole fetch. It is the MDR and the CIR that change to hold data, not the MAR.",
          context:
            "Trace the register that the question asks about, and note that the PC increments while the MAR does not.",
        },
      );
    },
  },
  {
    key: "cs-cisc-risc-match",
    base: 0.8,
    span: 1.5,
    build: ({ rng }) => {
      const features = [
        { text: "many instructions, each of which can do a lot in one step", answer: "CISC" },
        { text: "a small set of simple, fixed-length instructions", answer: "RISC" },
        { text: "control implemented in microcode in a control store", answer: "CISC" },
        { text: "control implemented directly in hardware", answer: "RISC" },
        { text: "instructions take several clock cycles to complete", answer: "CISC" },
        { text: "a load-store design where only load and store touch memory", answer: "RISC" },
        { text: "a larger and more complex compiler is usually needed", answer: "CISC" },
      ] as const;
      const f = rng.pick(features);
      return choiceQuestion(
        `Which processor type is characterised by ${f.text}?`,
        f.answer,
        f.answer === "CISC" ? ["RISC", "Neither is defined by this"] : ["CISC", "Neither is defined by this"],
        {
          rng,
          marks: 2,
          solution: [
            step(
              "CISC or RISC",
              "**CISC** has many complex instructions, often microcoded and variable length. **RISC** has few simple fixed-length instructions, decoded in hardware.",
            ),
            step("Apply it", `"${f.text}" describes **${f.answer}**.`),
          ],
          takeaway:
            "CISC = lots of complex instructions, microcode control. RISC = few simple ones, hardware control, load-store.",
        },
      );
    },
  },
  {
    key: "cs-amdahl-speedup",
    base: 1.5,
    span: 1.7,
    build: ({ rng }) => {
      // Amdahl: speedup = 1 / ((1 - p) + p/n). Computed, never tabulated.
      const serialPercent = rng.int(10, 45);
      const p = (100 - serialPercent) / 100;
      const processors = rng.pick([2, 4, 8, 16]);
      const speedup = 1 / (serialPercent / 100 + p / processors);
      const perfect = 1 / (serialPercent / 100);

      return choiceQuestion(
        `A program spends **${serialPercent}%** of its time on work that cannot be parallelised. The remaining **${100 - serialPercent}%** is split evenly across **${processors}** cores. What is the speed-up?`,
        `About ${speedup.toFixed(2)} times`,
        [
          `About ${perfect.toFixed(2)} times`,
          `About ${processors} times`,
          `About ${(processors * (1 - p)).toFixed(2)} times`,
        ],
        {
          rng,
          marks: 4,
          solution: [
            step("Write Amdahl's law", "Speed-up = 1 / ((1 - p) + p/n), where p is the parallelisable proportion."),
            step(
              "Substitute",
              `p = ${p.toFixed(2)} and n = ${processors}, so speed-up = 1 / (${serialPercent / 100} + ${p.toFixed(2)}/${processors}) = ${speedup.toFixed(2)}.`,
            ),
            step(
              "Compare with the ideal",
              `Even with infinite cores the ceiling is 1/${serialPercent / 100} = ${perfect.toFixed(2)}. The serial part is what caps it.`,
            ),
          ],
          takeaway:
            "Amdahl's law: speed-up = 1 / ((1 - p) + p/n). The serial fraction caps the result, so doubling cores gives diminishing returns.",
          context:
            "This is a standard 6-marker. Write the formula, substitute carefully, then comment that the serial part limits the gain.",
        },
      );
    },
  },
  {
    key: "cs-gpu-multicore",
    base: 0.1,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "thousands of small cores running the same instruction over many data items at once, which suits training a neural network",
          answer: "a GPU",
          why: "A GPU is built for high throughput on large numbers of similar operations, not for branching control flow.",
        },
        {
          text: "a processor with several complete execution units on one chip, so several programs can run at the same time",
          answer: "a multicore processor",
          why: "Multicore puts several cores on one chip so the operating system can schedule work across them.",
        },
        {
          text: "many separate processors connected by a network, each with its own memory, working on one problem",
          answer: "a parallel processing system",
          why: "A cluster distributes both processing and memory across networked machines.",
        },
        {
          text: "dividing a problem into many small tasks that can be finished at the same time on different cores",
          answer: "parallelism",
          why: "Parallelism is the technique; multicore, GPU and cluster are the hardware that enables it.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(
        `Which term best matches: ${s.text}?`,
        s.answer,
        rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer),
        {
          rng,
          marks: 2,
          solution: [
            step("Identify it", `**${s.answer}**.`),
            step("Why", s.why),
          ],
          takeaway:
            "A GPU is many simple cores for bulk maths. Multicore is several full CPUs on one chip. A cluster is networked machines.",
        },
      );
    },
  },
  {
    key: "cs-processor-performance",
    base: 0.4,
    span: 1.6,
    build: ({ rng, tier }) => {
      const factors = [
        "the clock speed, in hertz",
        "the number of cores",
        "the size of the cache",
        "the length of the instructions in the instruction set",
      ] as const;
      if (tier >= 4) {
        // Harder variant: two machines, ask which is faster and why.
        const clockA = rng.int(2, 4);
        const clockB = rng.int(4, 6);
        const coresA = rng.int(2, 4);
        const coresB = rng.int(2, 3);
        const faster = clockA * coresA > clockB * coresB ? "Machine A" : "Machine B";
        return choiceQuestion(
          `Machine A has a **${clockA} GHz** clock and **${coresA}** cores. Machine B has a **${clockB} GHz** clock and **${coresB}** cores. Assuming everything else is identical, which is faster?`,
          faster,
          [
            faster === "Machine A" ? "Machine B" : "Machine A",
            "Neither, clock speed is the only factor",
            "It cannot be determined without knowing the instruction sets",
          ],
          {
            rng,
            marks: 3,
            solution: [
              step(
                "Work out a rough figure",
                `Machine A: ${clockA} x ${coresA} = ${clockA * coresA}. Machine B: ${clockB} x ${coresB} = ${clockB * coresB}.`,
              ),
              step(
                "Be careful",
                "Multiplying clock speed by core count is only a rough comparison. Cache size, architecture and instruction length all matter, which is why the question says everything else is identical.",
              ),
            ],
            takeaway:
              "Clock speed x cores is a guide, not a rule. Cache size, instruction set length and architecture can outweigh it.",
          },
        );
      }
      const f = rng.pick(factors);
      const others = factors.filter((x) => x !== f);
      return choiceQuestion(
        "Which of the following affects how fast a processor runs?",
        f,
        rng.sample(others, 3),
        {
          rng,
          marks: 2,
          solution: [
            step("List them all", "Clock speed, number of cores, cache size and instruction set length all affect performance."),
            step("Apply it", `"${f}" is one of them.`),
          ],
          takeaway:
            "Clock speed, cores, cache size, architecture and instruction set length are the five factors named in the specification.",
        },
      );
    },
  },
];

// ============================================ 1.1.3 Input, output and storage

const storageGenerators: Generator[] = [
  {
    key: "cs-storage-volatility",
    base: -0.9,
    span: 1.2,
    build: ({ rng }) => {
      const devices = [
        {
          device: "RAM",
          volatile: true,
          note: "volatile: contents are lost when the power goes",
        },
        {
          device: "ROM",
          volatile: false,
          note: "non-volatile and read-only, holding firmware that survives a power cut",
        },
        {
          device: "a hard disk",
          volatile: false,
          note: "magnetic, non-volatile, read/write and addressable",
        },
        {
          device: "flash memory",
          volatile: false,
          note: "non-volatile, read/write, with no moving parts",
        },
        {
          device: "a DVD",
          volatile: false,
          note: "optical, non-volatile and effectively read-only",
        },
      ] as const;
      const askVolatile = rng.bool();
      const correct = askVolatile
        ? devices.find((d) => d.volatile)!
        : devices.find((d) => !d.volatile)!;
      const others = devices.filter((d) => d.device !== correct.device);
      return choiceQuestion(
        askVolatile
          ? "Which of these storage devices is **volatile**, meaning its contents are lost when the power is removed?"
          : "Which of these storage devices is **non-volatile**, meaning its contents survive when the power is removed?",
        correct.device,
        rng.sample(others, 3).map((d) => d.device),
        {
          rng,
          marks: 2,
          solution: [
            step(
              "Recall the definition",
              "Volatile means lost on power-off. **RAM** is the only volatile item here; everything else keeps its contents.",
            ),
            step("Apply it", `${correct.device} is the answer: it ${correct.note}.`),
          ],
          takeaway:
            "RAM is volatile and read/write. ROM, magnetic, flash and optical storage are all non-volatile.",
        },
      );
    },
  },
  {
    key: "cs-storage-compare",
    base: 0.9,
    span: 1.6,
    build: ({ rng }) => {
      const scenarios = [
        {
          need: "the operating system must load as soon as the machine is switched on, before any disk is available",
          answer: "ROM",
          why: "ROM holds the boot code, which has to be readable before the disk is mounted.",
        },
        {
          need: "a photograph library that must survive a laptop being dropped, with no moving parts",
          answer: "flash",
          why: "Flash has no moving parts, so it survives knocks where a magnetic disk would not always.",
        },
        {
          need: "the largest amount of data at the lowest cost per gigabyte for archiving films",
          answer: "magnetic storage",
          why: "Magnetic disks are cheapest per unit of capacity, which is why they are used for bulk archive.",
        },
        {
          need: "software that ships on a disc and is never rewritten by the user",
          answer: "optical",
          why: "Optical media are pressed rather than written, so they suit distribution of fixed content.",
        },
      ] as const;
      const s = rng.pick(scenarios);
      return choiceQuestion(
        `A system needs storage where ${s.need}. Which type of storage is the best fit?`,
        s.answer,
        ["RAM", "ROM", "flash"].filter((x) => x !== s.answer).slice(0, 2),
        {
          rng,
          marks: 3,
          solution: [
            step("Weigh the requirement", s.why),
            step(
              "Exclude the rest",
              "RAM loses its contents on power-off, so it cannot hold anything permanent. ROM cannot be rewritten, so it suits fixed code rather than a large library.",
            ),
          ],
          takeaway:
            "Match the storage type to the requirement: speed and volatility matter more than raw capacity in most of these.",
        },
      );
    },
  },
  {
    key: "cs-virtual-storage",
    base: 1.6,
    span: 1.4,
    build: ({ rng }) => {
      const reasons = [
        {
          text: "so that each program has its own address space and cannot overwrite another's memory",
          answer: "it prevents one program corrupting another's data",
        },
        {
          text: "so that more programs can be open than could physically fit in RAM",
          answer: "it lets programs that do not fit in RAM still run",
        },
        {
          text: "so that main memory does not have to hold the whole of every program at once",
          answer: "only the pages actually in use are loaded into RAM",
        },
      ] as const;
      const r = rng.pick(reasons);
      return choiceQuestion(
        `Virtual storage exists in order to ${r.text}. What is the main advantage?`,
        r.answer,
        ["it makes RAM physically larger", "it removes the need for a hard disk"],
        {
          rng,
          marks: 3,
          solution: [
            step(
              "What virtual storage is",
              "A program is divided into pages. Pages are loaded into RAM only when needed and written back when they have not been used for a while, with the rest held on disk.",
            ),
            step("The benefit", r.answer),
            step(
              "The cost, for the full explanation",
              "Paging in and out is slow, so performance is worse than running from RAM alone.",
            ),
          ],
          takeaway:
            "Virtual storage lets programs exceed RAM by paging, at the cost of disk access time. Each program gets its own address space.",
        },
      );
    },
  },
  {
    key: "cs-storage-access-metric",
    base: 0.5,
    span: 1.6,
    build: ({ rng, tier }) => {
      const scenarios = [
        {
          device: "an SSD",
          access: "around 0.1 ms",
          why: "no moving parts, so there is no seek time to wait for",
        },
        {
          device: "a hard disk",
          access: "around 10 ms",
          why: "a physical head has to move over the spinning platters",
        },
        {
          device: "main memory (RAM)",
          access: "around 100 nanoseconds",
          why: "it is on the same board and connected directly to the CPU",
        },
      ] as const;
      const s = rng.pick(scenarios);
      const numeric = /(\d+(\.\d+)?)\s*(ms|ns)/.exec(s.access);
      const value = numeric ? Number(numeric[1]) : 0;
      const unit = numeric ? numeric[3]! : "";

      if (tier >= 4) {
        // Harder: the comparison, which is what the specification actually asks.
        const hd = scenarios[1]!;
        const ssd = scenarios[0]!;
        const ratio = Math.round(10 / 0.1);
        return choiceQuestion(
          "A program reads many small files in sequence. Why is an SSD noticeably faster than a hard disk for this workload?",
          "the SSD has a much lower access time because it has no moving parts",
          [
            "the SSD stores more data per disk, so fewer reads are needed",
            "the SSD has a higher data transfer rate, so each read is quicker",
            "the hard disk is slower to transfer data, because it is magnetic",
          ],
          {
            rng,
            marks: 3,
            solution: [
              step(
                "Compare the metric that matters",
                `Access time is roughly ${ssd.access} on an SSD against ${hd.access} on a hard disk, a factor of about ${ratio}. Small random reads are dominated by access time, not throughput.`,
              ),
              step("Name the cause", `The hard disk ${hd.why}, which is the whole of the difference.`),
              step(
                "The trap",
                "Capacity and transfer rate are real differences, but neither explains a workload made of many tiny reads.",
              ),
            ],
            takeaway:
              "Access time is latency: how long until the data arrives. Throughput is bandwidth: how much per second. Many small reads are limited by latency, not bandwidth.",
          },
        );
      }

      return choiceQuestion(
        `Roughly what is the access time of ${s.device}?`,
        s.access,
        [scenarios[0]!.access, scenarios[1]!.access, scenarios[2]!.access].filter(
          (x) => x !== s.access,
        ),
        {
          rng,
          marks: 2,
          solution: [
            step(
              "Order the hierarchy",
              "Registers are fastest, then cache, then RAM at around 100 ns, then SSD at around 0.1 ms, then a hard disk at around 10 ms.",
            ),
            step("Apply it", `${s.device} is about ${s.access}, because it ${s.why}.`),
          ],
          takeaway:
            "Access times differ by orders of magnitude: RAM ~100 ns, SSD ~0.1 ms, hard disk ~10 ms.",
          context: `About ${value} ${unit}.`,
        },
      );
    },
  },
  {
    key: "cs-storage-throughput",
    base: 0.9,
    span: 1.4,
    build: ({ rng }) => {
      const pairs = [
        {
          measure: "capacity",
          question: "How much data the device can hold",
          unit: "gigabytes or terabytes",
        },
        {
          measure: "access time",
          question: "How long it takes to reach one piece of data",
          unit: "milliseconds or nanoseconds",
        },
        {
          measure: "throughput",
          question: "How much data it can transfer each second",
          unit: "megabytes or gigabytes per second",
        },
      ] as const;
      const p = rng.pick(pairs);
      const others = pairs.filter((x) => x.measure !== p.measure);
      return choiceQuestion(
        `When comparing two storage devices, ${p.measure} refers to ${p.question}. In what is it usually measured?`,
        p.unit,
        rng.sample(others, 2).map((x) => x.unit),
        {
          rng,
          marks: 3,
          solution: [
            step("Keep the three apart", "Capacity is how much fits. Access time is the delay to one item. Throughput is the rate of transfer."),
            step("Apply it", `${p.measure} is measured in ${p.unit}.`),
            step(
              "Why the exam asks all three",
              "A device can be large, fast to reach into and slow to stream from. Judging on one number alone is misleading.",
            ),
          ],
          takeaway:
            "Capacity = size. Access time = latency to a single item. Throughput = transfer rate. All three are needed to compare storage.",
        },
      );
    },
  },
];

// ======================================== 1.2 / 1.3 Systems, data and networks

/*
  Content for the chapters that were previously wired to whatever generator set
  happened to be left over.

  Registering 1.3.2 Databases with the encryption templates was not a neutral
  mistake: it meant a learner revising databases was asked about symmetric
  encryption, and any result from those questions was fed into the ability model
  as though it measured their database knowledge. Leaving them empty is more
  honest but makes the chapter unpracticable, so they are written here instead.
*/

const systemsGenerators: Generator[] = [
  {
    key: "cs-os-component-role",
    base: -1.0,
    span: 1.2,
    build: ({ rng }) => {
      const parts = [
        {
          name: "kernel",
          job: "controls the processor, memory and all other hardware",
        },
        {
          name: "device driver",
          job: "lets the operating system communicate with a particular device",
        },
        {
          name: "file system",
          job: "organises files and folders, and records where they are on disk",
        },
        {
          name: "user interface",
          job: "provides the way a person interacts with the system",
        },
      ] as const;
      const correct = rng.pick(parts);
      const others = parts.filter((p) => p.name !== correct.name);
      return choiceQuestion(
        `Which component of an operating system has the job of ${correct.job}?`,
        correct.name,
        rng.sample(others, 3).map((p) => p.name),
        {
          rng,
          marks: 2,
          solution: [
            step("Match job to component", `The component that ${correct.job} is the **${correct.name}**.`),
            step(
              "The one that is most often confused",
              "The kernel and the device drivers are routinely swapped: the kernel controls the machine, while a driver controls one peripheral.",
            ),
          ],
          takeaway: "Kernel = control the hardware. Driver = control one device. File system = organise storage. UI = interaction.",
        },
      );
    },
  },
  {
    key: "cs-memory-management",
    base: 0.7,
    span: 1.6,
    build: ({ rng, tier }) => {
      const schemes = [
        {
          name: "contiguous allocation",
          pro: "simple and fast to access",
          con: "needs one unbroken run of memory and is prone to external fragmentation",
        },
        {
          name: "paging",
          pro: "uses fixed-size pages and removes external fragmentation",
          con: "can cause internal fragmentation and needs a page table",
        },
        {
          name: "segmentation",
          pro: "divides memory by logical units such as code and data",
          con: "suffering from the same external fragmentation as contiguous allocation",
        },
      ] as const;
      if (tier >= 4) {
        // Harder: ask which scheme has a given property, forcing two distinctions.
        const s = rng.pick(schemes);
        return choiceQuestion(
          `A system suffers from external fragmentation, where free memory exists but is scattered in pieces too small to use. Which allocation scheme is this characteristic of?`,
          s.name === "paging" ? "contiguous allocation" : s.name,
          ["paging", "virtual memory", "a cache"],
          {
            rng,
            marks: 3,
            solution: [
              step(
                "Distinguish internal from external",
                "**External** fragmentation comes from free memory being scattered. **Internal** fragmentation is wasted space inside an allocated block.",
              ),
              step(
                "Apply it",
                "Contiguous allocation and segmentation both leave external fragmentation, because each needs one contiguous block. Paging avoids external fragmentation entirely because it fixes the block size.",
              ),
            ],
            takeaway:
              "Paging kills external fragmentation but can cause internal fragmentation. Contiguous and segmented allocation do the opposite.",
          },
        );
      }
      const s = rng.pick(schemes);
      return choiceQuestion(
        `What is the main advantage of **${s.name}**?`,
        s.pro,
        schemes.filter((x) => x.name !== s.name).map((x) => x.con),
        {
          rng,
          marks: 2,
          solution: [
            step("Recall the trade-off", `**${s.name}**: ${s.pro}, but ${s.con}.`),
          ],
          takeaway:
            "Every memory scheme is a trade-off. Paging removes external fragmentation at the cost of internal fragmentation.",
        },
      );
    },
  },
  {
    key: "cs-translation-stage",
    base: 0.5,
    span: 1.6,
    build: ({ rng }) => {
      const stages = [
        {
          name: "lexical analysis",
          job: "turns the source code into tokens such as keywords, identifiers and operators",
        },
        {
          name: "syntax analysis",
          job: "checks the tokens are in a valid order and builds the parse tree",
        },
        {
          name: "code generation",
          job: "produces the target code from the parse tree",
        },
        {
          name: "optimisation",
          job: "rewrites the code so it runs faster or uses less memory",
        },
      ] as const;
      const s = rng.pick(stages);
      return choiceQuestion(
        `During translation, which stage ${s.job}?`,
        s.name,
        rng.sample(stages.filter((x) => x.name !== s.name), 3).map((x) => x.name),
        {
          rng,
          marks: 2,
          solution: [
            step("Order the stages", "Source → lexical analysis → syntax analysis → semantic analysis → code generation → optimisation."),
            step("Apply it", `${s.job} is **${s.name}**.`),
          ],
          takeaway:
            "Lexical = tokens. Syntax = structure and the parse tree. Code generation = output. Optimisation = speed and size.",
        },
      );
    },
  },
  {
    key: "cs-scheduler-policy",
    base: 0.2,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "a high-priority process is stopped partway through so a higher-priority one can run",
          answer: "preemptive scheduling",
          why: "Preemptive scheduling takes the CPU away from a running process when something more important needs it.",
        },
        {
          text: "processes are ordered by importance and each runs until it finishes or blocks",
          answer: "priority scheduling",
          why: "Priority scheduling picks the waiting process with the highest priority first.",
        },
        {
          text: "every process gets an equal share of the CPU in turn",
          answer: "round-robin scheduling",
          why: "Round-robin gives each process a fixed slice of CPU time in rotation.",
        },
        {
          text: "the measure of how many processes the scheduler completes per unit of time",
          answer: "throughput",
          why: "Throughput is the number of jobs finished per unit time, not how long one takes.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(
        `In process management, which term matches this: ${s.text}?`,
        s.answer,
        rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer),
        {
          rng,
          marks: 2,
          solution: [
            step("Pick the term", `**${s.answer}**.`),
            step("Why", s.why),
          ],
          takeaway:
            "Preemptive = the scheduler can interrupt. Priority = importance decides order. Throughput = jobs finished per unit time.",
        },
      );
    },
  },
  {
    key: "cs-interrupt-vs-polling",
    base: 0.1,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "the processor is repeatedly asked whether a device has data, which keeps it busy even when the device is idle",
          answer: "polling",
          why: "Polling means the CPU checks the device on a loop, wasting cycles when there is nothing to do.",
        },
        {
          text: "the device signals the processor itself, which stops what it is doing to deal with the event",
          answer: "an interrupt",
          why: "An interrupt lets the device raise the processor's attention, so the CPU only reacts when something happens.",
        },
        {
          text: "an interrupt handler must save the processor's state before the interrupted task carries on",
          answer: "a context switch",
          why: "The current register values are saved to a stack so the interrupted task can be restored exactly.",
        },
        {
          text: "a device that raises an interrupt the processor is not expecting, leaving it unable to continue",
          answer: "a deadlock is not involved; this is a device fault",
          why: "Deadlock is a software scheduling problem between processes, not a device signalling problem.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(
        `Which term best matches: ${s.text}?`,
        s.answer,
        rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer),
        {
          rng,
          marks: 2,
          solution: [
            step("Identify the mechanism", `**${s.answer}**.`),
            step("Why", s.why),
          ],
          takeaway:
            "Polling costs CPU time continuously. An interrupt costs it only when there is work.",
        },
      );
    },
  },
  {
    key: "cs-deadlock-conditions",
    base: 0.7,
    span: 1.5,
    build: ({ rng }) => {
      const conditions = [
        {
          name: "mutual exclusion",
          phrase: "at least one resource is held in a non-shareable state",
        },
        {
          name: "hold and wait",
          phrase: "a process holds one resource while waiting to be given another",
        },
        {
          name: "no preemption",
          phrase: "a resource cannot be forcibly taken back from the process holding it",
        },
        {
          name: "circular wait",
          phrase: "there is a circular chain of processes, each waiting for the next one in the chain",
        },
      ] as const;
      const s = rng.pick(conditions);
      const others = conditions.filter((c) => c.name !== s.name);

      /*
        Asked as a scenario rather than as a list, because recognising which of
        the four conditions a description shows is the part being examined.
      */
      const inverted = rng.bool(0.35);
      if (inverted) {
        const notDeadlock = [
          "starvation, where a process is denied CPU time indefinitely",
          "thrashing, where pages are swapped in and out faster than they are used",
          "a race condition, where two processes update shared data at the same time",
        ] as const;
        const answer = rng.pick(notDeadlock);
        return choiceQuestion(
          "Which of these is **not** one of the four Coffman conditions required for deadlock?",
          answer,
          [s.phrase, ...rng.sample(others, 2).map((c) => c.phrase)],
          {
            rng,
            marks: 3,
            solution: [
              step("Recall the four", `The four are **${conditions.map((c) => c.name).join(", ")}**.`),
              step("The odd one out", `**${answer}** is a real problem, but not one of the conditions for deadlock.`),
            ],
            takeaway: "All four Coffman conditions must hold at once. Breaking any one of them rules deadlock out.",
          },
        );
      }

      return choiceQuestion(
        `Deadlock is possible only if every condition holds. Which of the four does this describe: ${s.phrase}?`,
        s.name,
        rng.sample(others, 3).map((c) => c.name),
        {
          rng,
          marks: 2,
          solution: [
            step("Name the condition", `**${s.name}**.`),
            step("The other three", others.map((c) => `• **${c.name}** — ${c.phrase}`).join("\n")),
          ],
          takeaway: "Mutual exclusion, hold and wait, no preemption, circular wait. All four together.",
        },
      );
    },
  },
  {
    key: "cs-compiler-vs-interpreter",
    base: 0.3,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "it translates the whole program before any of it runs, so errors in later lines are found at once",
          answer: "a compiler",
          why: "A compiler produces a separate executable, so it needs the whole program before it can run.",
        },
        {
          text: "it translates and runs one statement at a time, so it suits programs that need user input as they go",
          answer: "an interpreter",
          why: "An interpreter runs as it translates, which suits interactive use but is slower.",
        },
        {
          text: "it turns the source into machine code once, so repeated runs do not pay the translation cost again",
          answer: "a compiler",
          why: "The translation happens once at build time; the executable then runs directly.",
        },
        {
          text: "it needs no separate executable and is typically slower per instruction than compiled code",
          answer: "an interpreter",
          why: "Translating while running costs time on every execution.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(
        `Which of these describes ${s.text}?`,
        s.answer,
        rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer),
        {
          rng,
          marks: 2,
          solution: [step("Decide", `**${s.answer}**.`), step("Why", s.why)],
          takeaway: "Compiler: translate all, then run, faster to run. Interpreter: translate and run together.",
        },
      );
    },
  },
  {
    key: "cs-linker-loader-library",
    base: 0.6,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "it combines separately compiled object files into a single executable",
          answer: "the linker",
          why: "The linker resolves references between object files and produces the final program.",
        },
        {
          text: "it copies the program into memory and sets up the addresses it will run at",
          answer: "the loader",
          why: "The loader puts the executable into memory ready to start.",
        },
        {
          text: "it holds code that a program can call without the programmer rewriting it",
          answer: "a library",
          why: "A library is reusable code linked into or called by a program.",
        },
        {
          text: "it turns source code into tokens and checks the order they appear in",
          answer: "the compiler's lexical and syntax analysis",
          why: "Tokens and structure are handled during translation, not by the linker or loader.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which component ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Identify it", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Linker joins object files. Loader puts the program in memory. Library is reusable code.",
      });
    },
  },
  {
    key: "cs-test-level-match",
    base: 0.4,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "testing a single function in isolation to check it returns what it should",
          answer: "unit testing",
          why: "Unit testing targets the smallest testable piece on its own.",
        },
        {
          text: "checking that separately tested modules work correctly together",
          answer: "integration testing",
          why: "Integration testing looks for problems at the boundaries between components.",
        },
        {
          text: "the real users carrying out realistic tasks to confirm the system does what they need",
          answer: "user acceptance testing",
          why: "UAT confirms the business need is met, not just that the code works.",
        },
        {
          text: "comparing a finished program against a written specification to see which features are missing",
          answer: "system testing",
          why: "System testing measures the whole system against its specified requirements.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which testing technique covers this: ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Name the level", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Unit = one piece. Integration = pieces together. UAT = the user accepts it. System = against the spec.",
      });
    },
  },
  {
    key: "cs-requirements-user-vs-system",
    base: 0.5,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "\"the system must let a user search for flights by destination\"",
          answer: "a user requirement",
          why: "It describes what the user wants to achieve, stated in the user's own terms.",
        },
        {
          text: "\"the system must return search results within two seconds for 500 concurrent users\"",
          answer: "a system requirement",
          why: "It specifies a measurable constraint on the system itself rather than the user's goal.",
        },
        {
          text: "a system requirement states a constraint on the implementation, such as a response time or a storage volume",
          answer: "system requirement",
          why: "Constraints on the system are system requirements.",
        },
        {
          text: "a user requirement states what the user needs to do, without prescribing how the system does it",
          answer: "user requirement",
          why: "The user states the goal; the design decides the mechanism.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which requirement does this describe: ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Classify it", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "User = what the person needs. System = a measurable constraint on the solution.",
      });
    },
  },
  {
    key: "cs-maintenance-type",
    base: 0.8,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        {
          text: "routing around a fault that has appeared after release",
          answer: "corrective",
          why: "Corrective maintenance fixes bugs found in the working system.",
        },
        {
          text: "upgrading the database driver before it stops being supported",
          answer: "adaptive",
          why: "Adaptive maintenance keeps the system working as its environment changes.",
        },
        {
          text: "tidying and restructuring working code so future changes are easier",
          answer: "perfective",
          why: "Perfective maintenance improves quality or performance without fixing a fault.",
        },
        {
          text: "removing a feature once the business no longer wants it",
          answer: "perfective",
          why: "Dropping an unwanted feature is a change to improve what the system does.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`This is an example of which type of maintenance: ${s.text}?`, s.answer, ["corrective", "adaptive", "perfective", "pre-emptive"].filter((x) => x !== s.answer).slice(0, 3), {
        rng,
        marks: 2,
        solution: [step("Classify", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Corrective fixes faults. Adaptive adapts to change. Perfective improves.",
      });
    },
  },
  {
    key: "cs-agile-practice",
    base: 0.6,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "two programmers work on the same code at the same time and review each other's work",
          answer: "pair programming",
          why: "Pair programming spreads knowledge and catches mistakes as the code is written.",
        },
        {
          text: "a test is written before the code it tests, and the code is written to pass it",
          answer: "test-driven development",
          why: "TDD writes the failing test first, which pins down the required behaviour.",
        },
        {
          text: "code is merged into a shared main branch many times a day and must build and pass its tests to be accepted",
          answer: "continuous integration",
          why: "Frequent integration with automated checks stops branches diverging for long.",
        },
        {
          text: "iterative prototypes are built rapidly to explore what the user actually wants before committing to a design",
          answer: "rapid application development",
          why: "RAD uses fast throwaway prototypes to reduce the risk of building the wrong thing.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which practice or method does this describe: ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Name it", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "All of these are agile, with short cycles and frequent customer involvement.",
      });
    },
  },
  {
    key: "cs-language-classification",
    base: 0.1,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        {
          text: "a language made of the binary instructions a processor executes directly, with no translation step",
          answer: "machine code",
          why: "Machine code is the processor's own instruction set, needing nothing between it and the hardware.",
        },
        {
          text: "a symbolic language using mnemonics such as MOV and ADD that is translated into machine code",
          answer: "assembly language",
          why: "Assembly is a readable form of machine code using operation codes and operands.",
        },
        {
          text: "a language that runs without being compiled, commonly used inside web pages or to automate a task",
          answer: "a scripting language",
          why: "Scripting languages are interpreted and are valued for being quick to write.",
        },
        {
          text: "a portable language that must be translated before it can run, such as Python or Java",
          answer: "a high-level language",
          why: "High-level languages abstract the machine and trade some control for portability and speed of writing.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which type of programming language is being described: ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Classify it", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Machine code → assembly → high-level → scripting, trading control for readability.",
      });
    },
  },
  {
    key: "cs-addressing-mode",
    base: 0.9,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "the operand is the value held in the address the instruction names",
          answer: "direct addressing",
          why: "Direct addressing uses the address in the instruction as the location of the data.",
        },
        {
          text: "the address the instruction names holds the address of the data",
          answer: "indirect addressing",
          why: "Indirect addressing dereferences: the named location contains a pointer, not the data itself.",
        },
        {
          text: "the data is treated as a number and is added to the address in the instruction",
          answer: "indexed addressing",
          why: "Indexed addressing adds a register's value to the base address, which suits array access.",
        },
        {
          text: "the instruction names no memory location at all, because the value is already in a named register",
          answer: "implied or immediate addressing",
          why: "Implied addressing takes the operand from a fixed place such as the accumulator, which is the shortest encoding.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`In assembly language, which addressing mode is being used when ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 3,
        solution: [step("Identify the mode", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Direct names the data. Indirect names a pointer. Indexed adds a register. Implied takes it from a fixed place.",
      });
    },
  },
  {
    key: "cs-language-tradeoff",
    base: 0.5,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        {
          text: "it gives precise control over the processor and produces the fastest code",
          answer: "assembly or machine code",
          why: "Being close to the machine is what makes it fast, and it is also why it is hard to write.",
        },
        {
          text: "it is portable between processor families and far quicker to write for the same task",
          answer: "a high-level language",
          why: "Portability and speed of writing come from the abstraction, paid for with a translation step.",
        },
        {
          text: "it is very hard to debug and errors are only found when the program runs",
          answer: "assembly or machine code",
          why: "Low-level languages have no compiler checking, so mistakes surface late.",
        },
        {
          text: "it needs a compiler or interpreter and cannot be run directly by the processor",
          answer: "a high-level language",
          why: "The processor executes only machine code, so anything else needs translating first.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which kind of language is being described: ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Answer", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Low-level: fast, precise, painful. High-level: portable, readable, needs translating.",
      });
    },
  },
  {
    key: "cs-paradigm-match",
    base: 0.6,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "the program is a sequence of instructions that change variables, and the program follows that sequence",
          answer: "procedural",
          why: "Procedural programming organises code as a sequence of operations on data.",
        },
        {
          text: "data and the operations on it are bundled into objects that send messages to each other",
          answer: "object-oriented",
          why: "Object-oriented languages model the problem as objects with state and behaviour.",
        },
        {
          text: "the programmer states what the result should be and leaves the method to the language",
          answer: "declarative",
          why: "Declarative languages describe the desired outcome, such as SQL, rather than the steps.",
        },
        {
          text: "many separate tasks are interleaved and share the same processor cores over time",
          answer: "concurrent",
          why: "Concurrency is about structuring a program as interleaving tasks, not necessarily running them at once.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which paradigm does this describe: ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Name the paradigm", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Procedural = steps. Object-oriented = objects and messages. Declarative = state the result. Concurrent = interleaving tasks.",
      });
    },
  },
  {
    key: "cs-relational-algebra",
    base: 0.5,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "keep only the rows matching a condition",
          answer: "selection",
          why: "Selection filters rows, and reduces the columns never — that is projection's job.",
        },
        {
          text: "keep only the named columns",
          answer: "projection",
          why: "Projection chooses which attributes appear in the result.",
        },
        {
          text: "combine the rows of two tables using a matching column",
          answer: "join",
          why: "A join matches rows across tables on a shared key.",
        },
        {
          text: "sort the result into ascending order by one column",
          answer: "not standard relational algebra; ordering is done in SQL with ORDER BY",
          why: "Classical relational algebra has no ordering operation, which is a deliberate choice because relations are unordered.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`In relational algebra, which operation ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Name the operation", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Selection filters rows, projection filters columns, join combines tables.",
      });
    },
  },
  {
    key: "cs-sql-statement",
    base: 0.4,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        { text: "retrieve the names and email addresses of all customers over 18", answer: "SELECT name, email FROM Customer WHERE age > 18" },
        { text: "add a new row to the Customer table", answer: "INSERT INTO Customer (name, email) VALUES (...)" },
        { text: "change the email address of one existing customer", answer: "UPDATE Customer SET email = ... WHERE id = ..." },
        { text: "remove a customer who has asked to be deleted", answer: "DELETE FROM Customer WHERE id = ..." },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which SQL statement would you use to ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [
          step("Choose the verb", `**${s.answer}**`),
          step("Why", "SELECT reads, INSERT adds, UPDATE changes, DELETE removes. WHERE limits which rows are affected."),
        ],
        takeaway: "The four verbs cover everything: SELECT, INSERT, UPDATE, DELETE.",
      });
    },
  },
  {
    key: "cs-switching-mode",
    base: 0.3,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "data is split into packets that each carry a header with source, destination and sequence information",
          answer: "packet switching",
          why: "A packet header carries what the network needs to route and reassemble the data.",
        },
        {
          text: "a dedicated path is reserved for the whole conversation and nobody else can use that bandwidth",
          answer: "circuit switching",
          why: "Circuit switching guarantees a fixed route and bandwidth for the duration.",
        },
        {
          text: "the largest payload a packet can carry before it has to be split, set by the underlying protocol",
          answer: "MTU, the maximum transmission unit",
          why: "A packet larger than the MTU must be fragmented or rejected.",
        },
        {
          text: "a packet arrives out of order and the receiver must reorder it using the sequence numbers in the header",
          answer: "packet switching",
          why: "Independent packets take different routes, so sequencing is the receiver's job.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which term matches: ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Answer", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Packet switching shares links and needs headers. Circuit switching reserves a path.",
      });
    },
  },
  {
    key: "cs-network-hardware",
    base: 0.4,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        {
          text: "it connects two different networks together and decides which way to send a packet",
          answer: "a router",
          why: "A router forwards packets between networks using an IP address.",
        },
        {
          text: "it connects devices within one local network and sends frames using MAC addresses",
          answer: "a switch",
          why: "A switch operates at the data link layer and learns which port each device is on.",
        },
        {
          text: "it links two LANs using addresses at the data link layer, so the devices look as if they are on one network",
          answer: "a bridge",
          why: "A bridge joins LAN segments at layer 2, reducing unnecessary traffic between them.",
        },
        {
          text: "it converts a digital signal into one a telephone line can carry, and back again",
          answer: "a modem",
          why: "Modulation is the job of a modem, modulator and demodulator.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which piece of network hardware ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Identify it", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Router = between networks, IP. Switch = within a LAN, MAC. Bridge = joins LANs. Modem = analogue conversion.",
      });
    },
  },
  {
    key: "cs-client-vs-server-side",
    base: 0.4,
    span: 1.5,
    build: ({ rng }) => {
      const items = [
        {
          text: "the code runs in the user's browser and the user can view and alter it with the browser's developer tools",
          answer: "client-side",
          why: "Client-side code is delivered to the browser, so it is visible to the user and cannot be trusted.",
        },
        {
          text: "the code runs on the web server, so the user never receives it and it can hold secrets such as passwords",
          answer: "server-side",
          why: "Server-side code never reaches the client, which is why it can hold credentials safely.",
        },
        {
          text: "a login page checks a password with JavaScript in the browser before sending anything",
          answer: "client-side, and it is a security flaw",
          why: "Client-side checks can be bypassed by editing the page, so authentication must be verified on the server.",
        },
        {
          text: "an email confirmation link is generated by the server and the result is stored server-side",
          answer: "server-side",
          why: "The state must be held somewhere the user cannot edit, which means the server.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which is true of this: ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Answer", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "Never trust the client. Anything secret or security-relevant has to be checked server-side.",
      });
    },
  },
  {
    key: "cs-session-cookie",
    base: 0.7,
    span: 1.4,
    build: ({ rng }) => {
      const items = [
        {
          text: "HTTP is stateless, so the server must send something with each request to identify a returning user",
          answer: "a cookie or session token",
          why: "A cookie lets the server recognise the user across separate, otherwise unconnected requests.",
        },
        {
          text: "a shopping basket is remembered between two visits to the site without the pages being a single continuous session",
          answer: "a cookie or session token",
          why: "The basket is held against the token the browser returns on the next request.",
        },
        {
          text: "the server can tell each user apart even though the protocol itself keeps no memory between requests",
          answer: "state is being maintained with sessions",
          why: "That is exactly the gap sessions exist to fill.",
        },
        {
          text: "the page could read a user's banking details directly from the HTML the server sent",
          answer: "not necessarily; the HTML only carries whatever the server chose to include",
          why: "Client-side state is whatever the page was sent. Secrets must never be put there.",
        },
      ] as const;
      const s = rng.pick(items);
      return choiceQuestion(`Which statement about state is correct: ${s.text}?`, s.answer, rng.sample(items.filter((x) => x.answer !== s.answer), 3).map((x) => x.answer), {
        rng,
        marks: 2,
        solution: [step("Answer", `**${s.answer}**.`), step("Why", s.why)],
        takeaway: "HTTP remembers nothing. Sessions and cookies add the memory, and the server holds the real state.",
      });
    },
  },
  {
    key: "cs-lifecycle-choice",
    base: 0.3,
    span: 1.5,
    build: ({ rng }) => {
      const scenarios = [
        {
          text: "the requirements are fully understood and fixed before any code is written",
          answer: "waterfall",
          why: "Waterfall completes each stage in order and only then moves on, which suits fixed requirements.",
        },
        {
          text: "the customer is working in the team and releases are made every two weeks",
          answer: "extreme programming",
          why: "XP is an agile method built around short cycles, pair programming and the customer on the team.",
        },
        {
          text: "the risk is high and each loop brings the design closer before anything is built",
          answer: "the spiral model",
          why: "The spiral model repeats design, build, test and review, tightening the design each time round.",
        },
      ] as const;
      const s = rng.pick(scenarios);
      return choiceQuestion(
        `A project has ${s.text}. Which lifecycle or methodology fits best?`,
        s.answer,
        ["waterfall", "extreme programming", "the spiral model"].filter((x) => x !== s.answer).slice(0, 2),
        {
          rng,
          marks: 3,
          solution: [step("Match the method to its strength", s.why)],
          takeaway:
            "Waterfall suits fixed requirements. XP suits rapid iteration with the customer. The spiral model suits high risk and repeated design.",
        },
      );
    },
  },
  {
    key: "cs-normalisation",
    base: 1.3,
    span: 1.5,
    build: ({ rng }) => {
      const questions = [
        {
          text: "A table repeats groups of columns, such as three columns all holding a different phone number for the same customer.",
          answer: "1NF",
          why: "1NF requires atomic values: one value per cell. Repeating columns are removed into a separate table.",
        },
        {
          text: "A table is in 1NF, but a non-key column depends on only part of a composite key.",
          answer: "2NF",
          why: "2NF removes a partial dependency by splitting the table so each key identifies a row on its own.",
        },
        {
          text: "A table is in 2NF, but a non-key column depends on another non-key column rather than on the key.",
          answer: "3NF",
          why: "3NF removes a transitive dependency: everything must depend on the key, the whole key, and nothing but the key.",
        },
      ] as const;
      const q = rng.pick(questions);
      return choiceQuestion(
        `A relational table has this problem: ${q.text} Which normal form does fixing it produce?`,
        q.answer,
        ["1NF", "2NF", "3NF"].filter((x) => x !== q.answer).slice(0, 2),
        {
          rng,
          marks: 3,
          solution: [
            step("Recall each normal form", "1NF is atomic values. 2NF is no partial dependencies. 3NF is no transitive dependencies."),
            step("Apply it", q.why),
          ],
          takeaway:
            "1NF: one value per cell. 2NF: no partial dependency on a composite key. 3NF: no transitive dependency on a non-key column.",
        },
      );
    },
  },
  {
    key: "cs-database-key",
    base: 0.6,
    span: 1.4,
    build: ({ rng }) => {
      const keys = [
        {
          name: "primary key",
          job: "uniquely identifies each record in the table",
        },
        {
          name: "foreign key",
          job: "links a record in one table to the primary key of a record in another",
        },
      ] as const;
      const correct = rng.pick(keys);
      return choiceQuestion(
        `In a relational database, which key ${correct.job}?`,
        correct.name,
        correct.name === "primary key" ? ["foreign key", "secondary index"] : ["primary key", "secondary index"],
        {
          rng,
          marks: 2,
          solution: [
            step("Separate the two", "A **primary key** uniquely identifies a record. A **foreign key** points at another table's primary key, which is how tables are joined."),
            step("Apply it", `Here it is the **${correct.name}**.`),
          ],
          takeaway:
            "Primary key = identifies a record within its table. Foreign key = references a record in another table.",
        },
      );
    },
  },
  {
    key: "cs-network-type",
    base: -0.6,
    span: 1.3,
    build: ({ rng }) => {
      const types = [
        { name: "LAN", example: "a school or office connecting its own computers" },
        { name: "WAN", example: "a company linking sites in different countries" },
        { name: "client-server", example: "a web server that many users' browsers request pages from" },
        { name: "peer-to-peer", example: "a file-sharing network where every computer is both client and server" },
      ] as const;
      const t = rng.pick(types);
      const others = types.filter((x) => x.name !== t.name);
      return choiceQuestion(
        `Which network type best describes ${t.example}?`,
        t.name,
        rng.sample(others, 3).map((x) => x.name),
        {
          rng,
          marks: 2,
          solution: [
            step("Weigh scale and structure", "A LAN is small and local. A WAN spans large distances, usually over the internet. Client-server centralises resources; peer-to-peer shares them."),
            step("Apply it", `${t.example} is **${t.name}**.`),
          ],
          takeaway:
            "LAN = local and small. WAN = across distance. Client-server = one central machine. Peer-to-peer = every machine does both jobs.",
        },
      );
    },
  },
  {
    key: "cs-http-status",
    base: 0.5,
    span: 1.6,
    build: ({ rng }) => {
      const codes = [
        { code: 200, meaning: "the request succeeded" },
        { code: 404, meaning: "the requested resource was not found" },
        { code: 500, meaning: "the server hit an unexpected error" },
        { code: 301, meaning: "the resource has moved permanently to a new URL" },
      ] as const;
      const c = rng.pick(codes);
      const others = codes.filter((x) => x.code !== c.code);
      return choiceQuestion(
        `A browser sends a request and the server responds with **${c.code}**. What does that status code tell the user?`,
        c.meaning,
        rng.sample(others, 3).map((x) => x.meaning),
        {
          rng,
          marks: 3,
          solution: [
            step(
              "Use the class",
              "2xx means success. 3xx is a redirect. 4xx is a client error. 5xx is a server error.",
            ),
            step("Apply it", `${c.code} falls in the ${String(c.code)[0]}xx class, so it means ${c.meaning}.`),
          ],
          takeaway:
            "2xx success, 3xx redirect, 4xx client error, 5xx server error. 404 is missing, 500 is a server fault.",
        },
      );
    },
  },
  {
    key: "cs-protocol-layering",
    base: 1.2,
    span: 1.4,
    build: ({ rng }) => {
      const layers = [
        { name: "TCP", job: "reassembles packets into the correct order and makes the connection reliable" },
        { name: "IP", job: "routes packets between networks using addresses" },
        { name: "HTTP", job: "requests and returns web pages" },
        { name: "DNS", job: "turns a domain name into an IP address" },
      ] as const;
      const l = rng.pick(layers);
      return choiceQuestion(
        `Which protocol or service ${l.job}?`,
        l.name,
        rng.sample(layers.filter((x) => x.name !== l.name), 3).map((x) => x.name),
        {
          rng,
          marks: 2,
          solution: [
            step("Place it in the stack", "DNS resolves names, HTTP is the web protocol, TCP gives reliable ordered delivery, and IP routes packets."),
            step("Apply it", `${l.job} is **${l.name}**.`),
          ],
          takeaway: "DNS resolves names, HTTP requests pages, TCP delivers reliably, IP routes.",
        },
      );
    },
  },
  {
    key: "cs-box-model",
    base: 0.7,
    span: 1.3,
    build: ({ rng }) => {
      const properties = [
        "padding",
        "border",
        "margin",
        "content",
      ] as const;
      const p = rng.pick(properties);
      const inside = p === "content" || p === "padding" || p === "border";
      return choiceQuestion(
        `In the CSS box model, the **${p}** area is ${inside ? "inside" : "outside"} the border.`,
        inside ? "inside the border" : "outside the border",
        inside ? ["outside the border", "not part of the box at all"] : ["inside the border", "not part of the box at all"],
        {
          rng,
          marks: 2,
          solution: [
            step(
              "Order the box",
              "From the inside out: content, then padding, then border, then margin.",
            ),
            step("Apply it", `**${p}** is ${inside ? "inside" : "outside"} the border.`),
          ],
          takeaway:
            "Inside the border: content, padding. Outside the border: margin. Padding is inside the box and pushes the content in; margin is outside and separates boxes.",
          context: "Margin does not affect the element's own size, only the space around it.",
        },
      );
    },
  },
];

// ================================================================ registration

/*
  Registration.

  Every chapter is wired to the generator set that matches its own specification
  content. The previous version mapped 1.1.1 "Structure and function of the
  processor" to the number-representation templates, which is why the processor
  chapter asked about bits, and gave 1.1.2 and 1.1.3 the same wrong set.

  Chapter ids whose numbers do not exist in the specification (ocr-p1, ocr-2.2.3
  and so on) are deliberately not registered: a generator registered against an
  id no chapter owns can never be selected, so it is dead weight that also makes
  the coverage report overstate how much content a chapter has.
*/

/*
  Chapter registrations.

  These were originally one shared pool per topic area, which passed a coverage
  check while being wrong: a learner on "Databases" could be asked about the box
  model, and one on "Web technologies" about a deadlock. Passing the chapter title
  to a filter built from the chapter's own spec content is the fix, and the
  template-level topic test in tests/difficulty-and-topics.test.ts is what stops
  it drifting back.
*/

// 1.1.1 is the machine itself; 1.1.2 is the choice between processors, so the
// fetch-execute and register templates belong to the first and the CISC, RISC,
// GPU and performance templates to the second.
const processorCore = processorGenerators.filter((g) =>
  g.key.startsWith("cs-register-") || g.key.startsWith("cs-bus-") || g.key.startsWith("cs-fetch-execute-"),
);
const processorTypes = processorGenerators.filter(
  (g) =>
    g.key === "cs-cisc-risc-match" ||
    g.key === "cs-amdahl-speedup" ||
    g.key === "cs-processor-performance" ||
    g.key === "cs-gpu-multicore",
);

registerGenerators(["ocr-1.1.1"], processorCore);
registerGenerators(["ocr-1.1.2"], processorTypes);
registerGenerators(["ocr-1.1.3"], storageGenerators);

// 1.2.1 Systems software: the OS itself.
registerGenerators(
  ["ocr-1.2.1"],
  systemsGenerators.filter(
    (g) =>
      g.key === "cs-os-component-role" ||
      g.key === "cs-memory-management" ||
      g.key === "cs-scheduler-policy" ||
      g.key === "cs-interrupt-vs-polling" ||
      g.key === "cs-deadlock-conditions",
  ),
);

// 1.2.2 Applications generation: translation and testing.
registerGenerators(
  ["ocr-1.2.2"],
  systemsGenerators.filter(
    (g) =>
      g.key === "cs-translation-stage" ||
      g.key === "cs-compiler-vs-interpreter" ||
      g.key === "cs-linker-loader-library" ||
      g.key === "cs-test-level-match",
  ),
);

// 1.2.3 Software development: lifecycles, requirements and maintenance.
registerGenerators(
  ["ocr-1.2.3"],
  systemsGenerators.filter(
    (g) =>
      g.key === "cs-lifecycle-choice" ||
      g.key === "cs-agile-practice" ||
      g.key === "cs-requirements-user-vs-system" ||
      g.key === "cs-maintenance-type",
  ),
);

// 1.2.4 Types of programming language: classification, assembly and paradigms.
registerGenerators(
  ["ocr-1.2.4"],
  systemsGenerators.filter(
    (g) =>
      g.key === "cs-language-classification" ||
      g.key === "cs-addressing-mode" ||
      g.key === "cs-language-tradeoff" ||
      g.key === "cs-paradigm-match",
  ),
);

// 1.3.1 is compression, encryption and hashing. The compression and RLE
// templates live in dataTypeGenerators for historical reasons, so they are
// pulled in by key rather than duplicating them.
registerGenerators(
  ["ocr-1.3.1"],
  [...securityGenerators, ...dataTypeGenerators.filter((g) => g.key.startsWith("cs-compression") || g.key.startsWith("cs-rle"))],
);
registerGenerators(
  ["ocr-1.3.2"],
  systemsGenerators.filter((g) => g.key === "cs-database-key" || g.key === "cs-normalisation" || g.key === "cs-relational-algebra" || g.key === "cs-sql-statement"),
);
registerGenerators(
  ["ocr-1.3.3"],
  systemsGenerators.filter(
    (g) => g.key === "cs-network-type" || g.key === "cs-protocol-layering" || g.key === "cs-switching-mode" || g.key === "cs-network-hardware",
  ),
);
registerGenerators(
  ["ocr-1.3.4"],
  systemsGenerators.filter(
    (g) => g.key === "cs-http-status" || g.key === "cs-box-model" || g.key === "cs-client-vs-server-side" || g.key === "cs-session-cookie",
  ),
);

// 1.4.1 is data types. The compression and RLE templates are excluded because
// they belong to 1.3.1 and would be off-topic here.
registerGenerators(
  ["ocr-1.4.1"],
  [
    ...representationGenerators,
    ...dataTypeGenerators.filter((g) => !g.key.startsWith("cs-compression") && !g.key.startsWith("cs-rle")),
  ],
);
registerGenerators(["ocr-1.4.2"], structureDataGenerators);
// 1.4.3 is Boolean algebra, which algorithmicGenerators covers.
registerGenerators(["ocr-1.4.3"], algorithmicGenerators);
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
registerGenerators(["ocr-2.2.1", "ocr-2.2.2"], programmingGenerators);
registerGenerators(["ocr-2.3.1"], [...programmingGenerators, ...paradigmGenerators]);
