---
navigation_title: "Lens Config Builder API - Gauge"
description: "Lens Config Builder API - Gauge"
---

# Lens Config Builder API - Gauge

Understanding `LensGaugeConfig` in detail

## Required Properties

### `chartType`

- **Type:** Fixed value `'gauge'`
- **Description:** Sets the chart type to gauge.

### `title`

- **Type:** `string`
- **Description:** The title of the visualization.

:::{include} ./_snippets/dataset.md
:::

### `value`

- **Type:** `LensLayerQuery`
- **Description:** Specifies the field or formula used to determine the main value displayed by the gauge. This is critical for representing the core metric around which the gauge visualization is centered.

## Optional Properties

### `label`

- **Type:** `string`
- **Description:** Offers a descriptive label for the gauge's main value, providing additional context and helping to clarify what the gauge measures.

### `queryMinValue`

- **Type:** `LensLayerQuery`
- **Description:** Defines a query for calculating the minimum value of the gauge's scale. This is particularly useful for gauges that measure a metric's performance against predefined ranges.

### `queryMaxValue`

- **Type:** `LensLayerQuery`
- **Description:** Determines a query for establishing the maximum value of the gauge's scale, setting the upper boundary for what the gauge can display.

### `queryGoalValue`

- **Type:** `LensLayerQuery`
- **Description:** Allows specifying a goal or target value for the gauge, enabling users to visually assess how the current value compares to a set objective.

### `shape`

- **Type:** `'arc' | 'circle' | 'horizontalBullet' | 'verticalBullet'`
- **Description:** Controls the appearance of the gauge by defining its shape. Each shape can convey the data differently, offering various stylistic and functional approaches to data presentation.

:::{include} ./_snippets/breakdown.md
:::

## Example

```
const gaugeConfig: LensConfig = {
  chartType: 'gauge',
  title: 'CPU Utilization',
  dataset: {
    esql: 'from myindex | stats avgCpuUtilization = avg(cpu_utilization) | eval max=100 ',
  },
  value: 'avgCpuUtilization',
  label: 'Average CPU Utilization',
  queryMaxValue: 'max',
  shape: 'arc',
};
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder.build(gaugeConfig, { 
  timeRange: { from: 'now-1h', to: 'now', type: 'relative' },
  embeddable: true,
});
```

This example demonstrates how to create a gauge visualization using the `LensGaugeConfig`. It sets up a gauge to display the average CPU utilization.