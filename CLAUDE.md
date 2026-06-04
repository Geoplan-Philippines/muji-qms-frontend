# Claude Code Project Instructions

## Required Project Rules

Before making changes, read and follow:

- `.claude/rules/angular-best-practices.md`

## Skills

Project-specific skills are located in:

- `.claude/skills`

Use the relevant skill when the task matches the skill description.

## PR Review Behavior

During PR reviews:

* focus on correctness
* detect regressions
* detect breaking changes
* identify performance concerns
* identify security concerns
* identify maintainability issues
* suggest concise improvements

## PR Review Behavior

During PR reviews, DO NOT raise comments for:

* Missing unit tests, integration tests, e2e tests. As this project currently not following strict TDD workflow.
* graphify-out/** generated artifacts and are intentionally committed to the repo.
