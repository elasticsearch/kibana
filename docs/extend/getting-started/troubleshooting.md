---
navigation_title: "Troubleshooting"
description: "A collection of tips for working around strange issues."
---

# Troubleshooting

### Bootstrap failures

If `yarn kbn bootstrap` fails, try the following in order:

1. Clear caches and force reinstall dependencies:

```bash
yarn cache clean && yarn kbn clean
yarn kbn bootstrap --force-install
```

2. If running as root (e.g. in a container):

```bash
yarn kbn bootstrap --allow-root
```

3. Full repository reset (last resort):

```bash
git clean -fdx
yarn kbn reset
yarn kbn bootstrap --force-install
```

### Typescript issues

When switching branches, sometimes the TypeScript cache can get mixed up and show some invalid errors. If you run into TypeScript issues (invalid errors, or if it's taking too long to build types), here a few things to try.

1. Build TypeScript references with the clean command.

```
node scripts/type_check.js --clean-cache
```

2. Restore your repository to a totally fresh state by running `git clean`

```
# dry-run the clean to see what will be deleted
git clean -fdxn -e /config -e /.vscode

# review the files which will be deleted, consider adding some more excludes (-e)
# re-run without the dry-run (-n) flag to actually delete the files
```

### search.check_ccs_compatibility error

If you run into an error that says something like:

```
[class org.elasticsearch.action.search.SearchRequest] is not compatible version 8.1.0 and the 'search.check_ccs_compatibility' setting is enabled.
```

it means you are using a new Elasticsearch feature that will not work in a CCS environment because the feature does not exist in older versions. If you are working on an experimental feature and are okay with this limitation, you will have to move the failing test into a special test suite that does not use this setting to get ci to pass. Take this path cautiously. If you do not remember to move the test back into the default test suite when the feature is GA'ed, it will not have proper CCS test coverage.

We added this test coverage in version `8.1` because we accidentally broke core Kibana features (for example, when Discover started using the new fields parameter) for our CCS users. CCS is not a corner case and (excluding certain experimental features) Kibana should always work for our CCS users. This setting is our way of ensuring test coverage.

Please reach out to the [Kibana Operations team](https://github.com/orgs/elastic/teams/kibana-operations) if you have further questions.

### Minified React errors

If you experience minified React errors and want to expand them to their full error messages you will currently need to rebuild the `@kbn/ui-shared-deps-npm` package using "development" mode instead of "production", which can be done by modifying the corresponding line in `packages/kbn-ui-shared-deps-npm/webpack.config.js` and make sure to run `yarn kbn bootstrap` afterwards:

```
-    mode: 'production',
+    mode: 'development',
```