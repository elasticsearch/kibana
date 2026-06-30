---
navigation_title: "Lens Config Builder API - Pie"
description: "Lens Config Builder API - Pie"
---

# Lens Config Builder API - Pie

Understanding `LensPieConfig` in detail

## Required Properties

### `chartType`

- **Type:** Fixed values `'pie' | 'donut'`
- **Description:** Sets the chart type to either pie or donut.

### `title`

- **Type:** `string`
- **Description:** The title of the visualization.

:::{include} ./_snippets/dataset.md
:::

### `breakdown`

- **Type:** `LensBreakdownConfig[]`
- **Description:** An array of breakdown configurations to segment the data into slices. Each breakdown configures how data should be grouped and displayed in the pie or donut chart, enabling detailed and meaningful data representations. Check breakdown configuration details below.

## Optional Properties

### `legend`

- **Type:** `Identity`
- **Description:** Configures the chart's legend. It includes properties to show or hide the legend and to position it relative to the chart ('top', 'left', 'bottom', 'right'). This helps in identifying what each slice of the pie or donut chart represents.

:::{include} ./_snippets/breakdown.md
:::

## Example

```
const pieConfig: LensConfig = {
  chartType: 'pie',
  title: 'Bytes by Region',
  dataset: {
    esql: 'from sales_data | stats avgBytes = avg(bytes) by geo.src',
  },
  breakdown: [
    'geo.src'
  ],
  legend: {
    show: true,
    position: 'right',
  },
};
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder.build(pieConfig, {
  timeRange: { from: 'now-1y', to: 'now', type: 'relative' },
  embeddable: true,
});
```