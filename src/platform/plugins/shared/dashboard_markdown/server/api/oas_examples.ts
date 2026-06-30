/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MarkdownCreateRequestBody, MarkdownCreateResponseBody } from './create/types';
import type { MarkdownReadResponseBody } from './read/types';
import type { MarkdownSearchResponseBody } from './search/types';
import type { MarkdownUpdateRequestBody, MarkdownUpdateResponseBody } from './update/types';

// ---------------------------------------------------------------------------
// Code-sample helpers
// ---------------------------------------------------------------------------

const createCurlCodeSample = ({
  label,
  method,
  path,
  body,
}: {
  label: string;
  method: 'POST' | 'PUT';
  path: string;
  body: object;
}) => ({
  lang: 'cURL',
  label,
  source:
    [
      `curl -X ${method} "\${KIBANA_URL}${path}" \\`,
      `  -H "Authorization: ApiKey \${API_KEY}" \\`,
      `  -H "kbn-xsrf: true" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${JSON.stringify(body, null, 2)}'`,
    ].join('\n') + '\n',
});

const createConsoleCodeSample = ({
  label,
  method,
  path,
  body,
}: {
  label: string;
  method: 'POST' | 'PUT';
  path: string;
  body: object;
}) => ({
  lang: 'Console',
  label,
  source: [`${method} kbn:${path}`, JSON.stringify(body, null, 2)].join('\n') + '\n',
});

// ---------------------------------------------------------------------------
// Per-operation descriptions
// ---------------------------------------------------------------------------

const markdownCreateDescription =
  'Creates a new markdown library item and returns its ID, full state, and metadata.';

const markdownSearchDescription =
  'Returns a paginated list of markdown library items. Each result includes title, description, and metadata, but not the content. ' +
  'Use `GET /api/markdowns/{id}` to retrieve the complete state.';

const markdownReadDescription = 'Returns the complete state of a markdown library item by ID.';

const markdownUpdateDescription =
  'Replaces the full state of a markdown library item. Partial updates are not supported.\n' +
  'To make incremental changes, retrieve the item first, modify the fields you need, then send the complete object back.\n' +
  '\n' +
  'If no item exists with the specified ID, a new one is created.\n';

const markdownDeleteDescription = 'Permanently deletes a markdown library item by ID.';

// ---------------------------------------------------------------------------
// Typed example bodies, checked against the schema-derived request types
// ---------------------------------------------------------------------------

const markdownCreateBody: MarkdownCreateRequestBody = {
  title: 'Web logs overview',
  description: 'Intro and context for the web logs dashboard.',
  content:
    '## Web logs overview\n' +
    '\n' +
    'A quick reference for the **Kibana sample web logs** dataset (`kibana_sample_data_logs`).\n' +
    '\n' +
    '**Key metrics in this dashboard:**\n' +
    '\n' +
    '- Total request count by HTTP method\n' +
    '- Average response size over time\n' +
    '- Geographic distribution of client IPs\n' +
    '\n' +
    '> Use the time picker above to narrow the dashboard to an incident window.\n' +
    '\n' +
    'For field reference, see the [sample data documentation](https://www.elastic.co/docs/manage-data/ingest/sample-data).\n',
  settings: { open_links_in_new_tab: true },
};

const markdownUpdateBody: MarkdownUpdateRequestBody = {
  title: 'Web logs overview',
  description: 'Intro and context for the web logs dashboard.',
  content:
    '## Web logs overview\n' +
    '\n' +
    'A quick reference for the **Kibana sample web logs** dataset (`kibana_sample_data_logs`).\n' +
    '\n' +
    '**Key metrics in this dashboard:**\n' +
    '\n' +
    '- Total request count by HTTP method\n' +
    '- Average response size over time\n' +
    '- Geographic distribution of client IPs\n' +
    '- _New:_ error rate broken down by status code\n' +
    '\n' +
    '> Use the time picker above to narrow the dashboard to an incident window.\n' +
    '\n' +
    'For field reference, see the [sample data documentation](https://www.elastic.co/docs/manage-data/ingest/sample-data).\n',
  settings: { open_links_in_new_tab: true },
};

// ---------------------------------------------------------------------------
// Code-sample lists, one per operation
// ---------------------------------------------------------------------------

const markdownCreateCodeSamples = [
  createCurlCodeSample({
    label: 'Create a markdown library item - cURL',
    method: 'POST',
    path: '/api/markdowns',
    body: markdownCreateBody,
  }),
  createConsoleCodeSample({
    label: 'Create a markdown library item - Console',
    method: 'POST',
    path: '/api/markdowns',
    body: markdownCreateBody,
  }),
];

const markdownSearchCodeSamples = [
  {
    lang: 'cURL',
    label: 'Search markdown library items - cURL',
    source:
      'curl -X GET "${KIBANA_URL}/api/markdowns?query=welcome&per_page=10" \\\n' +
      '  -H "Authorization: ApiKey ${API_KEY}"\n',
  },
  {
    lang: 'Console',
    label: 'Search markdown library items - Console',
    source: 'GET kbn:/api/markdowns?query=welcome&per_page=10\n',
  },
];

const markdownReadCodeSamples = [
  {
    lang: 'cURL',
    label: 'Get a markdown library item - cURL',
    source:
      'curl -X GET "${KIBANA_URL}/api/markdowns/5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e" \\\n' +
      '  -H "Authorization: ApiKey ${API_KEY}"\n',
  },
  {
    lang: 'Console',
    label: 'Get a markdown library item - Console',
    source: 'GET kbn:/api/markdowns/5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e\n',
  },
];

