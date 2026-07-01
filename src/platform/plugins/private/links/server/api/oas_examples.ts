/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';

import { DEFAULT_DASHBOARD_NAVIGATION_OPTIONS } from '@kbn/dashboard-navigation-options-common';
import { DEFAULT_EXTERNAL_LINK_OPTIONS, LINKS_API_PATH } from '../../common/constants';
import type { LinksCreateRequestBody, LinksCreateResponseBody } from './create';
import type { LinksReadResponseBody } from './read';
import type { LinksSearchResponseBody } from './search';
import type { LinksUpdateRequestBody, LinksUpdateResponseBody } from './update';
import {
  LINKS_CREATE_DESCRIPTION,
  LINKS_DELETE_DESCRIPTION,
  LINKS_READ_DESCRIPTION,
  LINKS_SEARCH_DESCRIPTION,
  LINKS_UPDATE_DESCRIPTION,
} from './constants';

// ---------------------------------------------------------------------------
// Create route
// ---------------------------------------------------------------------------

const linksCreateBody: LinksCreateRequestBody = {
  title: 'Important Resources',
  description: 'A collection of important links',
  links: [
    {
      label: 'Overview',
      type: 'dashboardLink',
      destination: 'dashboard-abc-123',
      options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
    },
    {
      label: 'Elastic Documentation',
      type: 'externalLink',
      destination: 'https://www.elastic.co/docs',
      options: DEFAULT_EXTERNAL_LINK_OPTIONS,
    },
  ],
  layout: 'horizontal',
};

const linksCreateRequestExamples = {
  createLinks: {
    summary: 'Create a links library item',
    value: {
      ...linksCreateBody,
      links: [
        {
          ...omit(linksCreateBody.links[0], 'options'),
        },
        {
          ...omit(linksCreateBody.links[1], 'options'),
        },
      ],
    },
  },
};

const linksCreateResponseExamples = {
  createLinks: {
    summary: 'Create links library item response',
    description: LINKS_CREATE_DESCRIPTION,
    value: {
      id: '0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3',
      data: linksCreateBody,
      meta: {
        created_at: '2026-06-03T23:33:39.979Z',
        created_by: 'u_EWATCHX9oIEsmcXj8aA1FkcaY3DE-XEpsiGTjrR2PmM_0',
        managed: false,
        updated_at: '2026-06-03T23:33:39.979Z',
        updated_by: 'u_EWATCHX9oIEsmcXj8aA1FkcaY3DE-XEpsiGTjrR2PmM_0',
        version: 'WzEwNywxXQ==',
      },
    } satisfies LinksCreateResponseBody,
  },
};

