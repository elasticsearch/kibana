---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/external-plugin-development.html
---

# External plugin development [external-plugin-development]

::::{important}
The {{kib}} plugin interfaces are in a state of constant development.  We cannot provide backwards compatibility for plugins due to the high rate of change.  {{kib}} enforces that the installed plugins match the version of {{kib}} itself.  Plugin developers will have to release a new version of their plugin for each new {{kib}} release as a result.

::::


Most developers who contribute code directly to the {{kib}} repo are writing code inside plugins, so our [*Contributing*](/extend/contributing/index.md) docs are the best place to start. However, there are a few differences when developing plugins outside the {{kib}} repo. These differences are covered here.

## Important differences from in-repo plugins

If you are coming from the in-repo plugin docs, note the following:

* **Location.** External plugins live in a `plugins/` directory at the root of your {{kib}} checkout. This directory is gitignored — your plugin is not tracked alongside the {{kib}} sources.
* **Manifest.** External plugins use a flat `kibana.json` manifest (a different schema than the in-repo `kibana.jsonc`). Use [`node scripts/generate_plugin`](/extend/tutorials/plugin-tooling.md#automatic-plugin-generator) to scaffold one with the correct format.
* **Build.** Browser bundles for external plugins are not built by the {{kib}} optimizer. Run `yarn dev --watch` from inside the plugin directory in a dedicated terminal while `yarn start` runs in another — see [Plugin tooling](/extend/tutorials/plugin-tooling.md#_run_kib_with_your_plugin_in_dev_mode).

## Topics

* [Plugin tooling](/extend/tutorials/plugin-tooling.md)
* [Functional Tests for Plugins outside the {{kib}} repo](/extend/tutorials/external-plugin-functional-tests.md)
* [Internationalization (i18n)](/extend/tutorials/i18n.md)
* [Testing {{kib}} Plugins](/extend/tutorials/testing-kibana-plugin.md)