const markdownUpdateCodeSamples = [
  createCurlCodeSample({
    label: 'Upsert a markdown library item - cURL',
    method: 'PUT',
    path: '/api/markdowns/5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e',
    body: markdownUpdateBody,
  }),
  createConsoleCodeSample({
    label: 'Upsert a markdown library item - Console',
    method: 'PUT',
    path: '/api/markdowns/5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e',
    body: markdownUpdateBody,
  }),
];

const markdownDeleteCodeSamples = [
  {
    lang: 'cURL',
    label: 'Delete a markdown library item - cURL',
    source:
      'curl -X DELETE "${KIBANA_URL}/api/markdowns/5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e" \\\n' +
      '  -H "Authorization: ApiKey ${API_KEY}" \\\n' +
      '  -H "kbn-xsrf: true"\n',
  },
  {
    lang: 'Console',
    label: 'Delete a markdown library item - Console',
    source: 'DELETE kbn:/api/markdowns/5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e\n',
  },
];

// ---------------------------------------------------------------------------
// Request body examples
// ---------------------------------------------------------------------------

const markdownCreateRequestExamples = {
  createMarkdown: {
    summary: 'Create a markdown library item',
    value: markdownCreateBody,
  },
};

const markdownUpdateRequestExamples = {
  upsertMarkdown: {
    summary: 'Upsert a markdown library item',
    value: markdownUpdateBody,
  },
};

// ---------------------------------------------------------------------------
// Response examples, typed against the schema-derived response types
// ---------------------------------------------------------------------------

const markdownCreateResponseExamples = {
  createMarkdownResponse: {
    summary: 'Create markdown library item response',
    description:
      'Response to creating a markdown library item. Returns the generated ID, the full item state in `data`, and metadata.',
    value: {
      id: '5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e',
      data: markdownCreateBody,
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzU5LDFd',
      },
    } satisfies MarkdownCreateResponseBody,
  },
};

const markdownSearchResponseExamples = {
  searchMarkdownsResponse: {
    summary: 'Search markdown library items response',
    description:
      'Paginated list of markdown library item summaries. Each item includes the ID, a subset of state fields (`title` and `description`), and metadata. The full `content` is not included; use `GET /api/markdowns/{id}` to retrieve a specific item.',
    value: {
      data: [
        {
          id: '5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e',
          data: {
            title: markdownCreateBody.title,
            description: markdownCreateBody.description,
          },
          meta: {
            created_at: '2026-04-13T10:00:00.000Z',
            managed: false,
            updated_at: '2026-04-13T10:00:00.000Z',
            version: 'WzU5LDFd',
          },
        },
      ],
      meta: {
        page: 1,
        per_page: 20,
        total: 1,
      },
    } satisfies MarkdownSearchResponseBody,
  },
};

const markdownReadResponseExamples = {
  getMarkdownResponse: {
    summary: 'Get markdown library item response',
    description:
      'The full markdown library item state including `content`, `settings`, and metadata.',
    value: {
      id: '5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e',
      data: markdownCreateBody,
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzU5LDFd',
      },
    } satisfies MarkdownReadResponseBody,
  },
};

const markdownUpdateResponseExamples = {
  updatedMarkdownResponse: {
    summary: 'Update markdown library item response',
    description:
      'The complete updated markdown library item state after a full replacement. PUT replaces the entire item, so any fields omitted from the request are reset to their defaults.',
    value: {
      id: '5e1f3a20-c4d6-11ef-be8b-3c7c2b9d1f4e',
      data: markdownUpdateBody,
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T11:00:00.000Z',
        version: 'WzYwLDFd',
      },
    } satisfies MarkdownUpdateResponseBody,
  },
};

const markdownUpdateCreatedResponseExamples = {
  createdMarkdownResponse: {
    summary: 'Create markdown library item response (via upsert)',
    description:
      'Returned when the upsert created a new item because no item existed with the specified ID.',
    value: {
      id: 'web-logs-overview',
      data: markdownCreateBody,
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzU5LDFd',
      },
    } satisfies MarkdownUpdateResponseBody,
  },
};

// ---------------------------------------------------------------------------
// Exported OAS operation objects, consumed by the routes via
// `options.oasOperationObject` and deep-merged into the generated spec.
// ---------------------------------------------------------------------------

export const createMarkdownOASOperationObject = {
  description: markdownCreateDescription,
  'x-codeSamples': markdownCreateCodeSamples,
  requestBody: {
    content: {
      'application/json': {
        examples: markdownCreateRequestExamples,
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          examples: markdownCreateResponseExamples,
        },
      },
    },
  },
};

export const searchMarkdownOASOperationObject = {
  description: markdownSearchDescription,
  'x-codeSamples': markdownSearchCodeSamples,
  responses: {
    200: {
      content: {
        'application/json': {
          examples: markdownSearchResponseExamples,
        },
      },
    },
  },
};

export const readMarkdownOASOperationObject = {
  description: markdownReadDescription,
  'x-codeSamples': markdownReadCodeSamples,
  responses: {
    200: {
      content: {
        'application/json': {
          examples: markdownReadResponseExamples,
        },
      },
    },
  },
};

export const updateMarkdownOASOperationObject = {
  description: markdownUpdateDescription,
  'x-codeSamples': markdownUpdateCodeSamples,
  requestBody: {
    content: {
      'application/json': {
        examples: markdownUpdateRequestExamples,
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          examples: markdownUpdateResponseExamples,
        },
      },
    },
    201: {
      content: {
        'application/json': {
          examples: markdownUpdateCreatedResponseExamples,
        },
      },
    },
  },
};

export const deleteMarkdownOASOperationObject = {
  description: markdownDeleteDescription,
  'x-codeSamples': markdownDeleteCodeSamples,
  responses: {
    204: {
      description: 'No content, the markdown library item was successfully deleted.',
    },
  },
};
