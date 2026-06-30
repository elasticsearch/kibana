---
navigation_title: "Lens Config Builder API - XY Chart"
description: "Lens Config Builder API - XY Chart"
---

# Lens Config Builder API - XY Chart

Understanding `LensXYConfig` in detail

## Required Properties

### `chartType`

- **Type:** Fixed value `'xy'`
- **Description:** Sets the chart type to XY, which is used for creating scatter plots, line charts, bar charts, and area charts. This versatile visualization type is ideal for comparing data across two axes, revealing trends, distributions, and relationships between variables.

### `title`

- **Type:** `string`
- **Description:** The title of the visualization.

:::{include} ./_snippets/dataset.md
:::

### `layers`

- **Type:** `Array`
- **Description:** An array of layer configurations that define the data series, annotations, or reference lines to be displayed on the chart. Each layer type brings a different aspect of data visualization to the XY chart, allowing for a rich, multi-dimensional analysis.

## Optional Properties

### `legend`

- **Type:** `Identity`
- **Description:** Configures the chart's legend, including options to show or hide the legend and to specify its position ('top', 'left', 'bottom', 'right'). The legend is essential for identifying different data series within the chart.

### `axisTitleVisibility`

- **Type:** `Identity`
- **Description:** Controls the visibility of axis titles, allowing for a clearer understanding of what each axis represents.

### `emphasizeFitting`

- **Type:** `boolean`
- **Description:** When set to true a straight line will be used between isolated points in a line chart, a dashed line will be used otherwise.

### `fittingFunction`

- **Type:** `'None' | 'Zero' | 'Linear' | 'Carry' | 'Lookahead' | 'Average' | 'Nearest'`
- **Description:** Defines the method used to fit lines through the data points in line charts, affecting how trends are interpreted.

### `yBounds`

- **Type:** `LensYBoundsConfig`
- **Description:** Specifies custom or automatic bounds for the Y-axis, enabling more control over how data ranges are displayed.

For the XY chart within the Lens Config Builder API, there are three distinct types of series layers that can be added: `Annotation`, `Series`, and `ReferenceLine`. Each layer type serves a unique purpose in enhancing the chart with additional context, data representation, or benchmarks. Here's a detailed explanation of each series type:

### Annotation Layer (`LensAnnotationLayer`)

#### Purpose
The Annotation Layer is used to add textual notes or icons at specific points on the chart, providing extra context or highlighting significant events or values. Annotations can help explain anomalies, mark milestones, or simply draw attention to certain aspects of the data.

#### Key Properties
- **`events`**: An array of objects specifying the annotation details. Each event can be tied to a specific point in time (`datetime`) or be based on a condition that matches data points (`field` and `filter`).
- **`color`**: Specifies the color of the annotation marker or text, enhancing visual distinction.
- **`icon`**: (Optional) Allows specifying an icon to be displayed as part of the annotation.

### Series Layer (`LensSeriesLayer`)

#### Purpose
The Series Layer is the primary means of displaying data on an XY chart. It can represent data in various forms, including lines, bars, and areas, to depict trends, distributions, and comparisons across two axes.

#### Key Properties
- **`seriesType`**: Determines the visual representation of the series (e.g., `'line'`, `'bar'`, `'area'`), each offering a different way to interpret the underlying data.
- **`xAxis`** Define the field to use on x-axis or lens formula when using index dataset.
- **`breakdown`**: Field to breakdown or detailed breakdown configuration when using index dataset.
- **`yaxis`**:
 - **Type:** `Array`
 - **Description:** Defines one or more metrics to be plotted on the Y-axis of the chart. Each item in the array represents a different metric or aspect of the data that will be visualized, allowing for a comprehensive and multi-dimensional analysis within a single chart.

#### Sub-properties of `LensBaseLayer` within `yAxis`:

- **`label`** (Optional)
- **Type:** `string`
- **Description:** Provides a descriptive label for the metric, which can be used for legend text or tooltips, enhancing the interpretability of the chart by offering additional details about what the metric represents.

- **`filter`** (Optional)
- **Type:** `string`
- **Description:** Allows specifying a Kibana filter string to refine the data points included in the metric calculation, enabling the isolation of specific segments or conditions within the data.

- **`format`** (Optional)
- **Type:** `'bits' | 'bytes' | 'currency' | 'duration' | 'number' | 'percent' | 'string'`
- **Description:** Defines the format in which the metric values should be displayed, facilitating the appropriate presentation of different types of data, such as financial figures, percentages, or raw numbers.

- **`decimals`** (Optional)
- **Type:** `number`
- **Description:** Specifies the number of decimal places to include in the metric's displayed values, allowing for precision control in the presentation of data.

- **`normalizeByUnit`** (Optional)
- **Type:** `'s' | 'm' | 'h' | 'd'`
- **Description:** Applies normalization of time-based metrics to a specified unit (seconds, minutes, hours, days), useful for standardizing time-related metrics for easier comparison and analysis.

- **`compactValues`** (Optional)
- **Type:** `boolean`
- **Description:** When set to true, large numbers will be displayed in a compact format, making the chart easier to read by reducing the space needed for numerical values.

- **`randomSampling`** (Optional)
- **Type:** `number`
- **Description:** Specifies a percentage (0-100) for random sampling of the data points, which can be useful for large datasets to improve chart rendering performance while still providing a representative view of the data trends.

- **`useGlobalFilter`** (Optional)
- **Type:** `boolean`
- **Description:** Determines whether the chart should apply global filters defined in the dashboard or visualization context, allowing the metric to reflect broader data filtering criteria.

- **`seriesColor`** (Optional)
- **Type:** `string`
- **Description:** Sets a specific color for the data series, enhancing the visual distinction between multiple metrics or series on the chart.

- **`value`**
- **Type:** `LensLayerQuery`
- **Description:** The primary property that specifies the field or lens formula used to calculate the metric displayed on the Y-axis. 

### Reference Line Layer (`LensReferenceLineLayer`)

#### Purpose
The Reference Line Layer is used to add horizontal lines to the chart, serving as benchmarks or targets. These lines can represent goals, thresholds, averages, or any other fixed value that provides context to the data displayed.

#### Key Properties
- **`value`**: The fixed value where the reference line should be drawn. It can represent a numeric threshold, average, or any specific value relevant to the data or business logic.
- **`lineThickness`**, **`color`**, and **`fill`**: Customize the appearance of the reference line, including its thickness, color, and whether the area above or below the line should be shaded to indicate a region of interest.

## Example

```
const xyConfig: LensConfig = {
  chartType: 'xy',
  title: 'XY Chart',
  dataset: {
    esql: 'FROM sales_data | EVAL timestamp=DATE_TRUNC(3 hour, @timestamp) | stats sales = SUM(sales_field) by timestamp',
  },
  layers: [
    {
      type: 'series',
      seriesType: 'line',
      xAxis: 'timestamp',
      yAxis: [
        {
          value: 'sales',
          label: 'Total Sales',
        },
      ],
    },
  ],
  legend: {
    show: true,
    position: 'bottom',
  },
  axisTitleVisibility: {
    showXAxisTitle: true,
    showYAxisTitle: true,
  },
};
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder.build(xyConfig, {
  timeRange: { from: 'now-1y', to: 'now', type: 'relative' },
  embeddable: true,
});
```