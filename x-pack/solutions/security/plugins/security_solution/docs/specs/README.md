# Specs

This folder contains the specs for the features of Security Solution.

A spec is the source of truth for a feature: it captures the assumptions, requirements, and expected behavior, and it defines the scenarios we validate against (the test plan). A spec is written before the code and is used to:

- align on scope and surface missing requirements early — the earlier the better;
- guide implementation, including feeding AI agents/skills that build the code and the tests;
- give reviewers a clear reference to confirm the work matches intent;
- record what must be verified manually vs. what is covered by automated testing.

## Living specs

Specs are **living documents**. They are not written once and forgotten — they are kept up to date as a feature is built, changed, extended, or fixed. Whenever behavior or scope changes, update the spec so the spec always reflects how the feature actually works today.

Focus a spec on the architectural design of the feature. Keep the spec itself succinct and let the test plan be the thorough part — the goal is a document that stays comprehensible, not one that balloons in size.

## When to write a spec

- Any new feature.
- New API endpoints
- Rewrites or significant reworks of an existing feature.

## Process

The team has aligned on the following flow:

1. Ticket is assigned.
2. The author writes the spec/test plan and opens a PR for it.
3. The spec PR is reviewed and merged — this aligns everyone on scope and catches missing requirements before implementation.
4. The implementation PR is opened; the reviewer confirms the work aligns with the spec, and the spec is updated in that PR if behavior changed.
5. Both the author and the reviewer pull down the implementation PR and do exploratory testing before it merges.

Testing that typically lives outside the spec's scenarios — call it out explicitly in the spec when relevant:

- Performance testing.
- Exploratory testing.

Anything that cannot be covered by automated testing should be noted in the spec so it isn't silently missed.

## Folder structure

The folder is first split into a folder per owning team, for example:

- `radar`
- etc

And then each team folder is split into feature areas, for example:

- `radar`
  - `alerts`
  - `prebuilt_rules`
  - `rule_management`
  - etc

Within each feature area, you can organize specs as you like, for example:

- you might want to have a folder per feature, if your features are large and you have multiple specs per feature
- or you might want to have a plain list of specs if features are relatively small

## Folder ownership

Each team folder should be owned by that GitHub team in the `.github/CODEOWNERS` file.

## Spec structure

Some examples for reference:

- [Spec & test plan template](./spec_plan_template.md).
- [Prebuilt rules spec](./radar/prebuilt_rules/prebuilt_rules.md).

Feel free to tune the structure whenever it makes sense and improves readability or maintainability of your spec: add more sections to `Useful information`, add more top-level sections in addition to `Requirements` and `Scenarios`, etc.

## Authoring a spec with the generator skill

Specs can also be auto-generated from a GitHub issue using the `test-plan-generator` agent skill — it reads the issue, its parent epic, all sub-issues, linked PRs, and Figma designs, then drafts a structured plan you can review and publish as a GitHub comment.

- End-user setup, daily usage, and troubleshooting: [`test_plan_generator.md`](../testing/test_plans/test_plan_generator.md).
- Skill source (agent instructions and references): [`../../.agents/skills/test-plan-generator/`](../../.agents/skills/test-plan-generator/).
