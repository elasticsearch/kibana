/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { PropertyName, MappingProperty } from '@elastic/elasticsearch/lib/api/types';

export const buildkiteProperties: Record<PropertyName, MappingProperty> = {
  branch: {
    type: 'keyword',
  },
  commit: {
    type: 'wildcard',
  },
  job_id: {
    type: 'wildcard',
  },
  build: {
    type: 'object',
    properties: {
      id: {
        type: 'wildcard',
      },
      number: {
        type: 'integer',
      },
      url: {
        type: 'wildcard',
      },
    },
  },
  pipeline: {
    type: 'object',
    properties: {
      id: {
        type: 'wildcard',
      },
      name: {
        type: 'text',
      },
      slug: {
        type: 'keyword',
      },
    },
  },
  agent: {
    type: 'object',
    properties: {
      name: {
        type: 'wildcard',
      },
    },
  },
  group: {
    type: 'object',
    properties: {
      id: {
        type: 'wildcard',
      },
      key: {
        type: 'wildcard',
      },
      label: {
        type: 'keyword',
      },
    },
  },
  step: {
    type: 'object',
    properties: {
      id: {
        type: 'wildcard',
      },
      key: {
        type: 'wildcard',
      },
      label: {
        type: 'keyword',
      },
    },
  },
  command: {
    type: 'wildcard',
    fields: {
      text: {
        type: 'match_only_text',
      },
    },
  },
  triggered_from_build: {
    type: 'object',
    properties: {
      id: {
        type: 'wildcard',
      },
      number: {
        type: 'integer',
      },
      pipeline_slug: {
        type: 'keyword',
      },
    },
  },
};

export const fileInfoProperties: Record<PropertyName, MappingProperty> = {
  path: {
    type: 'keyword',
  },
  owner: {
    type: 'keyword',
  },
  area: {
    type: 'keyword',
  },
};

export const reporterProperties: Record<PropertyName, MappingProperty> = {
  name: {
    type: 'text',
  },
  type: {
    type: 'keyword',
  },
};

export const testRunProperties: Record<PropertyName, MappingProperty> = {
  id: {
    type: 'wildcard',
  },
  target: {
    type: 'object',
    properties: {
      type: {
        type: 'keyword',
      },
      mode: {
        type: 'keyword',
      },
    },
  },
  fully_parallel: {
    type: 'boolean',
  },
  status: {
    type: 'keyword',
  },
  duration: {
    type: 'long',
  },
  tests: {
    type: 'object',
    properties: {
      passes: {
        type: 'long',
      },
      failures: {
        type: 'long',
      },
      pending: {
        type: 'long',
      },
      total: {
        type: 'long',
      },
    },
  },
  config: {
    type: 'object',
    properties: {
      file: {
        type: 'object',
        properties: fileInfoProperties,
      },
      category: {
        type: 'keyword',
      },
      namespace: {
        type: 'keyword',
      },
    },
  },
};

export const suiteProperties: Record<PropertyName, MappingProperty> = {
  title: {
    type: 'text',
  },
  type: {
    type: 'keyword',
  },
};

export const testProperties: Record<PropertyName, MappingProperty> = {
  id: {
    type: 'wildcard',
  },
  title: {
    type: 'text',
  },
  tags: {
    type: 'keyword',
  },
  annotations: {
    type: 'object',
    properties: {
      type: {
        type: 'keyword',
      },
      description: {
        type: 'text',
      },
    },
  },
  expected_status: {
    type: 'keyword',
  },
  duration: {
    type: 'long',
  },
  status: {
    type: 'keyword',
  },
  console_errors: {
    type: 'match_only_text',
  },
  step: {
    type: 'object',
    properties: {
      title: {
        type: 'text',
      },
      category: {
        type: 'keyword',
      },
      duration: {
        type: 'long',
      },
    },
  },
  file: {
    type: 'object',
    properties: fileInfoProperties,
  },
};
