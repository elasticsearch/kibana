---
navigation_title: "Lens Config Builder API - Heatmap"
description: "Lens Config Builder API - Heatmap"
---

# Lens Config Builder API - Heatmap

Understanding `LensHeatmapConfig` in detail

## Required Properties

### `chartType`

- **Type:** Fixed value `'heatmap'`
- **Description:** Sets the chart type to heatmap.

### `title`

- **Type:** `string`
- **Description:** The title of the visualization.

:::{include} ./_snippets/dataset.md
:::

### `breakdown`

- **Type:** `LensBreakdownConfig`
- **Description:** Configures the data segmentation for Y-axis. Check breakdown configuration details below.

### `xAxis`

- **Type:** `LensBreakdownConfig`
- **Description:** Defines the breakdown configuration for the X-axis in the heatmap. Check breakdown configuration details below.

## Optional Properties

### `legend`

- **Type:** `Identity`
- **Description:** Configures the legend for the heatmap. The legend settings include options to show or hide the legend and to specify its position ('top', 'left', 'bottom', 'right'). This is crucial for interpreting the colors and gradients used in the heatmap, as it provides a reference scale for the data values represented.

:::{include} ./_snippets/breakdown.md
:::

## Example

```
const heatmapConfig: LensConfig = {
  chartType: 'heatmap',
  title: 'Heatmap Chart',
  dataset: {
    esql: 'from kibana_sample_data_logs | stats bytes=sum(bytes) by geo.dest, geo.src',
  },
  breakdown: 'geo.dest',
  xAxis: 'geo.src',
  value: 'bytes',
  legend: {
    show: true,
    position: 'right',
  },
};
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder.build(heatmapConfig, {
  timeRange: { from: 'now-1M', to: 'now', type: 'relative' },
  embeddable: true,
});
```

This example outlines how to create a heatmap visualization displaying website traffic, segmented by days of the week (`weekday`) and hours of the day (`hour`). The `breakdown` and `xAxis` configurations segment the data into a grid where each cell represents the number of sessions during a specific hour on a given day. The use of an ESQL query in the `dataset` configuration allows for direct aggregation of traffic data, facilitating efficient and dynamic heatmap generation. The legend is configured to be visible on the right, providing a guide for interpreting the color intensities of the heatmap.