---
navigation_title: "Managing third-party dependencies"
description: "Expectations for working with third-party dependencies"
---

# Managing third-party dependencies

## Third-party dependencies

Third-party dependencies allow us to leverage the broader web development community to efficiently bring ideas to life, without having to re-invent the wheel.
This is an attractive proposition, but using someone else's code does not absolve us of responsibility.

The Kibana project is not just the code we commit to the repo but rather the combined total of all of the source code from our own repo and all of the external dependencies we rely on. When a user encounters a deficiency in Kibana, it matters not whether the root cause is in code we've written or external code we depend on. Additionally, relying on a dependency is a considerable expense in terms of cognitive burden, maintenance overhead, and risk.

Except for highly specialized functionality, dependencies often do more harm in the long term than their short term benefits justify. Always be critical of new external dependencies being added to the project, and frequently re-evaluate the use of existing dependencies.

When the use of an external dependency is necessary, ensure there is sufficient integration testing in Kibana to ensure it continues to operate the way we'd expect when we change the consuming code in Kibana or upgrade the dependency code.

Except in specific cases where widespread consensus was gained and clear ownership is established, third party dependencies should not be exposed directly as features of Kibana, whether it be through the UI, HTTP API, or programmatic interfaces.

:::{note}
Treat third-party code as if it was your own. We share the responsibility for the efficacy, performance, and security of both the code we integrate and the code we develop.
:::

## Adding new dependencies

Looking for a dependency that isn't already available in Kibana? There are a few things to keep in mind before adding a new dependency.

First, be sure you have read and are familiar with our [Developer principles](../principles/developer-principles.md). In particular, **Be wary of dependencies**
and **Prefer one way to do things** provide an overview of how we approach this question.

In general, we have a bias toward **not** adding new dependencies unless there is a compelling reason to do so, as we want to
minimize Kibana's overall complexity.

Should you find yourself evaluating a new dependency, here are some specific things to ask yourself:

