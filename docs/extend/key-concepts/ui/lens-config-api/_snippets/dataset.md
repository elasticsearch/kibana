### `dataset`

The `dataset` configuration within the Lens Config Builder API defines the source of data for a visualization. 

#### Types of Dataset Configurations

1. **LensESQLDataset (`LensESQLDataset`):**
- Utilizes the Elasticsearch Query Language (ES|QL) for retrieving data.
- Attributes include:
- `esql`: A string containing the ES|QL query. ES|QL is a powerful query language that allows for complex search and aggregation operations, making this dataset type particularly flexible and powerful for advanced data retrieval scenarios.

2. **LensDatatableDataset (`LensDatatableDataset`):**
- Represents data in a tabular format, suitable for direct visualization or further processing.
- This dataset type is typically used when data is already aggregated or processed and just needs to be displayed.

3. **LensDataviewDataset (`LensDataviewDataset`):**
- Targets data within a specific Elasticsearch index or data view.
- Attributes include:
- `index`: The ID of the data view or the name of the Elasticsearch index pattern.
- `timeFieldName` (optional): The name of the field used for time-based operations, providing context for time range queries and aggregations.
