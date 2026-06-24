# @kbn/ui-storybook-config

Shared Storybook configuration for the `@kbn/ui-*` packages under `src/platform/kbn-ui`. It aggregates the stories from every sibling package (e.g. `@kbn/ui-chrome-layout`, `@kbn/ui-side-navigation`, `@kbn/ui-feedback`) into a single Storybook.

## Usage

```sh
# Launch the dev server
yarn storybook kbn_ui

# Build a static site
yarn storybook --site kbn_ui
```

Stories live alongside their component in each package, conventionally under `src/__stories__/*.stories.tsx`.

## Embeddable docs stories

Stories tagged `embeddable` are published as inline docs assets for `docs-builder` (see `@kbn/storybook` and `yarn storybook_docs kbn_ui`). Tag a story and type it with `EmbeddableStoryObj`:

```tsx
import type { EmbeddableStoryObj } from '@kbn/storybook';

export const Default: EmbeddableStoryObj<Args> = {
  tags: ['embeddable'],
  parameters: { embeddable: { height: 96 } },
};
```
