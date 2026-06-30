---
navigation_title: "Lens Config Builder API - Tag Cloud"
description: "Lens Config Builder API - Tag Cloud"
---

# Lens Config Builder API - Tag Cloud

Understanding `LensTagCloudConfig` in detail

## Required Properties

### `chartType`

- **Type:** Fixed value `'tagcloud'`
- **Description:** Sets the chart type to tag cloud. Tag clouds are visual representations where tags are depicted in varying sizes, indicating the frequency or importance of each tag. This visualization type is beneficial for quickly identifying the most prominent or common terms in a dataset.

### `title`

- **Type:** `string`
- **Description:** The title of the visualization.

:::{include} ./_snippets/dataset.md
:::

:::{include} ./_snippets/breakdown.md
:::

## Optional Properties

## Example

```
const tagCloudConfig: LensConfig = {
  chartType: 'tagcloud',
  title: 'TagCloud chart',
  dataset: {
    esql: 'from kibana_sample_data_logs | stats bytes=sum(bytes) by geo.dest',
  },
  breakdown: 'geo.dest',
  value: 'bytes',
};
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder.build(tagCloudConfig, {
  timeRange: { from: 'now-1M', to: 'now', type: 'relative' },
  embeddable: true,
});
```