---
navigation_title: "Lens Config Builder API - Metric"
description: "Lens Config Builder API - Metric"
---

# Lens Config Builder API - Metric

Understanding `LensMetricConfig` in detail

## Required Properties

### `chartType`

- **Type:** Fixed value `'metric'`
- **Description:** Sets the chart type to metric.

### `title`

- **Type:** `string`
- **Description:** The title of the visualization.

:::{include} ./_snippets/dataset.md
:::

### `value`

- **Type:** `LensLayerQuery`
- **Description:** A field to use for the value if the dataset is ESQL or Datatable or LensFormula is dataset is an index pattern.

## Optional Properties

### `label`

- **Type:** `string`
- **Description:** Provides a descriptive label for the displayed metric, enhancing the chart's interpretability by offering additional details about the metric.

### `querySecondaryMetric`

- **Type:** `LensLayerQuery`
- **Description:** Allows specifying a secondary metric, same as value it should be the name of field or lens formula.

### `queryMaxValue`

- **Type:** `LensLayerQuery`
- **Description:** Used to define a query for calculating a maximum value, same as value it should be the name of field or lens formula.

:::{include} ./_snippets/breakdown.md
:::

### `trendLine`

- **Type:** `boolean`
- **Description:** When set to true, indicates that a trend line should be displayed, providing a visual indication of how the metric has changed over time.

### `subtitle`

- **Type:** `string`
- **Description:** An optional subtitle for the chart, which can be used to provide additional context, explanatory notes, or any supplementary information that aids in understanding the metric.

## Example

```
const config: LensConfig = {
  chartType: 'metric',
  title: 'Total Sales',
  dataset: {
    esql: 'from myindex | stats totalSales = sum(sales_field)',
  },
  value: 'totalSales',
  label: 'Total Sales Value',
};
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder(config, { 
  timeRange: { from: 'now-30d', to: 'now', type: 'relative' },
  embeddable: true,
}
```