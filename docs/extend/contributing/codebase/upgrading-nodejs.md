---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/upgrading-nodejs.html
---

# Upgrading Node.js [upgrading-nodejs]

{{kib}} requires a specific Node.js version to run. When running {{kib}} from source, you must have this version installed locally.

## Step 1: Generate custom Node.js builds [_step_1_generate_custom_node_js_builds]

Before making a PR to upgrade Node.js, we must first [generate the required custom Node.js builds](#start-new-nodejs-build) matching the desired Node.js version.


## Step 2: Create PR to upgrade Node.js [_step_2_create_pr_to_upgrade_node_js]

The required version of Node.js is listed in several different files throughout the {{kib}} source code. These files must be updated when upgrading Node.js:

* [`.node-version`](https://github.com/elastic/kibana/blob/master/.node-version)
* [`.nvmrc`](https://github.com/elastic/kibana/blob/master/.nvmrc)
* [`package.json`](https://github.com/elastic/kibana/blob/master/package.json) - The version is specified in the `engines.node` field (if possible, also upgrade `@types/node` to match the new version, both under `devDependencies` and `resolutions`).
* [`WORKSPACE.bazel`](https://github.com/elastic/kibana/blob/master/WORKSPACE.bazel) - The version is specified in the `node_version` property. Besides this property, the list of files under `node_repositories` must be updated along with their respective SHA256 hashes. These can be found in the `SHASUMS256.txt` file inside the public `kibana-custom-node-artifacts` GCP bucket. Example for Node.js v20.15.1: [kibana-custom-node-artifacts/node-glibc-217/dist/v20.15.1/SHASUMS256.txt](https://storage.googleapis.com/kibana-custom-node-artifacts/node-glibc-217/dist/v20.15.1/SHASUMS256.txt)

See PR [#128123](https://github.com/elastic/kibana/pull/128123) for an example of how the Node.js version has been upgraded previously.


## Considerations with major Node.js upgrades [_considerations_with_major_node_js_upgrades]

When upgrading to a new major version of Node.js, the following extra steps must be performed:

* Compare the new Node.js versions list of supported platforms with the [Kibana Support Matrix](https://www.elastic.co/support/matrix#matrix_os). As an example, here’s the [Node.js 18 supported platform list](https://github.com/nodejs/node/blob/v18.x/BUILDING.md#platform-list). You can change which Node.js major version to view, by changing the selected branch. If Node.js has dropped support for platform still supported by Kibana, appropriate steps must be taken as soon as possible to deprecate support for this platform. This way support for it can be dropped before the currently used major version of Node.js [reaches End-of-Life](https://github.com/nodejs/release#release-schedule).


## Custom builds of Node.js [custom-nodejs-builds]

Due to Node.js 16 coming to an [early End-of-Life](https://nodejs.org/en/blog/announcements/nodejs16-eol) and Node.js 18 no longer supporting the same platforms that {{kib}} supports (most notably CentOS7/RHEL7), we cannot bundle the official Node.js binaries with the Linux distributable of {{kib}}. To keep support for these older platforms, we’re bundling the Linux distributable of {{kib}} with a [custom build of Node.js](https://github.com/elastic/kibana-custom-nodejs-builds) with extended backwards compatibility. The only difference between the offical Node.js build and our custom build, is the version of `glibc` that it’s compiled against.

### How to start a new build [start-new-nodejs-build]

To generate a new custom Node.js build, [start a new build](https://buildkite.com/elastic/kibana-custom-node-dot-js-builds#new) on our dedicated Buildkite pipeline (requires Elastic employee permissions). Give it a clear name (e.g. `Node 20.15.1`) and remember so set the custom `OVERRIDE_TARGET_VERSION` environment variable to the desired Node.js version - e.g. `OVERRIDE_TARGET_VERSION=20.15.1`. You find the "Environment Variables" field by expanding "Options >" in the "New Build" dialog.



## Backporting [_backporting]

The following rules are not set in stone. Use best judgement when backporting.

### Node.js patch upgrades [_node_js_patch_upgrades]

Typically, you want to backport Node.js **patch** upgrades to all supported release branches that run the same **major** Node.js version (which currently is all of them, but this might change in the future):

* If the current release is 8.1.x, the main PR should target `main` and be backported to `7.17` and `8.1` (GitHub tag example: `backport:all-open`).


### Node.js minor upgrades [_node_js_minor_upgrades]

Typically, you want to backport Node.js **minor** upgrades to the previous major {{kib}} release branch (if it runs the same **major** Node.js version):

* If the current release is 8.1.x, the main PR should target `main` and be backported to `7.17`, while leaving the `8.1` branch as-is (GitHub tag example: `auto-backport` + `v7.17.13`).


### Node.js major upgrades [_node_js_major_upgrades]

Typically, you want to backport Node.js **major** upgrades to the previous major {{kib}} release branch:

* If the current release is 8.1.x, the main PR should target `main` and be backported to `7.17`, while leaving the `8.1` branch as-is (GitHub tag example: `auto-backport` + `v7.17.13`).



## Upgrading installed Node.js version [_upgrading_installed_node_js_version]

The following instructions expect that [nvm](https://github.com/nvm-sh/nvm) is used to manage locally installed Node.js versions.

Run the following to install the new Node.js version. Replace `<version>` with the desired Node.js version:

```bash
nvm install <version>
```

To get the same global npm modules installed with the new version of Node.js as is currently installed, use the `--reinstall-packages-from` command-line argument (replace `<old-version>` with the source version):

```bash
nvm install <version> --reinstall-packages-from=<old-version>
```

If needed, uninstall the old version of Node.js by running the following. Replace `<old-version>` with the full version number of the version that should be uninstalled:

```bash
nvm uninstall <old-version>
```

Optionally, tell nvm to always use the "highest" installed version of a given major. Replace `<major>` with the desired major version number:

```bash
nvm alias default <major>
```

Alternatively, include the full version number at the end to specify a specific default version.


