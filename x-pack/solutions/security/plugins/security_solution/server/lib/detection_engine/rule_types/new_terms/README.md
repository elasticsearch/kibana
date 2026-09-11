## Design

The rule accepts 2 new parameters that are unique to the new_terms rule type, in addition to common Security rule parameters such as query, index, and filters, to, from, etc. The new parameters are:

- `new_terms_fields`: an array of field names, currently limited to an array of size 3.
  Example: ['host.ip']
- `history_window_start`: defines the additional time range to search over when determining if a term is "new". If a term is found between the times `history_window_start` and from then it will not be classified as a new term.
  Example: now-30d
  The rule pages through all terms that have appeared in the last rule interval and checks each term to determine if it's new. It pages through terms 10000 at a time.

Each page is evaluated in 3 phases.
Phase 1: Collect "recent" terms - terms that have appeared in the last rule interval, without regard to whether or not they have appeared in historical data. This is done using a composite aggregation to ensure we can iterate over every term.

Phase 2: Check if the page of terms contains any new terms. This uses a regular terms agg with the include parameter - every term is added to the array of include values, so the terms agg is limited to only aggregating on the terms of interest from phase 1. This avoids issues with the terms agg providing approximate results due to getting different terms from different shards.
For multiple new terms fields(['source.host', 'source.ip']), in composite aggregation uses pagination through phase 1 aggregation results. It is done, by splitting page results(10,000 buckets) into chunks(500 size of a chunk). Each chunk then gets converted into a DSL query as a filter and applied in a single request.

Phase 3: Any new terms from phase 2 are processed and the first document to contain that term is retrieved. The document becomes the basis of the generated alert. This is done with an aggregation query that is very similar to the agg used in phase 2, except it also includes a top_hits agg. top_hits is moved to a separate, later phase for efficiency - top_hits is slow and most terms will not be new in phase 2. This means we only execute the top_hits agg on the terms that are actually new which is faster.
Every bucket of the phase 3 response carries a full source document, so the response can exceed `elasticsearch.maxResponseSize` (100 MB by default on Serverless) when the documents are large or when a single document holds an array with many new terms (the same document is returned once per term). When that happens the terms are split into smaller batches and the request is retried, halving the batch size until it fits. For a single new terms field all new terms of a page are fetched at once and halved on failure down to a single term. For multiple new terms fields the composite aggregation chunk size (500) is halved on failure down to a single term, the same way it is halved down to 125 on `max_clause_count` errors.

## Alert schema

New terms alerts have one special field at the moment: `kibana.alert.new_terms`. This field contains the detected term that caused the alert. A single source document may have multiple new terms if the source document contains an array of values in the specified field. In that case, multiple alerts will be generated from the single source document - one for each new value.

## Timestamp override and fallback

The new terms rule type reuses the singleSearchAfter function which implements timestamp fallback for queries automatically. However, the min aggregation by timestamp necessitates a slightly more complex fallback strategy since min aggs only accept a single field. If a timestamp override is defined, the new terms rule type defines a query-time runtime field `kibana.combined_timestamp` which is defined as the timestamp override value if it exists, otherwise `@timestamp`, for each document. We can then use the min aggregation on this runtime field to calculate the earliest time a term was found.

## Limitations and future enhancements

- Value list exceptions are not supported at the moment. Commit ead04ce removes an experimental method I tried for evaluating value list exceptions.