1. **Is there already another dependency that offers similar functionality?** If so, adding a new dependency may not be necessary.
Prefer one way to do things and use what's already there, unless there is an important reason not to do so.
2. **Does this dependency appear to be well-maintained?** A dependency that hasn't been updated in years is usually more of a
liability than an asset. Make sure the dependency has recent activity, that bugs and security vulnerabilities appear to be addressed
in a timely manner, and that there is active participation from the maintainers and community.
3. **How large is the dependency?** For client-side plugins, heavy dependencies can have a real impact on user experience,
especially if they are included in the initial page bundle and not loaded asynchronously. In some cases it might make more sense
to roll your own rather than include a bloated dependency, especially if you are only using a single piece of functionality.
4. **Does this dependency have a license that's compatible with Kibana's?** Most common open source licenses such as BSD, MIT,
and Apache 2.0/1.1 are okay to use with Kibana. Others may not be, or may require special attribution.
5. **Will this dependency need to be prebuilt?** Due to our build process, native module dependencies are only supported for development (`devDependencies`), and are not supported for production (`dependencies`).
6. **Am I committed to maintaining this dependency?** Once you add a dependency to the `package.json`, someone else isn't going to
keep it updated for you. That means you will be responsible for updating it regularly, keeping an eye out for security vulnerabilities,
and dealing with any breaking changes that may arise during an upgrade. Dependency ownership is tracked by the
[`renovate.json`](https://github.com/elastic/kibana/blob/main/renovate.json`) file. See the section on Dependency ownership below for more information.

If you have any questions about whether adding a dependency is appropriate, feel free to reach out to one of the following teams
on Github:

- **@elastic/kibana-tech-leads**
- **@elastic/kibana-core**
- **@elastic/kibana-operations**
- **@elastic/kibana-security**


### Dependency evaluation

To manage workload effectively during this stopgap period, the evaluation is applicable only to new third-party dependencies. 
Dependency upgrades are not considered, as reviewing them would be excessively time-consuming.

1. **Justification and context**.
    - What is this dependency used for? Briefly explain its role in your changes and the problem it solves.
    - Why is adding this specific external dependency the best approach compared to other solutions?
    - Were other options considered (e.g., using existing internal libraries/utilities, implementing the functionality directly)? If so, why was this dependency chosen over them?
    - Does Kibana have a dependency providing similar functionality? If so, why is the new one preferred?
  
  Responsible: PR author

2. **Snyk health check**. Setting the healthy threshold at 70 provides pragmatic balance: prioritizes maintenance, filters out major security risks and indicates acceptable quality. Score is calculated as a weighted mean based on maintenance, security, quality and popularity.
    - Ensure a minimum health score is >= 70 in [Snyk Advisor](https://snyk.io/advisor).
    - If the health score is below 70, a valid business justification must be provided.
  
  Responsible: PR author

3. **Vulnerability assessment**. Check vulnerability reports from Snyk for the exact dependency version, available through [Snyk Advisor](https://snyk.io/advisor).
    If vulnerabilities are present:

    - **Critical (CVSS 9.0 - 10.0)**:
      - **False positive:** Proceed to Step 4.
      - **Confirmed vulnerability:** Reject dependency.

    - **High (CVSS 7.0 - 8.9)**:
      - **False positive:** Proceed to Step 4.
      - **Confirmed vulnerability:** Reject dependency.

    - **Medium/Low (CVSS 0.0 - 6.9)**:
      - **False positive:** Proceed to Step 4.
      - **Confirmed vulnerability:** Exception can be granted if the vulnerability is confirmed to be impossible to exploit and and there is no better alternative.
  
  Responsible: PR author

4. **Handling false positives**. If a vulnerability is considered to be a false positive:
    - Clearly document why the vulnerability is considered a false positive.
    - Submit an exception request following the Vulnerability Exception Policy and Procedures.
    - The exception request must be created **before merging** the dependency.
    - Initial exception timeframe is suggested to be 30 days. If there would be no upgrade path available after a month, longer exception timeframe can be requested.
  
  Responsible: PR author

5. **Approval**. Document the entire assessment clearly, including:
    - Final health score.
    - CVSS scores of identified issues if applicable.
    - Justification for any accepted false positives if applicable.
  
  Responsible: AppEx Platform Security team

```
## Approval Summary

| **Dependency Name**   | `<dependency-name>`            |
|-----------------------|--------------------------------|
| **Version**           | `<version>`                    |
| **Snyk Health Score** | `95/100`                       |
| **CVSS Issues**       | None / High (CVSS 7.5, CVE-XXXX-XXXX) |
| **False Positives**   | Yes/No   |

### Justification / Notes:
- Brief justification or context here
- Submitted CVE exception(s)? [Yes/No]

Status: [approved/rejected]
```

## Using existing dependencies

Using an existing dependency is typically preferred over adding a new one.
Please consult with the owning team before using an existing dependency, as they may have specific guidelines or concerns about its use.

## Dependency ownership

All dependencies must be owned by at least one team. This team is responsible for ensuring the dependency is kept up to date, and for addressing any issues that arise with the dependency.
Dependency ownership is tracked in the `renovate.json` file in the root of the Kibana repository. If you are adding a new dependency, be sure to add your team as the owner in this file.

### Example configuration
Here is an example configuration for a dependency in the `renovate.json` file:

```json
  {
    //[1]
    "groupName": "my-awesome-dependency",
    "matchDepNames": [
      "my-awesome-dependency",
      "@types/my-awesome-dependency"
    ],
    // [2]
    "reviewers": [
      "team:my-team-name"
    ],
    // [3]
    "matchBaseBranches": [
      "main"
    ],
    // [4]
    "labels": [
      "Team:My-Team-Label",
      "release_note:skip",
      "backport:all-open",
      "effort:low",
      "upgrade-risk:high"
    ],
    // [5]
    "minimumReleaseAge": "7 days",
    // [6]
    "enabled": true
  }
```

[1] `groupName`: The rule group. Renovate will raise a single PR for all dependencies within a group. Consider creating logical groups to make upgrades easier to review.

[2] `reviewers`: `team:my-team-name` will correspond to a GitHub group named `@elastic/my-team-name`. This group should contain all members of the team responsible for the dependency. Multiple teams can be added as reviewers if necessary.

[3] `matchBaseBranches`: The branches that the rule will apply to. This should be set to `main` for most dependencies.

[4] `labels`: Labels to apply to the PRs created by Renovate. The `Team:My-Team-Label` label should be replaced with your team's GitHub label from the Kibana repository. Include an `effort:low|medium|high` label to indicate the level of effort required to update the codebase, and an `upgrade-risk:low|medium|high` label to indicate the level of testing required to be confident in the changes. The `release_note:skip` and `backport:all-open` labels are used to control the release process and should not be changed without first consulting the AppEx Platform Security team.

[5] `minimumReleaseAge`: The minimum age of a release before it can be upgraded. This is set to `7 days` to allow time for any issues to be identified and resolved before upgrading. You may adjust this value as needed.

[6] `enabled`: Must be set to `true` to satisfy dependency ownership requirements. Consult the AppEx Platform Security team before disabling this setting.

### Dependency ownership tooling

The `./scripts/dependency_ownership.js` script can be used to validate the `renovate.json` file and ensure that all dependencies are owned by a team.
```sh
node scripts/dependency_ownership.js

Runs a dev task

Options:
  --dependency, -d   Show who owns the given dependency
  --owner, -o        Show dependencies owned by the given owner
  --missingOwner     Show dependencies that are not owned by any team
  --outputPath, -f   Specify the output file to save results as JSON
  --failIfUnowned    Fail if any dependencies are not owned by any team
  --verbose, -v      Log verbosely
  --debug            Log debug messages (less than verbose)
  --quiet            Only log errors
  --silent           Don't log anything
  --help             Show this message
```