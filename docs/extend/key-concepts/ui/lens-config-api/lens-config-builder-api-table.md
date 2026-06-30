---
navigation_title: "Lens Config Builder API - Table"
description: "Lens Config Builder API - Table"
---

# Lens Config Builder API - Table

Understanding `LensTableConfig` in detail

## Required Properties

### `chartType`

- **Type:** Fixed value `'table'`
- **Description:** Sets the chart type to table, allowing for the display of data in a tabular format. Tables are versatile for detailed data analysis, enabling the display of multiple dimensions and metrics side by side.

### `title`

- **Type:** `string`
- **Description:** The title of the visualization.

:::{include} ./_snippets/dataset.md
:::

## Optional Properties

### `splitBy`

- **Type:** `LensBreakdownConfig[]`
- **Optional**
- **Description:** An array of breakdown configurations to segment the data into different sections within the table. Each breakdown can create a new column or row based on the field specified, allowing for complex data organization and grouping. Check breakdown configuration details below.

### `breakdown`

- **Type:** `LensBreakdownConfig[]`
- **Optional**
- **Description:** Similar to `splitBy`, but specifically used for creating additional columns based on the breakdown of a particular field. It's useful for comparing metrics across different categories directly within the table. Check breakdown configuration details below.

:::{include} ./_snippets/breakdown.md
:::

## Example

```
const tableConfig: LensConfig = {
  chartType: 'table',
  title: 'Table chart',
  dataset: {
    esql: 'from kibana_sample_data_logs | stats bytes=sum(bytes) by geo.dest, geo.src',
  },
  splitBy: [
    'geo.src'
  ],
  breakdown: [
    'geo.dest'
  ],
  value: 'bytes',
};
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder.build(tableConfig, {
  timeRange: { from: 'now-1y', to: 'now', type: 'relative' },
  embeddable: true,
});
```