---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/configuration-service.html
---

# Configuration service [configuration-service]

The `ConfigService` in {{kib}} enables plugin developers to support adjustable runtime behavior. Plugins can only read their own configuration values; direct access to configuration values from {{kib}} Core or other plugins is not permitted.

::::{note}
The Configuration service is only available server side.
::::

To access your plugin's configuration, you *should*:

* Declare a plugin-specific `configPath` in your plugin definition (defaults to the plugin `id` if not specified).
* Export a mandatory schema validation for the config from your plugin's main file. `ConfigService` will throw an error if a plugin reads from the config without schema declaration.

**my_plugin/server/index.ts**

```typescript
import { schema, TypeOf } from '@kbn/config-schema';
export const plugin = …
export const config = {
  schema: schema.object(…),
};
export type MyPluginConfigType = TypeOf<typeof config.schema>;
```

* Read config value exposed via `PluginInitializerContext`:

**my_plugin/server/plugin.ts**

```typescript
import type { PluginInitializerContext } from '@kbn/core/server';
export class MyPlugin {
  constructor(initializerContext: PluginInitializerContext) {
    this.config$ = initializerContext.config.create<MyPluginConfigType>();
    // or if config is optional:
    this.config$ = initializerContext.config.createIfExists<MyPluginConfigType>();
  }
  ...
}
```

If your plugin has a client-side component, expose configuration properties using the `exposeToBrowser` allow-list.

**my_plugin/server/index.ts**

```typescript
import { schema, TypeOf } from '@kbn/config-schema';
import type { PluginConfigDescriptor } from '@kbn/core/server';

const configSchema = schema.object({
  secret: schema.string({ defaultValue: 'Only on server' }),
  uiProp: schema.string({ defaultValue: 'Accessible from client' }),
});

type ConfigType = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<ConfigType> = {
  exposeToBrowser: {
    uiProp: true,
  },
  schema: configSchema,
};
```

Configuration containing only the exposed properties will be then available on the client-side using the plugin’s `initializerContext`:

**my_plugin/public/index.ts**

```typescript
interface ClientConfigType {
  uiProp: string;
}

export class MyPlugin implements Plugin<PluginSetup, PluginStart> {
  constructor(private readonly initializerContext: PluginInitializerContext) {}

  public async setup(core: CoreSetup, deps: {}) {
    const config = this.initializerContext.config.get<ClientConfigType>();
  }
```

Plugins are enabled by default. To disable a plugin, declare the special {{kib}} Platform `enabled` flag in its config. {{kib}} will not create a plugin instance if `enabled: false`.

```js
export const config = {
  schema: schema.object({ enabled: schema.boolean({ defaultValue: false }) }),
};
```

## Handle plugin configuration deprecations [handle-plugin-configuration-deprecations]

To manage deprecated configuration keys, use the `deprecations` config descriptor field. Deprecations are handled per-plugin, using relative paths from the plugin's configuration root instead of full property paths.

**my_plugin/server/index.ts**

```typescript
import { schema, TypeOf } from '@kbn/config-schema';
import type { PluginConfigDescriptor } from '@kbn/core/server';

const configSchema = schema.object({
  newProperty: schema.string({ defaultValue: 'Some string' }),
});

type ConfigType = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<ConfigType> = {
  schema: configSchema,
  deprecations: ({ rename, unused }) => [
    rename('oldProperty', 'newProperty'),
    unused('someUnusedProperty'),
  ],
};
```

In some cases, accessing the whole configuration for deprecations is necessary. For these edge cases, `renameFromRoot` and `unusedFromRoot` are also accessible when declaring deprecations.

**my_plugin/server/index.ts**

```typescript
export const config: PluginConfigDescriptor<ConfigType> = {
  schema: configSchema,
  deprecations: ({ renameFromRoot, unusedFromRoot }) => [
    renameFromRoot('oldplugin.property', 'myplugin.property'),
    unusedFromRoot('oldplugin.deprecated'),
  ],
};
```


## Validating your configuration based on context references [validating-your-configuration-based-on-context-references]

Some features require special configuration when running in different modes (dev/prod/dist, or even serverless). For purpose, core injects the following *references* in the validation’s context:

| Context Reference | Potential values | Description |
| --- | --- | --- |
| `dev` | `true`&#124;`false` | Is Kibana running in Dev mode? |
| `prod` | `true`&#124;`false` | Is Kibana running in Production mode (running from binary)? |
| `dist` | `true`&#124;`false` | Is Kibana running from a distributable build (not running from source)? |
| `serverless` | `true`&#124;`false` | Is Kibana running in Serverless offering? |
| `version` | `8.9.0` | The current version of Kibana |
| `buildNum` | `12345` | The build number |
| `branch` | `main` | The current branch running |
| `buildSha` | `12345` | The build SHA (typically refers to the last commit’s SHA) |
| `buildDate` | `2023-05-15T23:12:09+0000` | The ISO 8601 date of the build |

To use any of the references listed above in a config validation schema, they can be accessed via `schema.contextRef('{{CONTEXT_REFERENCE}}')`:

```js
export const config = {
  schema: schema.object({
    // Enabled by default in Dev mode
    enabled: schema.boolean({ defaultValue: schema.contextRef('dev') }),

    // Setting only allowed in the Serverless offering
    plansForWorldPeace: schema.conditional(
      schema.contextRef('serverless'),
      true,
      schema.string({ defaultValue: 'Free hugs' }),
      schema.never()
    ),
  }),
};
```

For Serverless vs. Traditional configuration, you are encouraged to use the `offeringBasedSchema` helper:

```js
import { schema, offeringBasedSchema } from '@kbn/config-schema'

export const config = {
  schema: schema.object({
    // Enabled by default in Dev mode
    enabled: schema.boolean({ defaultValue: schema.contextRef('dev') }),

    // Setting only allowed in the Serverless offering
    plansForWorldPeace: offeringBasedSchema({
      serverless: schema.string({ defaultValue: 'Free hugs' }),
    }),
  }),
};
```


