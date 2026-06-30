---
navigation_title: "Anatomy of a plugin"
description: "Anatomy of a Kibana plugin."
---

# Anatomy of a plugin

Pre-reading material:

- [Plugins, packages, and the platform](./plugins-packages-and-the-platform.md)

## The anatomy of a plugin

Plugins are defined as classes and present themselves to Kibana through a simple wrapper function. A plugin can have browser-side code, server-side code,
or both. There is no architectural difference between a plugin in the browser and a plugin on the server. In both places, you describe your plugin similarly,
and you interact with Core and other plugins in the same way.

This anatomy of a plugin documentation applies to internal/built-in plugins. 3rd-party plugins should refer to the [external plugin development guide](../../tutorials/external-plugin-development.md).

The basic file structure of a Kibana plugin named demo that has both client-side and server-side code would be:

```
plugins/
  demo
    kibana.jsonc
    tsconfig.json
    public
      index.ts
      plugin.ts
    server
      index.ts
      plugin.ts
    common
      index.ts
    jest.config.js
```

### kibana.jsonc [kibana-jsonc]

`kibana.jsonc` is a static manifest file that is used to identify the plugin and to specify if this plugin has server-side code, browser-side code, or both:

```jsonc
{
  "type": "plugin",
  "id": "@kbn/example-plugin",
  "owner": "@elastic/kibana-core",
  "description": "A description about this plugin!",
  "plugin": {
    "id": "examplePluginId",
    "server": true,
    "browser": true,
    "requiredPlugins": [
      "developerExamples"
    ],
   "optionalPlugins": ["alerting"],
   "requiredBundles": ["anotherPlugin"],
   "group": "workplaceai",
   "visibility": "shared"
  }
}

```
`type` - [Required] Declares the type of the package – in this case, it's a Kibana plugin.

