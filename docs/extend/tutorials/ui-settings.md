---
navigation_title: "UI settings"
description: "Register, read, and migrate Kibana UI settings (also known as advanced settings) from a plugin."
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/ui-settings-service.html
---

# UI settings [ui-settings-service]

::::{note}
*Advanced settings*, *UI settings*, *uiSettings*, *settings*, and *config* are different names for the same concept.
::::

UI settings control the behavior of {{kib}}. Plugins use the `uiSettings` service to register new settings, then read them at runtime on the client or server. Values are persisted in the `config` saved object and conform to the same rules as other [Saved Objects](/extend/key-concepts/saved-objects.md).

There are four ways a user or administrator can configure a UI setting:

- [Through the Advanced Settings UI](#advanced-settings-ui)
- [Locked via `kibana.yml`'s `uiSettings.overrides`](#uisettings-overrides)
- [Through the client-side `uiSettings` service](#client-side-usage)
- [Through the server-side `uiSettings` service](#server-side-usage)

`uiSettings` are registered synchronously during `core`'s `setup` lifecycle phase. Once you add a new setting you cannot change or remove it without [registering a migration](#uisettings-migrations).


## Configuration through the Advanced Settings UI [advanced-settings-ui]

The `uiSettings` service is the programmatic interface to {{kib}}'s Advanced Settings UI. Open the main menu, then click **Stack Management > Advanced Settings**.

Access is restricted to users authorized to access the Advanced Settings page. Users without that permission default to the settings configured for the space they are in. The `config` saved object can be shared between spaces.


## Configuration with `uiSettings.overrides` [uisettings-overrides]

```{applies_to}
stack: preview
```

When a setting is configured as an override in `kibana.yml`, it overrides any other value stored in the `config` saved object. The override applies to {{kib}} as a whole — for all spaces and all users — and the option is disabled on the Advanced Settings page. These are referred to as "global" overrides.

```yaml
# Display times in UTC
uiSettings:
  overrides:
    "dateFormat:tz": "UTC"
```

If an override is misconfigured it fails config validation and prevents {{kib}} from starting. Validation applies to the value *type* but not to the *key*. For example, if a plugin registers `my_plugin_foo: 42` (a number), this override fails validation:

```yaml
uiSettings.overrides:
  my_plugin_foo: "42"
```

and this one passes — even though the key name is wrong:

```yaml
uiSettings.overrides:
  my_pluginFoo: 42
```


## Registering a new setting (server-side) [server-side-registration]

Register new settings during `core.setup` on the server. Every setting needs at least a `schema` against which validations are performed on read and write. All other [parameters](https://github.com/elastic/kibana/blob/main/src/core/packages/ui-settings/common/src/ui_settings.ts) are optional.

```ts
import { PluginInitializerContext, Plugin, CoreSetup } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { i18n } from '@kbn/i18n';

export class DevToolsServerPlugin implements Plugin<object, object> {
  constructor(initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup<object>) {
    core.uiSettings.register({
      [ENABLE_PERSISTENT_CONSOLE_UI_SETTING_ID]: {
        category: [DEV_TOOLS_FEATURE_ID],
        name: i18n.translate('devTools.uiSettings.persistentConsole.name', {
          defaultMessage: 'Persistent Console',
        }),
        description: i18n.translate('devTools.uiSettings.persistentConsole.description', {
          defaultMessage:
            'Enables a persistent console in the Kibana UI. This setting does not affect the standard Console in Dev Tools.',
        }),
        schema: schema.boolean(),
        value: true,
        requiresPageReload: true,
      },
    });
    return {};
  }

  public start() { return {}; }
  public stop() {}
}
```

For performance, `uiSettings` are cached. When a change requires the page to reload for the new value to take effect, set `requiresPageReload: true`. For example, the time filter refresh interval uses this to prompt a refresh after the value is edited:

```ts
import { i18n } from '@kbn/i18n';
import { schema } from '@kbn/config-schema';
import type { DocLinksServiceSetup, UiSettingsParams } from '@kbn/core/server';
import { DEFAULT_QUERY_LANGUAGE, UI_SETTINGS } from '../common';

export function getUiSettings(
  docLinks: DocLinksServiceSetup
): Record<string, UiSettingsParams<unknown>> {
  return {
    [UI_SETTINGS.TIMEPICKER_REFRESH_INTERVAL_DEFAULTS]: {
      name: i18n.translate('data.advancedSettings.timepicker.refreshIntervalDefaultsTitle', {
        defaultMessage: 'Time filter refresh interval',
      }),
      value: `{ "pause": false, "value": 0 }`,
      type: 'json',
      description: i18n.translate('data.advancedSettings.timepicker.refreshIntervalDefaultsText', {
        defaultMessage: `The timefilter's default refresh interval. The "value" needs to be specified in milliseconds.`,
      }),
      requiresPageReload: true,
      schema: schema.object({
        pause: schema.boolean(),
        value: schema.number(),
      }),
    },
  };
}
```

Plugins can also pass an optional `deprecation` parameter to handle deprecation notices and renames. Deprecation warnings are rendered in the Advanced Settings UI and should also be added to the [Configure Kibana](/reference/configuration-reference/general-settings.md) guide.


## Server-side usage [server-side-usage]

Reading a registered setting in a server-side route handler:

```ts
import { schema } from '@kbn/config-schema';
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    core.uiSettings.register({
      custom: {
        value: '42',
        schema: schema.string(),
      },
    });

    const router = core.http.createRouter();
    router.get(
      { path: 'my_plugin/{id}', validate: /* … */ },
      async (context, request, response) => {
        const customSetting = await context.uiSettings.client.get('custom');
        // …
      }
    );
  }
}
```


## Client-side usage [client-side-usage]

On the client, the `uiSettings` service is exposed directly from `core`. The [client](https://github.com/elastic/kibana/blob/main/src/core/packages/ui-settings/server/src/ui_settings_client.ts) provides plugins access to the `config` entries stored in {{es}}.

```ts
import { CoreSetup, Plugin } from '@kbn/core/public';

