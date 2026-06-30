---
navigation_title: "Lens Config Builder API - TreeMap"
description: "Lens Config Builder API - TreeMap"
---

# Lens Config Builder API - TreeMap

Understanding `LensTreeMapConfig` in detail

## Required Properties

### `chartType`

- **Type:** Fixed value `'treemap'`
- **Description:** Sets the chart type to treemap. Treemaps are used to visualize hierarchical data using nested rectangles. Each branch of the tree is given a rectangle, which is then tiled with smaller rectangles representing sub-branches. A leaf node's size and color can vary to show statistical information about the node and its relationship to the rest of the tree.

### `title`

- **Type:** `string`
- **Description:** The title of the visualization.

:::{include} ./_snippets/dataset.md
:::

### `breakdown`

- **Type:** `LensBreakdownConfig[]`
- **Description:** An array of breakdown configurations to hierarchically segment the data into nested rectangles. The breakdowns determine how the data is grouped and subdivided, with each level of the hierarchy represented by a deeper level of nesting in the treemap. Check breakdown configuration details below.

:::{include} ./_snippets/breakdown.md
:::

## Optional Properties

## Example

```
const treemapConfig: LensConfig = {
  chartType: 'treemap',
  title: 'Treemap chart',
  dataset: {
    esql: 'from kibana_sample_data_logs | stats bytes = sum(bytes) by geo.src, geo.dest',
  },
  breakdown: [
    'geo.src',
    'geo.dest',
  ],
  value: 'bytes',
};
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder.build(treemapConfig, {
  timeRange: { from: 'now-1y', to: 'now', type: 'relative' },
  embeddable: true,
});
```