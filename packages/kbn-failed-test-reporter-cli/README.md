# @kbn/failed-test-reporter-cli

CLIs that turn CI test results into GitHub issues on `elastic/kibana`.

## `node scripts/report_failed_tests`

Reads JUnit and Scout reports of a CI job and files or updates one `failed-test` issue per
failing test. Run by `.buildkite/scripts/lifecycle/post_command.sh` after every job.

## `node scripts/check_flaky_test_issues`

Reads a flaky test report written by `node scripts/scout discover-flaky-tests`, groups the flaky
tests by file and tells, for every file, which `failed-test` issues are about it. Read-only:
nothing is filed or edited. Filing issues for the untracked suites is a separate step that does not
exist yet.

Open and closed `failed-test` issues both count. The command lists every open `failed-test` issue
and the closed ones updated in the last `--closed-since-days` (default 365) through the issues
API, about a hundred requests against the core rate limit, and matches locally. It deliberately
avoids the search API, whose 30-requests-a-minute limit is shared with every other CI job using the
same token and whose 1000-result cap and 256-character queries lose issues silently. Issues are
indexed by the file names they mention (after restoring JUnit's `path·ts` spelling), the Jest
directory in their classname and the Scout test id, so a suite is only compared with the issues
that could be about it. The matching rules then decide which suite an issue is really about:

- `suite`: it is titled `Flaky <framework> test suite: <file>`;
- `test`: a per-test issue filed by `report_failed_tests` about one of the flaky tests, by the
  Scout test id, or by the test name together with the file (for Jest, the directory in the
  classname);
- `moved`: same test and file name at another location, i.e. the file moved since;
- `file`: it only names the same file, for another test.

A test counts as flaky when, within the report window, it ran in at least `minBuilds` builds
(default 10), failed in at least `minFailedBuilds` of them (default 2) and passed at least once
or recovered on an in-run retry. Tests that never passed in the window are consistently failing
rather than flaky and are not reported.

```bash
node scripts/scout discover-flaky-tests --pipelines kibana-on-merge --lookbackDays 7 --classifications flaky
GITHUB_TOKEN=... node scripts/check_flaky_test_issues --input .scout/flaky_tests.json
```

The result is logged per suite and written as JSON to `--summary-path`. `--github-repo owner/name`
checks another repository, e.g. a sandbox. Closed issues last updated before the
`--closed-since-days` horizon never count as tracking a suite; open ones always do.
