---
navigation_title: "How we use Github"
description: "Forking, branching, committing and using labels in the Kibana GitHub repo"
---

# How we use Github

## Forking

We follow the [GitHub forking model](https://help.github.com/articles/fork-a-repo/) for collaborating on Kibana code. This model assumes that you have a remote called upstream which points to the official Kibana repo, which we’ll refer to in later code snippets.

## Branching

At Elastic, all products in the stack, including Kibana, are released at the same time with the same version number. Most of these projects have the following branching strategy:

- `main` points to the next minor version.
- `<major>.<minor>` is the previously released minor version, including patch releases.

As an example, let’s assume that the main branch is currently a not-yet-released 8.1.0. Once 8.1.0 has reached feature freeze, it will be branched to 8.1 and main will be updated to reflect 8.2.0. The release of 8.1.0 and subsequent patch releases will be cut from the 8.1 branch. At any time, you can verify the current version of a branch by inspecting the version attribute in the package.json file within the Kibana source.

The active branches and their roles are defined in `versions.json` at the repository root, categorized by `branchType`:

- `"development"` -- Branches like `main` for new features and breaking changes
- `"release"` -- Maintained release branches for backporting fixes, docs, tests, security, and dependency updates

Pull requests are made into the main branch and only backported when it is safe and appropriate.

- Breaking changes can _only_ be made to `main` if there has been at least an 18 month deprecation period _and_ the breaking change has been approved. Telemetry showing current usage is crucial for gaining approval.
- Features should not be backported to a `<major>.<minor>` branch.
- Bug fixes can be backported to a `<major>.<minor>` branch if the changes are safe and appropriate. Safety is a judgment call you make based on factors like the bug’s severity, test coverage, confidence in the changes, etc. Your reasoning should be included in the pull request description.
- Documentation changes can be backported to any branch at any time.

### Managing updates to `yarn.lock` across branches

We want to keep updates to dependencies (both transitive dependencies and direct dependencies) in sync across both `main` and `<previous major>.<last minor>` (ex: `7.17`) as much as possible.
A good rule of thumb is that most package upgrades should be backported to the `<previous major>.<last minor>` branch, though as always, exceptions may apply – if an upgrade requires significant code changes, then it might make sense to skip a backport for it.

## Commits and Merging

- Feel free to make as many commits as you want, while working on a branch.
- When submitting a PR for review, please perform an interactive rebase to present a logical history that’s easy for the reviewers to follow.
- Please use your commit messages to include helpful information on your changes, e.g. changes to APIs, UX changes, bugs fixed, and an explanation of why you made the changes that you did.
- Resolve merge conflicts by rebasing the target branch over your feature branch, and force-pushing (see below for instructions).
- When merging, we’ll squash your commits into a single commit.

### Elasticians: Commit using your `@elastic.co` email address

In order to assist with developer tooling we ask that all Elastic engineers use their `@elastic.co` email address when committing to the Kibana repo. We have implemented a CI check that validates any PR opened by a member of the `@elastic` organization has at least one commit that is attributed to an `@elastic.co` email address. If you have a PR that is failing because of this check you can fix your PR by following these steps:

 1. Ensure that you don't have any staged changes
 1. Checkout the branch for your PR
 1. Update the git config for your current repository to commit with your `@elastic.co` email:

```bash
git config user.email YOUR_ELASTIC_EMAIL@elastic.co
```

 1. Create a commit using the new email address

```bash
git commit -m 'commit using @elastic.co' --allow-empty
```

 1. Push the new commit to your PR and the status should now be green

**Note:** If doing this prevents your commits from being attributed to your Github account then make sure to add your `@elastic.co` address at [https://github.com/settings/emails](https://github.com/settings/emails).

### Rebasing and fixing merge conflicts

Rebasing can be tricky, and fixing merge conflicts can be even trickier because it involves force pushing. This is all compounded by the fact that attempting to push a rebased branch remotely will be rejected by git, and you’ll be prompted to do a pull, which is not at all what you should do (this will really mess up your branch’s history).

Here’s how you should rebase main onto your branch, and how to fix merge conflicts when they arise.

First, make sure main is up-to-date.

```bash
git checkout main
git fetch upstream
git rebase upstream/main
```

Then, check out your branch and rebase main on top of it, which will apply all of the new commits on main to your branch, and then apply all of your branch’s new commits after that.

```bash
git checkout name-of-your-branch
git rebase main
```

You want to make sure there are no merge conflicts. If there are merge conflicts, git will pause the rebase and allow you to fix the conflicts before continuing.

You can use git status to see which files contain conflicts. They’ll be the ones that aren’t staged for commit. Open those files, and look for where git has marked the conflicts. Resolve the conflicts so that the changes you want to make to the code have been incorporated in a way that doesn’t destroy work that’s been done in main. Refer to main commit history on GitHub if you need to gain a better understanding of how code is conflicting and how best to resolve it.

Once you’ve resolved all of the merge conflicts, use git add -A to stage them to be committed, and then use git rebase --continue to tell git to continue the rebase.

When the rebase has completed, you will need to force push your branch because the history is now completely different than what’s on the remote. This is potentially dangerous because it will completely overwrite what you have on the remote, so you need to be sure that you haven’t lost any work when resolving merge conflicts. (If there weren’t any merge conflicts, then you can force push without having to worry about this.)

```bash
git push origin name-of-your-branch --force
```

This will overwrite the remote branch with what you have locally. You’re done!

**Note that you should not run git pull**, for example in response to a push rejection like this:

```bash
! [rejected] name-of-your-branch -> name-of-your-branch (non-fast-forward)
error: failed to push some refs to 'https://github.com/YourGitHubHandle/kibana.git'
hint: Updates were rejected because the tip of your current branch is behind
hint: its remote counterpart. Integrate the remote changes (e.g.
hint: 'git pull ...') before pushing again.
hint: See the 'Note about fast-forwards' in 'git push --help' for details.
```

Assuming you’ve successfully rebased and you’re happy with the code, you should force push instead.

## Creating a pull request

See [Submitting a pull request](/extend/contributing/workflow/development-pull-request.md) for the next steps on getting your code changes merged into Kibana.

## Labels

The following information notes how we use GitHub labels in Kibana. Note that only internal Elasticians are able to create and assign labels to issues, but for searching purposes, the information is likely useful for external developers as well.

Many of our labels follow the pattern of `{key}:{value}`.

### Team labels

Examples: `Team:Security`, `Team:Operations`, `Team:Docs`.

These labels map the issue to the team that owns the particular area. Every issue should have at least one team label applied.

### Feature labels

Examples: `Feature:Lens`, `Feature:Cases`, `Feature:Vega`.

Feature labels break down architectural domains that are owned by a given team.

### Project labels

Examples: `Project:RuntimeFields`, `Project:MakeItSlow`.

Sometimes issues span multiple teams, that is often when Project labels are more appropriate. To avoid too much noise,
these should be used for high visibility projects. Try not to use project labels for small, single team projects, where a team
and feature label would be applicable. Use your best judgement when determining whether to add a new project label.

### Needed For labels (`NeededFor:{Team}`)

Examples: `NeededFor:APM`, `NeededFor:AppServices`.

We use these labels to help us organize internal dependencies. An issue with the labels
`NeededFor:APM` and `Team:AppServices` means APM has a dependency on the App services team. The owning team
can filter on these labels during roadmap prioritization, and the dependent team can use these labels to
search and view the status of its dependencies. To avoid noise, use these labels for high priority requests that
need to be taken into account in roadmap planning. A low priority item that can be prioritized along with
other community requests does not need this label, as part of its usefulness is helping teams wade through the noise
of external feature requests.

### Version labels

Examples: `v7.9.2`, `v8.0`

We use version labels on PRs to indicate which versions a PR will be merged into. For issues,
teams use these labels inconsistently. On a bug, it might mean the version the bug was found in, or
it might mean the version the team is tentatively planning to merge a fix.

Consult the owning team if you have a question about how a version label is meant
to be used on an issue.

### Issue type and workflow labels

These labels categorize the type of work. For example:

- `blocked`: Indicates the issue is currently blocked
- `blocker`: Indicates that we should not release the product at the next
   proposed version without the issue being resolved
- `bug`: Indicates an unexpected problem or unintended behavior
- `discuss`: Indicates that an issue is a discussion topic
- `docs`: Indicates improvements or additions to documentation
- `enhancement`: Indicates new feature or enhancement requests
- `meta`: Indicates that the issue tracks tasks related to a project
- `triage-needed`: Indicates that someone from the area team needs to investigate.
- `needs_team`: Indicates that issue is missing area team label. All issues should be assigned to one or more area teams for follow up. This label is assigned automatically and removed automatically once a team label is added.

These labels affect whether your PR appears in the release notes (that is to say,
it's notable and affects our users) and which section it appears in. For example:

- `release_note:breaking`: Specifies a breaking change and adds the PR to the Breaking changes section in the release notes
- `release_note:deprecation`: Specifies a deprecated feature and adds the PR to the Deprecations section in the release notes
- `release_note:enhancement`: Specifies a feature enhancement and adds the PR to the Enhancements section in the release notes
- `release_note:feature`: Specifies a new feature and adds the PR to the  Features section in the release notes
- `release_note:fix`: Specifies a bug fix and adds the PR to the Bug fixes section in the release notes
- `release_node:plugin_api_changes`: Specifies a changes to the plugin API and adds the PR to the Plugin API changes page in the Developer Guide
- `release_note:skip`: Omits the PR from release notes

The following labels are related to backporting PRs:

- `backport:version`: Automatically backport this PR (to the branches related to
   version labels) after it's merged. Requires adding desired target versions labels.
- `backport:all-open`: Automatically backport to all generally available versions. This functionally is equivalent to backport:prev-major at the time of writing.
- `backport:skip`: This PR does not require backporting.
- `backport`: This PR was backported (added by CI).

If automated backporting fails (e.g. due to merge conflicts), you can backport manually:

```bash
# Interactive backport (select commits and branches)
node scripts/backport

# Backport a specific commit to specific branches
node scripts/backport --sha <commit-sha> --branch 9.2 --branch 9.1
```

## Release notes

{{kib}} publishes [Release Notes](/release-notes/index.md) for major and minor releases. Release Notes summarize merged PRs in user-friendly language. A script generates these notes by collecting merged PRs for each release.

### Writing release notes text

Release notes text is sourced from your PR title or a single paragraph in the PR description.

To provide a custom paragraph, use a `Release note:` or `## Release note` header in your PR description, followed by the text.

When you create the release notes text, use the following best practices:

- Use active voice.
- Use sentence case.
- When you create a PR that adds a feature, start with `Adds`.
- When you create a PR that improves an existing feature, start with `Improves`.
- When you create a PR that fixes existing functionality, start with `Fixes`.
- When you create a PR that deprecates functionality, start with `Deprecates`.