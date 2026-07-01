# Kibana Storybook

This package provides ability to add [Storybook](https://storybook.js.org/) to any Kibana package or plugin.

- [Kibana Storybook](#kibana-storybook)
  - [Setup Instructions](#setup-instructions)
  - [Customizing configuration](#customizing-configuration)

## Setup Instructions

- Add a `.storybook/main.js` configuration file to your plugin. For example, create a file at
  `src/plugins/<plugin>/.storybook/main.js`, with the following contents:

  ```js
  module.exports = require('@kbn/storybook').defaultConfig;
  ```

- Add a reference to `@kbn/storybook` to the `kbn_references` of the package's tsconfig.json.

- Add your plugin alias to the [`src/dev/storybook/aliases.ts` configuration file](/src/dev/storybook/aliases.ts).

- Create sample Storybook stories. For example, in your plugin create a file at
  `src/plugins/<plugin>/public/components/hello_world/hello_world.stories.tsx` with
  the following [Component Story Format](https://storybook.js.org/docs/api/csf) contents:

  ```jsx
  import type { Meta, StoryObj } from '@storybook/react';

  import { MyComponent } from './MyComponent';

  const meta = {
    component: MyComponent,
  } satisfies Meta<typeof MyComponent>;

  export default meta;
  type Story = StoryObj<typeof MyComponent>;

  export const Basic: Story = {};

  export const WithProp: Story = {
    args: {
      prop: "value"
    }
  };
  ```

- Launch Storybook with `yarn storybook <plugin>`, or build a static site with `yarn storybook --site <plugin>`.

- Tag stories that are safe to consume outside Storybook with `embeddable`. Use the `EmbeddableStoryObj` type (imported as a type, so no runtime code is pulled into the story bundle) to require the tag and strongly type `parameters.embeddable`:

  ```tsx
  import type { EmbeddableStoryObj } from '@kbn/storybook';

  export const Basic: EmbeddableStoryObj<StoryArgs> = {
    tags: ['embeddable'],
    parameters: { embeddable: { height: 96 } },
  };
  ```

  `parameters.embeddable.height` is an optional initial-height hint (in pixels) that reserves space and reduces layout shift before the embed measures itself. Sizing is otherwise derived at runtime: the inline embed observes the rendered container and the iframe fallback `postMessage`s its height, both reported via the `kbn-storybook-docs:resize` event (`EMBEDDABLE_RESIZE_EVENT`) for the host to auto-size the embed.

- Build inline docs assets and serve them locally with CORS enabled:

  ```sh
  yarn storybook_docs <plugin> --serve
  ```

  The docs assets are written to a dedicated `built_assets/storybook-docs/` tree, kept separate from the Storybook static site under `built_assets/storybook/`. This writes `built_assets/storybook-docs/docs_registry.json` and a per-alias `built_assets/storybook-docs/<alias>/` directory (manifest plus the inline registry bundle), writes a `built_assets/storybook-docs-<alias>-<sha>.tar.gz` archive with `sha256` integrity, serves `built_assets` at `http://127.0.0.1:6007` (so the registry resolves at `http://127.0.0.1:6007/storybook-docs/docs_registry.json` and the iframe fallback at `http://127.0.0.1:6007/storybook/<alias>/iframe.html`), and prints the `docs-builder` `storybook.registry` snippet to use in a local docset. To generate the same files without serving them, run `yarn storybook_docs <plugin> --build`. To generate only the unpacked asset directory without a tarball, run `yarn storybook_docs <plugin> --dev`. Only `embeddable` stories are included by default. Use `--skip-storybook-build` to reuse an existing static Storybook build, or `--include-all-stories` to include untagged stories for local debugging.

## Customizing configuration

The `defaultConfig` object provided by the `@kbn/storybook` package should be all you need to get running, but you can
override this in your `.storybook/main.js`. Using [Storybook's configuration options](https://storybook.js.org/docs/configure).

You can also add a `manager.ts` file to customize various aspects of your Storybook. For example, to change the title and link of the Storybook sidebar, you could add:

```ts
addons.setConfig({
  theme: create({
    brandTitle: 'My Plugin',
    brandUrl: 'https://github.com/elastic/kibana/tree/main/src/plugins/my_plugin',
  }),
});
```

Refer to the [Storybook documentation](https://storybook.js.org/docs/configure/user-interface/features-and-behavior) for more information.
