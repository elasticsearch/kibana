---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/plugin-tooling.html
---

# Plugin tooling [plugin-tooling]


### Automatic plugin generator [automatic-plugin-generator]

We recommend that you kick-start your plugin by generating it with the [{{kib}} Plugin Generator](https://github.com/elastic/kibana/tree/master/packages/kbn-plugin-generator). Run the following in the {{kib}} repo, and you will be asked a couple of questions, see some progress bars, and have a freshly generated plugin ready for you to play with in {{kib}}'s `plugins` folder.

```shell
node scripts/generate_plugin
```

Pass `--name <plugin_name>` with `-y` to generate non-interactively using the defaults.


### Plugin location [_plugin_location]

External plugins live in a `plugins/` directory at the root of your {{kib}} checkout, for example:

```shell
.
└── kibana
    └── plugins
        ├── foo-plugin
        └── bar-plugin
```

The `plugins/` directory is gitignored, so your plugin is not tracked alongside the {{kib}} sources. {{kib}} discovers external plugins by scanning this directory at startup and reading each plugin's `kibana.json` manifest, so you do **not** need to run `yarn kbn bootstrap` after dropping in a new plugin or editing its manifest.

:::{note}
External plugins use a flat `kibana.json` manifest. This differs from the nested `kibana.jsonc` manifest used by in-repo {{kib}} plugins — see [Anatomy of a plugin](../key-concepts/platform-architecture/anatomy-of-a-plugin.md#kibana-jsonc) for the in-repo format.
:::

## Build plugin distributable [_build_plugin_distributable]

::::{warning}
{{kib}} distributable is not shipped with `@kbn/optimizer` anymore. You need to pre-build your plugin for use in production.
::::


You can leverage [@kbn/plugin-helpers](https://github.com/elastic/kibana/blob/master/packages/kbn-plugin-helpers) to build a distributable archive for your plugin. The package transpiles the plugin code, adds polyfills, and links necessary js modules in the runtime. You don’t need to install the `plugin-helpers` dependency. If you created the plugin using `node scripts/generate_plugin` script, `package.json` is already pre-configured. To build your plugin run within your plugin folder:

```shell
yarn build
```

It will output a`zip` archive in `kibana/plugins/my_plugin_name/build/` folder.


## Install a plugin from archive [_install_a_plugin_from_archive]

See [How to install a plugin](/reference/kibana-plugins.md#install-plugin).


## Run {{kib}} with your plugin in dev mode [_run_kib_with_your_plugin_in_dev_mode]

External plugins use a **two-terminal workflow** in development. Unlike in-repo plugins, their browser bundles are not built by the {{kib}} optimizer at startup, so you drive the build yourself from inside the plugin directory.

In the first terminal, build and watch the browser bundle from the plugin root:

```shell
cd plugins/my_plugin_name
yarn dev --watch
```

In a second terminal, run `yarn start` from the {{kib}} root. Confirm {{kib}} discovered your plugin by looking for it in the startup logs:

```shell
[INFO ][plugins-system.standard] Setting up […] plugins: […, myPluginName, …]
```
