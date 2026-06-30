---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/application-service.html
---

# Application service [application-service]

Plugins utilize the `Application service` API to load and render applications within Kibana's Single Page Application UI in response to user interactions. This service also provides utilities for managing navigation link state, integrating routing between applications, and handling on-demand loading of async chunks.

::::{note}
The Application service is only available client side.
::::


```typescript
import { AppMountParameters, CoreSetup, Plugin, DEFAULT_APP_CATEGORIES } from '@kbn/core/public';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    core.application.register({ <1>
      category: DEFAULT_APP_CATEGORIES.kibana,
      id: 'my-plugin',
      title: 'my plugin title',
      euiIconType: '/path/to/some.svg',
      order: 100,
      appRoute: '/app/my_plugin', <2>
      async mount(params: AppMountParameters) { <3>
        // Load application bundle
        const { renderApp } = await import('./application');
        // Get start services
        const [coreStart, depsStart] = await core.getStartServices(); <4>
        // Render the application
        return renderApp(coreStart, depsStart, params); <5>
      },
    });
  }
}
```

1. [application.register interface](https://github.com/elastic/kibana/tree/master/src/core/packages/application/browser/src/contracts.ts)
2. Application specific URL.
3. `mount` callback is invoked when a user navigates to the application-specific URL.
4. `core.getStartServices` method provides API available during `start` lifecycle.
5. The `mount` method must return an unmount function, which Kibana invokes when the application unmounts. This is where cleanup logic should be placed.


::::{note}
you are free to use any UI library to render a plugin application in DOM. However, we recommend using React and [EUI](https://elastic.github.io/eui) for all your basic UI components to create a consistent UI experience.
::::


