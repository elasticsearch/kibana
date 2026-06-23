/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TagResponseItem, TagsSearchResponseBody } from './schemas';

const engineeringTag = {
  id: 'tag-engineering',
  data: {
    name: 'Engineering',
    description: 'Dashboards owned by engineering teams.',
    color: '#1BA9F5',
  },
  meta: {
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
    managed: false,
    version: 'WzEsMV0=',
  },
} satisfies TagResponseItem;

const operationsTag = {
  id: 'tag-operations',
  data: {
    name: 'Operations',
    description: 'Content used by operations teams.',
    color: '#54B399',
  },
  meta: {
    created_at: '2026-06-02T09:30:00.000Z',
    updated_at: '2026-06-02T09:30:00.000Z',
    managed: false,
    version: 'WzIsMV0=',
  },
} satisfies TagResponseItem;

const createTagRequest = {
  name: 'Security',
  description: 'Content related to security investigations.',
  color: '#F04E98',
};

const createdSecurityTag = {
  id: 'tag-security',
  data: createTagRequest,
  meta: {
    created_at: '2026-06-03T14:15:00.000Z',
    updated_at: '2026-06-03T14:15:00.000Z',
    managed: false,
    version: 'WzMsMV0=',
  },
} satisfies TagResponseItem;

const updateTagRequest = {
  name: 'Engineering',
  description: 'Dashboards and visualizations owned by engineering teams.',
  color: '#006BB4',
};

const updatedEngineeringTag = {
  id: 'tag-engineering',
  data: updateTagRequest,
  meta: {
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-06-05T16:45:00.000Z',
    managed: false,
    version: 'WzEsMl0=',
  },
} satisfies TagResponseItem;

const createdComplianceTag = {
  id: 'tag-compliance',
  data: {
    name: 'Compliance',
    description: 'Content used for compliance reporting.',
    color: '#9170B8',
  },
  meta: {
    created_at: '2026-06-06T10:20:00.000Z',
    updated_at: '2026-06-06T10:20:00.000Z',
    managed: false,
    version: 'WzQsMV0=',
  },
} satisfies TagResponseItem;

export const searchTagsOASOperationObject = {
  responses: {
    200: {
      content: {
        'application/json': {
          examples: {
            searchTagsResponse: {
              summary: 'Tags matching a search query',
              value: {
                data: [engineeringTag, operationsTag],
                meta: {
                  page: 1,
                  per_page: 20,
                  total: 2,
                },
              } satisfies TagsSearchResponseBody,
            },
          },
        },
      },
    },
  },
};

export const createTagOASOperationObject = {
  requestBody: {
    content: {
      'application/json': {
        examples: {
          createTagRequest: {
            summary: 'Create a tag',
            value: createTagRequest,
          },
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          examples: {
            createTagResponse: {
              summary: 'The created tag',
              value: createdSecurityTag,
            },
          },
        },
      },
    },
  },
};

export const readTagOASOperationObject = {
  responses: {
    200: {
      content: {
        'application/json': {
          examples: {
            readTagResponse: {
              summary: 'The requested tag',
              value: engineeringTag,
            },
          },
        },
      },
    },
  },
};

export const upsertTagOASOperationObject = {
  requestBody: {
    content: {
      'application/json': {
        examples: {
          upsertTagRequest: {
            summary: 'Update or create a tag',
            value: updateTagRequest,
          },
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          examples: {
            updateTagResponse: {
              summary: 'The updated tag',
              value: updatedEngineeringTag,
            },
          },
        },
      },
    },
    201: {
      content: {
        'application/json': {
          examples: {
            upsertTagCreatedResponse: {
              summary: 'The created tag',
              value: createdComplianceTag,
            },
          },
        },
      },
    },
  },
};
