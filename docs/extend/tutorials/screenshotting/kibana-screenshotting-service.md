---
navigation_title: "Screenshotting"
description: "Kibana Screenshotting Service"
---

# Screenshotting

## Screenshotting Plugin

This plugin provides functionality to take screenshots of the Kibana pages.
It uses Chromium and Puppeteer underneath to run the browser in headless mode.

If you are planning to integrate with the screenshotting plugin, please get in touch with the App Services team to know all the limitations.

### Capabilities
- Canvas workpads screenshots.
- Dashboards screenshots.
- Expressions screenshots.
- PDF generation.
- Batch screenshotting.

### Usage
After listing the `screenshotting` plugin in your dependencies, the plugin will be intitalized on the setup stage.
The intitalization process downloads (if it is not already present) and verifies the Chromium build.

The start contract exposes a public API to interact with the plugin.
Apart from the actual screenshotting functionality, it also provides a way for self-diagnostics.

Here is an example of how you can take a screenshot of a Kibana URL.

```typescript
import { lastValueFrom } from 'rxjs';
import type { CoreSetup, Plugin } from 'src/core/server';
import type { ScreenshottingStart } from 'x-pack/plugins/screenshotting/server';

interface StartDeps {
  screenshotting: ScreenshottingStart;
}

class ExamplePlugin implements Plugin<void, void, void, StartDeps> {
  setup({ http, getStartServices }: CoreSetup<StartDeps>) {
    const router = http.createRouter();

    router.get(
      {
        path: '/api/capture',
        validate: {
          query: schema.object({
            id: schema.string(),
          }),
        },
      },
      async (context, request, response) => {
        const [, { screenshotting }] = await getStartServices();
        const { metrics, results } = await lastValueFrom(
          screenshotting.getScreenshots({
            request,
            urls: [`http://localhost/app/canvas#/workpad/workpad-${request.query.id}`],
          })
        );

        return response.ok({
          body: JSON.stringify({
            metrics,
            image: results[0]?.screenshots[0]?.data.toString('base64'),
            errors: results[0]?.renderErrors,
          } as ScreenshottingExpressionResponse),
        });
      }
    );
  }

  start() {}
}

export function plugin() {
  return new ExamplePlugin();
}
```

:::{note}
Check the complete API reference here.
:::