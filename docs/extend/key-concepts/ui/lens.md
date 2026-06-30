---
navigation_title: "Visualization Framework (Lens)"
description: "An explanation of the Lens visualization library and the Config Builder API for embedding Lens visualizations in Kibana plugins."
---

# Lens

Lens is Kibana's primary visualization framework. It powers the drag-and-drop chart editor available to end users, and exposes a programmatic API — the **Lens Config Builder API** — that developers can use to create and embed visualizations directly in their plugins.

## What Lens is

Lens is a plugin (`@kbn/lens-plugin`) that owns the full stack for creating chart visualizations in Kibana:

- A drag-and-drop UI for end users to build charts without writing queries
- A configuration model that describes any supported chart type (XY, metric, pie, gauge, heatmap, and more)
- An embeddable output — `LensEmbeddableInput` or `LensAttributes` — that can be rendered anywhere the Kibana embeddable framework is supported

## The Config Builder API

Building a Lens configuration by hand requires deep knowledge of the internal `LensAttributes` schema, which is complex and subject to change. The **Lens Config Builder API** (`@kbn/lens-embeddable-utils/config_builder`) provides a stable, high-level abstraction over this schema. You describe what you want — chart type, data source, field mappings — and the builder produces the correct `LensAttributes` or `LensEmbeddableInput`.

```ts
import LensConfigBuilder, { LensConfig } from '@kbn/lens-embeddable-utils/config_builder';

const config: LensConfig = {
  chartType: 'metric',
  title: 'Total sales',
  dataset: { esql: 'from sales | stats total = sum(amount)' },
  value: 'total',
};

const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = await configBuilder.build(config, {
  timeRange: { from: 'now-30d', to: 'now', type: 'relative' },
  embeddable: true,
});

<LensEmbeddable {...lensConfig} />
```

The builder needs two Kibana service dependencies:
- `DataViewsPublicPluginStart` (`dataViewsAPI`) — to resolve data views
- `FormulaPublicApi` (`lensFormulaAPI`) — for formula-based metrics; can be omitted for ES|QL visualizations

## When to use the Config Builder API

Use the Config Builder API when you need to **programmatically embed a Lens chart** inside a Kibana plugin — for example, a dashboard panel, a flyout, or a dedicated analytics view.

Use the **Lens editor UI** when you want end users to configure the visualization themselves.

Use **raw `LensAttributes`** directly only if you need chart behavior the Config Builder does not yet support; prefer the Config Builder for everything else because it insulates your code from internal schema changes.

## Relationship to embeddables

Lens visualizations are rendered through the [Kibana embeddable framework](./embeddables.md). When you call `configBuilder.build(config, { embeddable: true })`, the output is a `LensEmbeddableInput` that can be passed directly to `<LensEmbeddable>`. Without `embeddable: true`, the output is `LensAttributes`, which you can pass to the Lens plugin's `EmbeddableComponent` or store in a saved object.

## Further reading

- [Lens Config Builder API reference](./lens-config-api/lens-config-builder-api-documentation.md) — class, constructor, and `build` method reference
- [How to create Lens visualizations with the Config Builder API](../../tutorials/lens-config-builder-api-examples.md) — worked examples for metric, pie, and XY charts
