/*
  Every generator module, in one import.

  Registration is a side effect of importing a generator file, so anything that
  generates questions has to import them all. Listing them individually in the
  app, four test files and three scripts meant a new module could be registered
  in the browser and missing from the tests, which reported the chapter as having
  no content while the app happily served questions from it. Importing this
  barrel makes the list exist once.
*/

import "@/lib/generators/edexcel-maths";
import "@/lib/generators/aqa-economics";
import "@/lib/generators/aqa-extended";
import "@/lib/generators/aqa-econ-labour";
import "@/lib/generators/aqa-econ-inequality";
import "@/lib/generators/aqa-econ-macro";
import "@/lib/generators/aqa-econ-financial";
import "@/lib/generators/ocr-computer-science";