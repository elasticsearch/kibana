---
navigation_title: "Lens Config Builder API Examples"
description: "Lens Config Builder API Examples"
---

# Lens Config Builder API Examples

Here are a few simple configurations for different types of visualizations using the Lens Config Builder API. 
These examples demonstrate how to set up basic charts, including Metric, Pie, and XY (line chart) visualizations. 
Each configuration showcases the flexibility and ease of defining visual attributes, queries, and other options 
to tailor the visualization to specific requirements.

### Metric Chart Configuration

```javascript
const metricConfig = {
  chartType: 'metric',
  title: 'Total Sales',
  dataset: {
    esql: 'from myindex | stats totalSales = sum(sales_field)',
  },
  value: 'totalSales',
  label: 'Total Sales Value',
};
```

**Explanation:**

- `chartType`: Specifies the type of chart, in this case, a metric chart.
- `title`: The title of the visualization, displayed as "Total Sales."
- `dataset`: Defines the data source, in this case using ES|QL to select data.
- `value`: Field name in the result to use for value.
- `label`: The label for the metric, providing context to the value displayed.

### Pie Chart Configuration

```javascript
const pieConfig = {
  chartType: 'pie',
  title: 'Sales by Category',
  dataset: {
    esql: 'from myindex | stats totalSales = sum(sales_field) by category_field | limit 10',
  },
  breakdown: ['category_field'],
  value: 'totalSales',
  legend: {
    show: true,
    position: 'right',
  },
};
```

**Explanation:**

- `chartType`: Indicates that this configuration is for a pie chart.
- `title`: Sets the visualization title to "Sales by Category."
- `dataset`: Selects the data with ES|QL
- `value`: specifies which field to use for value
- `breakdown`: Specifies which field to use for breakdown
- `legend`: Configures the legend to be shown on the right side of the chart, aiding in category identification.

### XY Chart Configuration (Line Chart)

```javascript
const xyConfig = {
  chartType: 'xy',
  title: 'Monthly Sales Trend',
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
        }
      ],
    },
  ],
  axisTitleVisibility: {
    showXAxisTitle: true,
    showYAxisTitle: true,
  },
};
```

**Explanation:**

- `chartType`: Specifies an XY chart, which can represent various types of line, area, and bar charts.
- `title`: The title for the visualization, "Monthly Sales Trend."
- `dataset`: Uses ES|QL to select the data.
- `layers`: Defines a single layer for the chart, in this case, a line chart representing sales over time.
- `type`: Indicates the layer is a series.
- `seriesType`: Specifies the chart as a line chart.
- `xAxis`: Defines the field to use for x axis.
- `yAxis`: Defines the field to use for y axis and the label
- `axisTitleVisibility`: Ensures both X and Y axis titles are displayed for clarity.

These configurations illustrate the API's capability to define various visualization types with a straightforward and comprehensible structure, enabling developers to quickly integrate rich data visualizations into their applications.

### Converting to actual lens configuration

Any of the above LensConfigs can be converted to actual lens configuration which can be passed to lens embeddable like this:

```
const configBuilder = new LensConfigBuilder(dataViewsAPI, lensFormulaAPI);
const lensConfig = configBuilder(config, { 
  timeRange: { from: 'now-30d', to: 'now', type: 'relative' },
  embeddable: true,
}
```