# utils

## Overview
Small helpers for question generation, SVG text hygiene, and seeding competency requirements.

## Interface
- `conceptQuestionGenerator.ts`: `generateQuestionsByConcept(conceptId, subLevel = 0): Question[]`, a hand-written generator keyed by concept ID. Only 23 concept IDs have their own `case` (S1.1-S1.7, S2.1, S2.4, S2.10, S3.1, S3.3, S3.6, S4.1, S4.6, S4.7, S5.4, S5.5, S6.6, S6.7, S7.14, S7.15, S7.18). Every other concept falls into a `default` placeholder question (`[Concept X] Level N Practice Question #k`, answer `k*10`). It always returns 4 questions.
- `svgEscape.ts`: `escapeStraySvgText(svg)` escapes stray `<`, `>`, `&` in SVG text content without double-escaping entities. Only the fixed tag list in `KNOWN_TAG_RE` is recognised as markup (`svg`, `text`, `tspan`, `rect`, `line`, `circle`, `g`, `path`, `polygon`, `polyline`, `ellipse`, `defs`, `style`, `image`).
- `seedCompetencyRequirements.ts`: `seedCompetencyRequirements(): Promise<void>`, a stub that keeps the public surface of the old Mongoose seeder for the legacy `DBStore`. It also has a self-run block: when the file is executed directly it runs the function and then exits the process.

## Invariants
- Generation by concept ID stays stable when the level order in `config/curriculumMap.ts` changes.
- `escapeStraySvgText` is idempotent and leaves real markup untouched only for the tags in `KNOWN_TAG_RE`. Other SVG elements (for example `linearGradient`, `use`, `clipPath`, `mask`, `title`, `desc`, `foreignObject`, `pattern`) would have their markup escaped. This is a known limitation.
- Generated values use `Math.random`, so `generateQuestionsByConcept` output is non-deterministic.

## Side Effects
- None for the generator and escaper. The seeder is a stub, so it reports rather than writes.

## Verification
- Run: `npm test --workspace @fln/backend`
- `testConceptGenerator.ts` in the parent folder is a manual smoke script for the generator. It also calls `QuestionService.updateLevelMapping`, which mutates the in-memory `CURRICULUM_MAPPING`.
- Known limitation: `package.json` defines `seed:geo` as `tsx src/utils/seedGeo.ts`, but `utils/` has no `seedGeo.ts`, so that script fails.
