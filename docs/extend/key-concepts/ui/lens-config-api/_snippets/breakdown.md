### `breakdown`

The `breakdown` configuration within the Lens Config Builder API allows developers to define how data should be segmented or aggregated in their visualizations. 

#### Types of Breakdown Configurations

The `breakdown` configuration in case of using ES|QL or Datatable as a datasource just takes in the field name to use as a breakdown. 

When using index as a datasource, breakdown can still be a field name, in which case lens will try to choose the most appropriate option, or it could be one of the following:

1. **Top Values (`LensBreakdownTopValuesConfig`):**
- Breaks down data based on the top occurring values for a specified field.
- Attributes include `field` (the field to break down by) and `size` (the number of top values to display).
- Ideal for pie charts, tag clouds, or any visualization where highlighting the most common or significant categories is beneficial.

2. **Date Histogram (`LensBreakdownDateHistogramConfig`):**
- Segments data over time using a specified date field.
- Attributes include `field` (the date field for the histogram), and `minimumInterval` (the smallest interval to use, e.g., `1M` for monthly).
- Useful for time series data, showing trends over time in line charts, area charts, etc.

3. **Intervals (`LensBreakdownIntervalsConfig`):**
- Divides data into intervals based on a numeric field.
- Attributes include `field` (the numeric field to create intervals from) and `granularity` (the interval size).
- Applicable for histograms or any visualization that benefits from numeric range segmentation.

4. **Filters (`LensBreakdownFiltersConfig`):**
- Allows for custom segmentation of data based on a collection of Elasticsearch filters.
- Attributes include an array of `filters`, each with a `label` (optional) and a `filter` string defining the filter query.
- Offers maximum flexibility in data segmentation, suitable for creating comparative visualizations across custom-defined segments.
