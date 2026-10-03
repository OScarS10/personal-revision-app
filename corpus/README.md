# Marking corpus

Training data for the automatic marker, and the boundary around what may be
trained on.

## Why there is no data committed here

Exam board papers, mark schemes and examiner reports are copyrighted. They may
not be redistributed in this repository, so none are committed. The corpus is
built at runtime into `.cache/corpus/corpus.json`, which is gitignored.

This is not a limitation to work around later. Training on a board's material
without a licence is a licensing question, and the engineering response is to
keep the material out of the repository and let whoever holds the rights decide
what the model may learn from.

If you have material you are entitled to use — your own institution's marked
work, an openly licensed dataset, or data you have written yourself — add it.

## Adding a source

1. Copy `sources.example.json` to `sources.json`.
2. List each source with its `licence` and whether it is `redistributable`.
   Board-owned material belongs at `redistributable: false`.
3. Run the fetch:

   ```sh
   npx tsx scripts/fetch-mark-corpus.ts
   ```

`kind: "local-file"` reads a JSON file from the repo and is the easiest way to
start. `kind: "json-array"` fetches a URL that returns JSON.

Each record needs a prompt, a reference answer a human marked, and the scheme
points with whether each was awarded:

```json
{
  "id": "example-1",
  "question": "Define opportunity cost.",
  "model_answer": "The value of the next best alternative given up when a choice is made.",
  "marking": [
    { "label": "states what it is", "marks": 1, "awarded": true },
    { "label": "refers to the next best alternative", "marks": 1, "awarded": true }
  ]
}
```

## Training and trusting

```sh
npx tsx scripts/train-mark-model.ts
```

The script cross-validates the model per point type and prints precision for
each. A point type is only allowed to be marked automatically if its measured
precision clears the bar in `src/lib/mark-model.ts`.

Expect nothing to clear the bar on a small corpus. That is the intended
behaviour: the model is not trusted to award marks until it is measured to be
reliably right, and until then every mark stays with the learner.