`id` - [Required] The unique package ID for the plugin, used during build and packaging. According to the [manifest handler](https://github.com/elastic/kibana/blob/043ebe521e43b95d70dba1785096af7962ba63e1/src/platform/packages/private/kbn-repo-packages/modern/parse_package_manifest.js#L250-L252), id must be a string that starts with @kbn/` - in the form @scope/name.

`owner` - [Required] The owner field, previously structured as an object with name and githubTeam, is now simplified to an array of strings or a single string referencing the full GitHub team (e.g., "@elastic/kibana-core"). The type expects an array, but there is a handler for single string as well. This change streamlines ownership resolution and aligns with GitHub-based tooling. The logical team responsibility and [CODEOWNERS](https://github.com/elastic/kibana/blob/main/.github/CODEOWNERS) file alignment remain just as important.

`description` - [Required] Give your plugin a description to help other developers understand what it does. This is required for internal plugins.

`plugin.id` - [Required] The id of your plugin can be anything, though it should be fairly unique, as every plugin in an installation needs to be unique. It must be snakeCase.

`plugin.server` - [Optional] If your plugin contains server-side code, this must be true.

`plugin.browser` - [Optional] If your plugin contains client-side code, this must be true.

`plugin.requiredPlugins` - [Optional] If your plugin requires any other plugins to work, you must list them here by id. If any of the required plugins are disabled or not installed, then your plugin will be disabled.

`plugin.optionalPlugins` - [Optional] If your plugin has an optional dependency on other plugins, you must list them here by id. If any of the optional plugins are disabled or not installed, your plugin will still load, however that plugin's API contract will be undefined in the second parameter of the setup and start functions.

`plugin.requiredBundles` - [Required in certain situations] Don't worry about getting this right. The build optimizer will complain if any of these values are incorrect.

`group` - [Required] A field used to distinguish between solution and platform categories. Typical values include "search", "security", "observability", "platform", or "workplaceai".

`visibility` - [Optional] Determines plugin accessibility: "private": The plugin is only accessible from plugins that belong to the same group or "shared": The plugin is accessible from plugins from any group. This only applies to plugins with group: 'platform', as solution plugins are private by definition.

:::{note}
You don't need to declare a dependency on a plugin if you only wish to access its types.
:::

### tsconfig.json [tsconfig-json]

If you are developing in TypeScript (which we recommend), you will need to add a `tsconfig.json` file. Here is an example file that you would use if adding a plugin into the `examples` directory.

```jsonc
{
  "extends": "../../tsconfig.json", // Extends kibana/tsconfig.json
  "compilerOptions": {
    "outDir": "target/types"
  },
  "include": [
    "index.ts",
    "../../typings/**/*",
    // The following paths are optional, based on whether you have common code,
    // or are building a client-side-only or server-side-only plugin.
    "common/**/*.ts",
    "public/**/*.ts",
    "public/**/*.tsx",
    "server/**/*.ts"
  ],
  "exclude": [
    "target/**/*"
  ],
  // If you import other plugins:
  "kbn_references": [
      "@kbn/core",
      "@kbn/developer-examples-plugin"
    ]
}
```

### public/index.ts

`public/index.ts` is the entry point into the client-side code of this plugin. Everything exported from this file will be a part of the plugins [public API](./plugins-packages-and-the-platform.md#public-plugin-api). If the plugin only exists to export static utilities, consider using a package. Otherwise, this file must export a function named plugin, which will receive a standard set of
core capabilities as an argument. It should return an instance of its plugin class for Kibana to load.

```ts
import type { PluginInitializerContext } from '@kbn/core/public';
import { DemoPlugin } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new DemoPlugin(initializerContext);
}
```

:::{note} Best practices for every top level index.ts file
1. When possible, use

```
export type { AType } from '...'`
```

instead of

```
export { AType } from '...'`.
```

Using the non-`type` variation will increase the bundle size unnecessarily and may unwillingly provide access to the implementation of `AType` class.

2. Don't use `export *` in these top level index.ts files
:::

### public/plugin.ts

`public/plugin.ts` is the client-side plugin definition itself. Technically speaking, it does not need to be a class or even a separate file from the entry
point, but all plugins at Elastic should be consistent in this way.

```ts
import type { Plugin, PluginInitializerContext, CoreSetup, CoreStart } from '@kbn/core/server';

export class DemoPlugin implements Plugin {
  constructor(initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup) {
    // called when plugin is setting up during Kibana's startup sequence
  }

  public start(core: CoreStart) {
    // called after all plugins are set up
  }

  public stop() {
    // called when plugin is torn down during Kibana's shutdown sequence
  }
}
```

### server/index.ts

`server/index.ts` is the entry-point into the server-side code of this plugin.

```ts
import type { PluginInitializerContext } from '@kbn/core/server';

export async function plugin(initializerContext: PluginInitializerContext) {
  const { DemoPlugin } = await import('./plugin');
  return new DemoPlugin(initializerContext);
}
```

### server/plugin.ts

`server/plugin.ts` is the server-side plugin definition. The shape of this plugin is the same as it’s client-side counter-part:

```ts
import type { Plugin, PluginInitializerContext, CoreSetup, CoreStart } from '@kbn/core/server';

export class DemoPlugin implements Plugin {
  constructor(initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup) {
    // called when plugin is setting up during Kibana's startup sequence
  }

  public start(core: CoreStart) {
    // called after all plugins are set up
  }

  public stop() {
    // called when plugin is torn down during Kibana's shutdown sequence
  }
}
```

Kibana does not impose any technical restrictions on how the the internals of a plugin are architected, though there are certain
considerations related to how plugins integrate with core APIs and APIs exposed by other plugins that may greatly impact how they are built.

### common/index.ts

`common/index.ts` is the entry-point into code that can be used both server-side or client side.

### jest.config.js

If you are adding unit tests (which we recommend), you will need to add a `jest.config.js` file. Here is an example file that you would use if adding a plugin into the `examples` directory.

```js
module.exports = {
  // Default Jest settings, defined in kbn-test package
  preset: '@kbn/test',
  // The root of the directory containing package.json
  rootDir: '../../..',
  // The directory which Jest should use to search for files in
  roots: ['<rootDir>/src/plugins/demo'],
  // The directory where Jest should output plugin coverage details, e.g. html report
  coverageDirectory: '<rootDir>/target/kibana-coverage/jest/src/plugins/demo',
  // A list of reporter names that Jest uses when writing coverage reports, default: ["json"]
  // "text" is available in console and is good for quick check
  // "html" helps to dig into specific files and fix coverage
  coverageReporters: ['text', 'html'],
  // An array of regexp pattern strings that matched files to include/exclude for code coverage
  collectCoverageFrom: ['<rootDir>/src/plugins/demo/{common,public,server}/**/*.{ts,tsx}'],
};
```

## How plugins interact with each other, and Core

The lifecycle-specific contracts exposed by core services are always passed as the first argument to the equivalent lifecycle function in a plugin.
For example, the core http service exposes a function createRouter to all plugin setup functions. To use this function to register an HTTP route handler, a plugin just accesses it off of the first argument:

```ts
import type { CoreSetup } from '@kbn/core/server';

export class DemoPlugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    // handler is called when '/path' resource is requested with `GET` method
    router.get({ path: '/path', validate: false }, (context, req, res) =>
      res.ok({ content: 'ok' })
    );
  }
}
```

Unlike core, capabilities exposed by plugins are not automatically injected into all plugins.
Instead, if a plugin wishes to use the public interface provided by another plugin, it must first declare that plugin as a
dependency in it’s kibana.json manifest file.

** foobar plugin.ts: **

```ts
import type { Plugin } from '@kbn/core/server';
// [1]
export interface FoobarPluginSetup {
  getFoo(): string;
}

// [1]
export interface FoobarPluginStart {
  getBar(): string;
}

export class MyPlugin implements Plugin<FoobarPluginSetup, FoobarPluginStart> {
  public setup(): FoobarPluginSetup {
    return {
      getFoo() {
        return 'foo';
      },
    };
  }

  public start(): FoobarPluginStart {
    return {
      getBar() {
        return 'bar';
      },
    };
  }
}
```

[1] We highly encourage plugin authors to explicitly declare public interfaces for their plugins.

** demo kibana.json**

```
{
  "plugin": {
    "id": "demo",
    "requiredPlugins": ["foobar"],
    "server": true,
    "browser": true
  }
}
```

With that specified in the plugin manifest, the appropriate interfaces are then available via the second argument of setup and/or start:

```ts
import type { CoreSetup, CoreStart } from '@kbn/core/server';
import type { FoobarPluginSetup, FoobarPluginStart } from '../../foobar/server';

// [1]
interface DemoSetupPlugins {
  foobar: FoobarPluginSetup;
}

interface DemoStartPlugins {
  foobar: FoobarPluginStart;
}

export class DemoPlugin {
  // [2]
  public setup(core: CoreSetup, plugins: DemoSetupPlugins) {
    const { foobar } = plugins;
    foobar.getFoo(); // 'foo'
    foobar.getBar(); // throws because getBar does not exist
  }

  //[3]
  public start(core: CoreStart, plugins: DemoStartPlugins) {
    const { foobar } = plugins;
    foobar.getFoo(); // throws because getFoo does not exist
    foobar.getBar(); // 'bar'
  }

  public stop() {}
}
```

[1] The interface for plugin’s dependencies must be manually composed. You can do this by importing the appropriate type from the plugin and constructing an interface where the property name is the plugin’s ID.

[2] These manually constructed types should then be used to specify the type of the second argument to the plugin.

[3] Notice that the type for the setup and start lifecycles are different. Plugin lifecycle functions can only access the APIs that are exposed during that lifecycle.