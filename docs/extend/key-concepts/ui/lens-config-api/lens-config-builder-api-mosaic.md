---
navigation_title: "Lens Config Builder API - Mosaic"
description: "Lens Config Builder API - Mosaic"
---

# Lens Config Builder API - Mosaic

Understanding `LensMosaicConfig` in detail

## Required Properties

### `chartType`

- **Type:** Fixed value `'mosaic'`
- **Description:** Sets the chart type to mosaic, a variation of a stacked bar chart that displays the distribution of data across two categories.

### `title`

- **Type:** `string`
- **Description:** The title of the visualization.

:::{include} ./_snippets/dataset.md
:::

### `breakdown`

- **Type:** `LensBreakdownConfig`
- **Description:** Configures the primary categorization of data for the mosaic chart. This breakdown specifies the main grouping of data, typically represented along one of the chart's axes. Check breakdown configuration details below.

### `xAxis`

- **Type:** `LensBreakdownConfig`
- **Description:** Defines the configuration for the X-axis categorization in the mosaic chart. It determines how data points are grouped along the horizontal axis, influencing the chart's layout and the distribution of stacked segments. Check breakdown configuration details below.

## Optional Properties

:::{include} ./_snippets/breakdown.md
:::

## Example

```
const mosaicConfig: LensConfig = {
  chartType: 'mosaic',
  title: 'Mosaic Chart',
  dataset: {
    esql: 'from kibana_sample_data_logs | stats bytes = sum(bytes) by geo.src, geo.dest',
  },
  breakdown: 'geo.src',
  xAxis: 'geo.dest',
};
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder.build(mosaicConfig, {
  timeRange: { from: 'now-1y', to: 'now', type: 'relative' },
  embeddable: true,
});
```

This example demonstrates configuring a mosaic chart to visualize the distribution of product sales across different regions and categories. The `breakdown` is set to segment data by the top 5 regions, while the `xAxis` config segments further by the top 10 product categories. An ESQL query aggregates sales within the specified groupings, enabling the mosaic chart to display the proportional distribution of sales across these dimensions. This type of visualization is particularly useful for identifying patterns or disparities in sales performance across different market segments.