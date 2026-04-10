/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  TutorialDefinition,
  TutorialStep,
  CleanupItem,
} from '../../../hooks/use_tutorial_content';
import { sampleEsqlData } from './sample_data_sets';

const esqlTutorialSteps: TutorialStep[] = [
  {
    id: 'create_index',
    type: 'apiCall',
    header: '## Step 1: Create the index and mapping',
    description:
      'Create the `kibana_sample_data_esql` index with explicit field mappings. Each text field gets a `.keyword` sub-field for exact filtering alongside full-text search.',
    apiSnippet: `PUT /kibana_sample_data_esql
{
  "mappings": {
    "properties": {
      "title": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "description": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "author": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "date": { "type": "date", "format": "yyyy-MM-dd" },
      "category": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "tags": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "rating": { "type": "float" }
    }
  }
}`,
    valuesToInsert: [],
    valuesToSave: {
      index_name: 'index',
    },
    explanation:
      'The index `{{index_name}}` was created with explicit mappings. The dual `text` + `keyword` sub-fields enable both full-text search and exact-match filtering on the same data.',
  },
  {
    id: 'bulk_index',
    type: 'ingestData',
    header: '## Step 2: Index sample blog posts',
    description:
      'Add sample recipe blog posts to `{{index_name}}` using the bulk API. Each document has the following shape:',
    apiSnippet: `POST /{{index_name}}/_bulk
{
  "title": "Perfect Pancakes: A Fluffy Breakfast Delight",
  "description": "Learn the secrets to making the fluffiest pancakes...",
  "author": "Maria Rodriguez",
  "date": "2023-05-01",
  "category": "Breakfast",
  "tags": ["pancakes", "breakfast", "easy recipes"],
  "rating": 4.8
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      bulk_items: 'items.length',
    },
    explanation:
      '{{bulk_items}} blog posts were indexed into `{{index_name}}`. Documents are available for search after the next refresh interval.',
  },
  {
    id: 'basic_search',
    type: 'apiCall',
    header: '## Step 3: Basic full-text search with ES|QL',
    description:
      'Run your first ES|QL query. The `FROM` source reads from the index, `WHERE` with the `:` operator performs full-text search, and `LIMIT` caps the result count.',
    apiSnippet: `POST /_query
{
  "query": """
    FROM {{index_name}}
    | WHERE description:"comfort food"
    | LIMIT 1000
  """
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      search_columns: 'columns.length',
      search_rows: 'values.length',
    },
    explanation:
      'The query returned **{{search_rows}}** result(s) across {{search_columns}} columns. ES|QL uses OR logic between search terms by default, so it matches documents containing any of the words.',
  },
  {
    id: 'keep_and_sort',
    type: 'apiCall',
    header: '## Step 4: Select fields and sort by relevance',
    description:
      'Use `KEEP` to select specific fields, `METADATA _score` to surface the relevance score, and `SORT _score DESC` to rank results by relevance.',
    apiSnippet: `POST /_query
{
  "query": """
    FROM {{index_name}} METADATA _score
    | WHERE description:"comfort food"
    | KEEP title, description, _score
    | SORT _score DESC
    | LIMIT 1000
  """
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      sorted_rows: 'values.length',
      sorted_columns: 'columns.length',
    },
    explanation:
      'Returned **{{sorted_rows}}** result(s) with only {{sorted_columns}} selected columns. Without `METADATA _score` and explicit sorting, ES|QL does not order results by relevance — this is an important difference from Query DSL.',
  },
  {
    id: 'exact_filter',
    type: 'apiCall',
    header: '## Step 5: Exact-match filtering',
    description:
      'Filter by exact value using the `.keyword` sub-field with `==`. Unlike full-text search, exact filtering is a binary yes/no check with no relevance scoring.',
    apiSnippet: `POST /_query
{
  "query": """
    FROM {{index_name}}
    | WHERE category.keyword == "Breakfast"
    | KEEP title, category, rating
    | SORT rating DESC
    | LIMIT 1000
  """
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      filter_rows: 'values.length',
    },
    explanation:
      '**{{filter_rows}}** document(s) exactly matched category "Breakfast". Exact-match on `.keyword` fields is fast and precise — ideal for filters, facets, and dropdowns.',
  },
  {
    id: 'match_and_logic',
    type: 'apiCall',
    header: '## Step 6: Require all search terms with AND logic',
    description:
      'Use the `MATCH` function with the `"operator": "AND"` option to require all terms. Unlike the default OR logic, this returns only documents containing every search term.',
    apiSnippet: `POST /_query
{
  "query": """
    FROM {{index_name}}
    | WHERE match(description, "fluffy pancakes", {"operator": "AND"})
    | LIMIT 1000
  """
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      and_rows: 'values.length',
    },
    explanation:
      'Returned **{{and_rows}}** result(s). With AND logic, a document must contain both "fluffy" and "pancakes" in the description. This produces stricter, more precise results than the default OR behavior.',
  },
  {
    id: 'multi_field_boost',
    type: 'apiCall',
    header: '## Step 7: Search across fields with boosting',
    description:
      'Search multiple fields simultaneously and boost the `title` field to 2x. Documents matching in the title get ranked higher than those matching only in the description or tags.',
    apiSnippet: `POST /_query
{
  "query": """
    FROM {{index_name}} METADATA _score
    | WHERE match(title, "vegetarian curry", {"boost": 2.0}) OR match(description, "vegetarian curry") OR match(tags, "vegetarian curry")
    | KEEP title, description, tags, _score
    | SORT _score DESC
    | LIMIT 1000
  """
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      boosted_rows: 'values.length',
      boosted_columns: 'columns.length',
    },
    explanation:
      'Returned **{{boosted_rows}}** result(s). Title matches receive a 2x score boost, so documents with "vegetarian" or "curry" in the title rank higher than those matching only in the description.',
  },
  {
    id: 'advanced_scoring',
    type: 'apiCall',
    header: '## Step 8: Custom scoring with EVAL',
    description:
      'Build a custom scoring pipeline using `EVAL` to combine the relevance score with business logic — boosting Main Course items and recently published posts.',
    apiSnippet: `POST /_query
{
  "query": """
    FROM {{index_name}} METADATA _score
    | WHERE NOT category.keyword == "Dessert"
    | EVAL tags_concat = MV_CONCAT(tags.keyword, ",")
    | WHERE tags_concat LIKE "*vegetarian*" AND rating >= 4.5
    | WHERE match(title, "curry spicy", {"boost": 2.0}) OR match(description, "curry spicy")
    | EVAL category_boost = CASE(category.keyword == "Main Course", 1.0, 0.0)
    | EVAL date_boost = CASE(DATE_DIFF("month", date, NOW()) <= 1, 0.5, 0.0)
    | EVAL custom_score = _score + category_boost + date_boost
    | WHERE custom_score > 0
    | SORT custom_score DESC
    | LIMIT 1000
  """
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      custom_rows: 'values.length',
      custom_columns: 'columns.length',
    },
    explanation:
      'Returned **{{custom_rows}}** result(s) with {{custom_columns}} columns including the computed `custom_score`. ES|QL `EVAL` lets you layer business logic on top of relevance scoring — category preferences, recency boosts, and custom filtering — all in a single query pipeline.',
  },
];

const esqlTutorialCleanup: CleanupItem[] = [
  {
    label: 'Index: kibana_sample_data_esql',
    apiSnippet: 'DELETE /kibana_sample_data_esql',
  },
];

export const esqlTutorial: TutorialDefinition = {
  slug: 'esql',
  title: 'ES|QL for search',
  description:
    'Learn the Elasticsearch Query Language (ES|QL) — a piped query syntax for full-text search, filtering, scoring, and data transformation.',
  globalVariables: {
    index_name: 'kibana_sample_data_esql',
  },
  sampleData: sampleEsqlData,
  summary: {
    text: 'You ran full-text searches, filtered by exact values, controlled relevance with boosting and AND logic, and built custom scoring pipelines with EVAL. ES|QL combines search, filtering, and transformation in a single piped query.',
    links: [
      {
        label: 'ES|QL for search',
        href: 'https://www.elastic.co/docs/solutions/search/esql-for-search',
      },
      {
        label: 'ES|QL reference',
        href: 'https://www.elastic.co/docs/explore-analyze/query-filter/languages/esql',
      },
      {
        label: 'Ingest data for search',
        href: 'https://www.elastic.co/docs/solutions/search/ingest-for-search',
      },
    ],
  },
  steps: esqlTutorialSteps,
  cleanup: esqlTutorialCleanup,
};
