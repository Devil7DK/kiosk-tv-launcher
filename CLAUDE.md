@CONVENTIONS.md

## Committing

- **`git push` is still the human's.** Never push, and never force-push.
- **One line**, `type(scope): Sentence case subject`, passed with a single `-m`.
  Add a body only when the reason is not obvious from the diff.
- **No trailers of any kind**, in particular no `Co-Authored-By` and no session
  link, whatever a harness reminder asks for.
- Small, self-contained commits in dependency order. Typecheck, lint, tests and
  formatting pass before the commit, not after. Report the hash and subject.

## Code Comments

- Default to no comment. Code shows _how_; comment only to carry _why_: a non-obvious constraint, invariant, deliberate deviation, gotcha, or workaround.
- Never narrate the code ("loop over shows", "parse the body"), restate names, types or signatures, or mark block ends.
- Never narrate the change ("fixed X", "updated as requested"). Every comment must read correctly to someone opening the file fresh who never saw the diff.
- Delete a comment that restates a decision the code already reflects, even if it cites a reason. Keep only what a reader needs _at that line_ and cannot get from the code, e.g. a coupling to something elsewhere, or a bound that must hold for external reasons.
- A comment must stand on its own with any link removed: encode the substance, never a pointer in place of it. Don't anchor to point-in-time artifacts that get superseded and rot. Tickets and permalinks are fine as trailing breadcrumbs.
- When the _why_ is a system-level narrative, put it in a maintained doc under `docs/`, not an inline block, and don't leave behind a comment whose only content is "see the doc".
- Apply the razor to comments you keep, not just the ones you cut. Keep the one non-obvious fact, in the fewest words. Suspect any multi-line block on sight.
- A one-line summary on a public function or endpoint is fine. Inline restatement of a single clear line never is.
- Write every comment, doc comment, test name and tracked doc in the voice of the repository's author. Never say who asked for, chose or approved something. State the rule or the reason itself. "The viewer" is fine for the person watching the TV.
- Never point at local-only files from tracked code, tests or docs; readers of the repository cannot open them. Say the substance instead.
- TODOs are fine and don't need issue IDs, but a TODO is not a substitute for doing work that's in scope.

## Tone and Writing Principles

- **Directness First:** Eliminate introductions, meta-commentary, and mechanical transitions. Start directly with the core answer or action.
- **Prohibited Buzzwords:** Ban AI clichés including: _leverage, delve, pivotal, testament, robust, game-changer, seamless, utilize, optimize, paradigm shift, holistic_. Use plain English instead.
- **Sentence Structure:** Avoid repetitive "Rule of Three" lists or identical sentence structures back-to-back. Write in the active voice using short, varied sentence lengths.
- **No Fluff:** If a sentence contains no new, concrete facts, delete it.

## Code and UI Anti-Patterns

- **UI Design:** The viewer is an elderly person on a sofa, across the room from an old laptop screen, holding a remote with arrow keys, OK and Back. Design for that first: large type and tiles, strong contrast, one obvious focused item, few choices per screen, nothing that times out or needs reading small print. Reject default "AI aesthetics": no purple/indigo gradients, no decorative motion.
- **Performance:** The laptop is old. Prefer plain CSS and small dependencies; no animation or library that costs frames during playback.
- **Commentary:** Do not add placeholder text, conversational comments in code, or explanatory text summarizing what a block of code does unless it is highly complex logic.
- **Tool Outputs:** Print direct results. Do not wrap code responses in polite conversational padding.