export class MyPlugin implements Plugin<MyPluginSetup, MyPluginStart> {
  public setup(core: CoreSetup): MyPluginSetup {
    core.uiSettings.getUpdate$().subscribe(({ key, newValue }) => {
      if (key === 'custom') {
        // react to updates...
      }
    });
  }

  public start(core: CoreStart): MyPluginStart {
    return {
      settings: {
        getCustomValue: () => core.uiSettings.get('custom'),
      },
    };
  }
}
```


## Migrations [uisettings-migrations]

::::{important}
Migrations for 3rd-party plugin advanced settings are not currently supported. If a 3rd-party plugin registers an advanced setting, the setting is essentially permanent and cannot be fixed without manual intervention.
::::

To change or remove a `uiSetting`, you must migrate the whole `config` saved object. `uiSettings` migrations are declared directly in the service — as of 8.17, they live in `src/core/packages/ui-settings/server-internal/src/saved_objects/migrations.ts`.

For example, removing a `custom` setting in 8.1.0 and renaming `my_setting:fourtyTwo` to `my_other_setting:fourtyTwo` in 8.2.0:

```ts
export const migrations = {
  '8.1.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce(
        (acc, key) =>
          ['custom'].includes(key)
            ? { ...acc }
            : { ...acc, [key]: doc.attributes[key] },
        {}
      ),
    }),
    references: doc.references || [],
  }),
  '8.2.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce(
        (acc, key) =>
          key.startsWith('my_setting:')
            ? { ...acc, [key.replace('my_setting', 'my_other_setting')]: doc.attributes[key] }
            : { ...acc, [key]: doc.attributes[key] },
        {}
      ),
    }),
    references: doc.references || [],
  }),
};
```


## Transforms [uisettings-transforms]

If you need to make a change that isn't possible in a saved object migration function (for example, you need to look up other saved objects), you can register a transform function instead. Transforms run when a `config` saved object is first created, or when it is first upgraded.

Add an extra attribute to mark that the transform has already been applied so it doesn't run again. For example, the `defaultIndex` transform uses an `isDefaultIndexMigrated` flag. See `src/core/packages/ui-settings/server-internal/src/saved_objects/transforms.ts` and [#133339](https://github.com/elastic/kibana/pull/133339) for an example.
