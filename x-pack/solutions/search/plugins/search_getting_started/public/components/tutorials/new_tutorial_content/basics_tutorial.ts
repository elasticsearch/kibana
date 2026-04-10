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
import { sampleBasicsData } from './sample_data_sets';

const basicsTutorialSteps: TutorialStep[] = [
  {
    id: 'create_index',
    type: 'apiCall',
    header: '## Step 1: Create an index',
    description:
      'Create a new index named `kibana_sample_data_basics`. This uses dynamic mapping — Elasticsearch will automatically detect field types when documents are indexed.',
    apiSnippet: `PUT /kibana_sample_data_basics`,
    valuesToInsert: [],
    valuesToSave: {
      index_name: 'index',
    },
    explanation:
      'The index `{{index_name}}` was created successfully. It is now ready to receive documents.',
  },
  {
    id: 'index_single_doc',
    type: 'apiCall',
    header: '## Step 2: Index a single document',
    description:
      'Add a book to the `{{index_name}}` index using the `_doc` endpoint. Elasticsearch auto-generates a unique `_id` for the document.',
    apiSnippet: `POST /{{index_name}}/_doc
{
  "name": "Snow Crash",
  "author": "Neal Stephenson",
  "release_date": "1992-06-01",
  "page_count": 470
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      first_doc_id: '_id',
    },
    explanation:
      'Document `{{first_doc_id}}` was created in `{{index_name}}`. Elasticsearch dynamically mapped the fields based on the JSON types it detected.',
  },
  {
    id: 'bulk_index',
    type: 'ingestData',
    header: '## Step 3: Bulk index multiple documents',
    description:
      'Use the `_bulk` API to add several documents to `{{index_name}}` in a single request. This is far more efficient than indexing documents one at a time. Each document has the following shape:',
    apiSnippet: `POST /{{index_name}}/_bulk
{
  "name": "Revelation Space",
  "author": "Alastair Reynolds",
  "release_date": "2000-03-15",
  "page_count": 585
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      bulk_items: 'items.length',
    },
    explanation:
      '{{bulk_items}} documents were added to `{{index_name}}` in a single bulk request. Combined with the first document, the index now has multiple books.',
  },
  {
    id: 'dynamic_mapping',
    type: 'apiCall',
    header: '## Step 4: See dynamic mapping in action',
    description:
      'Index a document with a new `language` field that does not exist in any prior documents. Elasticsearch dynamically adds it to the mapping.',
    apiSnippet: `POST /{{index_name}}/_doc
{
  "name": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "release_date": "1925-04-10",
  "page_count": 180,
  "language": "EN"
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      dynamic_doc_id: '_id',
    },
    explanation:
      'Document `{{dynamic_doc_id}}` was added with the new `language` field. Elasticsearch automatically updated the mapping to include it — no schema migration needed.',
  },
  {
    id: 'view_mapping',
    type: 'apiCall',
    header: '## Step 5: Inspect the mapping',
    description:
      'View the current mapping of `{{index_name}}` to see how Elasticsearch inferred the type of every field, including the dynamically added `language` field.',
    apiSnippet: `GET /{{index_name}}/_mapping`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      name_field_type: 'kibana_sample_data_basics.mappings.properties.name.type',
      page_count_type: 'kibana_sample_data_basics.mappings.properties.page_count.type',
    },
    explanation:
      'The mapping shows `name` was dynamically typed as `{{name_field_type}}` (analyzed for full-text search) and `page_count` as `{{page_count_type}}` (for numeric operations). The `language` field was also added automatically.',
  },
  {
    id: 'search_all',
    type: 'apiCall',
    header: '## Step 6: Search all documents',
    description:
      'Run a search with no query to retrieve all documents from `{{index_name}}`. Elasticsearch returns the top 10 hits by default.',
    apiSnippet: `GET /{{index_name}}/_search`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      total_docs: 'hits.total.value',
    },
    explanation:
      'The search returned **{{total_docs}}** documents — every book indexed so far. Each hit includes the full document in the `_source` field.',
  },
  {
    id: 'match_query',
    type: 'apiCall',
    header: '## Step 7: Full-text search with match',
    description:
      'Use a `match` query to search for "brave" in the `name` field. This is the standard full-text search query — Elasticsearch analyzes both the query text and the indexed field to find relevant matches.',
    apiSnippet: `GET /{{index_name}}/_search
{
  "query": {
    "match": {
      "name": "brave"
    }
  }
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      match_hits: 'hits.total.value',
      top_match_title: 'hits.hits[0]._source.name',
      top_match_score: 'hits.hits[0]._score',
    },
    explanation:
      'The match query returned **{{match_hits}}** result(s). The top hit is "{{top_match_title}}" with a relevance score of `{{top_match_score}}`. Elasticsearch scored results by how well the analyzed tokens match.',
  },
];

const basicsTutorialCleanup: CleanupItem[] = [
  {
    label: 'Index: kibana_sample_data_basics',
    apiSnippet: 'DELETE /kibana_sample_data_basics',
  },
];

export const basicsTutorial: TutorialDefinition = {
  slug: 'basics',
  title: 'Elasticsearch basics',
  description:
    'Learn the fundamentals: create an index, add documents, explore dynamic mappings, and run your first searches.',
  globalVariables: {
    index_name: 'kibana_sample_data_basics',
  },
  sampleData: sampleBasicsData,
  summary: {
    text: 'You created an index, indexed documents individually and in bulk, saw dynamic mapping in action, and ran full-text searches. These are the building blocks for every Elasticsearch use case.',
    links: [
      {
        label: 'Full-text search queries',
        href: 'https://www.elastic.co/docs/reference/query-languages/query-dsl/full-text-queries',
      },
      {
        label: 'Semantic search with semantic_text',
        href: 'https://www.elastic.co/docs/solutions/search/semantic-search/semantic-search-semantic-text',
      },
    ],
  },
  steps: basicsTutorialSteps,
  cleanup: basicsTutorialCleanup,
};