export const createLinksOASOperationObject = {
  description: LINKS_CREATE_DESCRIPTION,
  'x-codeSamples': [
    {
      label: 'Create a links library item - cURL',
      lang: 'curl',
      source:
        `curl \\\n  -X POST "\${KIBANA_URL}${LINKS_API_PATH}" \\\n` +
        '  -H "Authorization: ApiKey ${API_KEY}" \\\n' +
        '  -H "kbn-xsrf: true" \\\n' +
        '  -H "Content-Type: application/json" \\\n' +
        `  -d '${JSON.stringify(linksCreateRequestExamples.createLinks.value, null, 2)}'`,
    },
    {
      lang: 'Create a links library item - Console',
      source:
        `POST kbn:${LINKS_API_PATH}\n` +
        JSON.stringify(linksCreateRequestExamples.createLinks, null, 2) +
        '\n',
    },
  ],
  requestBody: {
    content: {
      'application/json': {
        examples: linksCreateRequestExamples,
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          examples: linksCreateResponseExamples,
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Search route
// ---------------------------------------------------------------------------

const linksSearchResponseExamples = {
  searchLinks: {
    summary: 'Search links library items response',
    description: LINKS_SEARCH_DESCRIPTION,
    value: {
      data: [
        {
          id: '0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3',
          data: {
            title: linksCreateBody.title!,
            description: linksCreateBody.description,
          },
          meta: {
            created_at: '2026-06-03T23:33:39.979Z',
            created_by: 'u_EWATCHX9oIEsmcXj8aA1FkcaY3DE-XEpsiGTjrR2PmM_0',
            managed: false,
            updated_at: '2026-06-03T23:33:39.979Z',
            updated_by: 'u_EWATCHX9oIEsmcXj8aA1FkcaY3DE-XEpsiGTjrR2PmM_0',
            version: 'WzEwNywxXQ==',
          },
        },
      ],
      meta: {
        page: 1,
        per_page: 20,
        total: 1,
      },
    } satisfies LinksSearchResponseBody,
  },
};

export const searchLinksOASOperationObject = {
  description: LINKS_SEARCH_DESCRIPTION,
  'x-codeSamples': [
    {
      lang: 'cURL',
      label: 'Search links library items - cURL',
      source:
        'curl -X GET "${KIBANA_URL}/api/links?query=welcome&per_page=10" \\\n' +
        '  -H "Authorization: ApiKey ${API_KEY}"\n',
    },
    {
      lang: 'Console',
      label: 'Search links library items - Console',
      source: 'GET kbn:/api/links?query=welcome&per_page=10\n',
    },
  ],
  responses: {
    200: {
      content: {
        'application/json': {
          examples: linksSearchResponseExamples,
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Read route
// ---------------------------------------------------------------------------

const linksReadResponseExamples = {
  getLinksResponse: {
    summary: 'Get links library item response',
    description:
      'The full links library item state including `links`, `layout`, `title`, `description`, and metadata.',
    value: {
      id: '0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3',
      data: linksCreateBody,
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzU5LDFd',
      },
    } satisfies LinksReadResponseBody,
  },
};

export const readLinksOASOperationObject = {
  description: LINKS_READ_DESCRIPTION,
  'x-codeSamples': [
    {
      lang: 'cURL',
      label: 'Get a links library item - cURL',
      source:
        'curl -X GET "${KIBANA_URL}/api/links/0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3" \\\n' +
        '  -H "Authorization: ApiKey ${API_KEY}"\n',
    },
    {
      lang: 'Console',
      label: 'Get a links library item - Console',
      source: 'GET kbn:/api/links/0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3\n',
    },
  ],
  responses: {
    200: {
      content: {
        'application/json': {
          examples: linksReadResponseExamples,
        },
      },
    },
    404: {
      description: 'A links library item with the given ID was not found.',
    },
  },
};

// ---------------------------------------------------------------------------
// Update route
// ---------------------------------------------------------------------------

const linksUpdateBody: LinksUpdateRequestBody = {
  ...linksCreateBody,
  layout: 'vertical',
};

const linksUpdateRequestExamples = {
  upsertLinks: {
    summary: 'Upsert a links library item',
    value: linksUpdateBody,
  },
};

const linksCreateWithUpdateResponseExamples = {
  createdLinks: {
    summary: 'Create links library item response (via upsert)',
    description:
      'Returned when the upsert created a new item because no item existed with the specified ID.',
    value: {
      id: '0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3',
      data: linksCreateBody,
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzU5LDFd',
      },
    } satisfies LinksUpdateResponseBody,
  },
};

const linksUpdateResponseExamples = {
  upsertLinks: {
    summary: 'Update links library item response',
    description:
      'The complete updated links library item state after a full replacement. PUT replaces the entire item, so any fields omitted from the request are reset to their defaults.',
    value: {
      id: '0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3',
      data: linksUpdateBody,
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T11:00:00.000Z',
        version: 'WzYwLDFd',
      },
    } satisfies LinksUpdateResponseBody,
  },
};

export const updateLinksOASOperationObject = {
  description: LINKS_UPDATE_DESCRIPTION,
  'x-codeSamples': [
    {
      label: 'Upsert a links library item - cURL',
      lang: 'curl',
      source:
        `curl \\\n  -X PUT "\${KIBANA_URL}${LINKS_API_PATH}/0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3" \\\n` +
        '  -H "Authorization: ApiKey ${API_KEY}" \\\n' +
        '  -H "kbn-xsrf: true" \\\n' +
        '  -H "Content-Type: application/json" \\\n' +
        `  -d '${JSON.stringify(linksUpdateBody, null, 2)}'`,
    },
    {
      label: 'Upsert a links library item - Console',
      lang: 'Console',
      source:
        `PUT kbn:${LINKS_API_PATH}/0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3\n` +
        JSON.stringify(linksUpdateBody, null, 2) +
        '\n',
    },
  ],
  requestBody: {
    content: {
      'application/json': {
        examples: linksUpdateRequestExamples,
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          examples: linksUpdateResponseExamples,
        },
      },
    },
    201: {
      content: {
        'application/json': {
          examples: linksCreateWithUpdateResponseExamples,
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Delete route
// ---------------------------------------------------------------------------

export const deleteLinksOASOperationObject = {
  description: LINKS_DELETE_DESCRIPTION,
  'x-codeSamples': [
    {
      lang: 'cURL',
      label: 'Delete a links library item - cURL',
      source:
        'curl -X DELETE "${KIBANA_URL}/api/links/0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3" \\\n' +
        '  -H "Authorization: ApiKey ${API_KEY}" \\\n' +
        '  -H "kbn-xsrf: true"\n',
    },
    {
      lang: 'Console',
      label: 'Delete a links library item - Console',
      source: 'DELETE kbn:/api/links/0ee9d0ea-06a0-4a30-bf4e-be4d3ca85bf3\n',
    },
  ],
  responses: {
    204: {
      description: 'No content, the links library item was successfully deleted.',
    },
    404: {
      description: 'A links library item with the given ID was not found.',
    },
  },
};
