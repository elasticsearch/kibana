# failed tests reporter

A little CLI that runs in CI to find the failed tests in the JUnit reports, then create/update github issues for each failure.

## Cascading failures

The first Mocha timeout aborts a whole FTR config run, and every hook still left in the suite tree
then fails immediately with a forced 1ms timeout. The FTR JUnit reporter tags those trailing entries
with `cascading-failure="true"`, and this CLI keeps them out of GitHub and out of the failure report
artifacts: they are listed on the report of the failure that caused the abort instead. They are still
present in the JUnit report and indexed to Elasticsearch, flagged as `cascading`.

## Test this script locally

To fetch some JUnit reports from a recent build on CI, visit its `Google Cloud Storage Upload Report` and execute the following in the JS Console:

```js
copy(`wget -x -nH --cut-dirs 5 -P "target/downloaded_junit" "${Array.from($$('a[href$=".xml"]')).filter(a => a.innerText === 'Download').map(a => a.href.replace('https://storage.cloud.google.com/', 'https://storage.googleapis.com/')).join('" "')}"`)
```

This copies a script to download the reports, which you should execute in the root of the Kibana repository.

Next, run the CLI in `--no-github-update` mode so that it doesn't actually communicate with Github and `--no-report-update` to prevent the script from mutating the reports on disk and instead log the updated report.

```sh
node scripts/report_failed_tests.js --verbose --no-github-update --no-report-update target/downloaded_junit/**/*.xml
```

Unless you specify the `GITHUB_TOKEN` environment variable requests to read existing issues will use anonymous access which is limited to 60 requests per hour.