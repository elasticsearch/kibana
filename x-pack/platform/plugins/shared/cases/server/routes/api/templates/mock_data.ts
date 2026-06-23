/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stringify as yamlStringify } from 'yaml';
import type { Template } from '../../../../common/types/domain/template/v1';

// Mock data store (simulates database)
export const mockTemplates: Template[] = [
  {
    templateId: 'template-1',
    name: 'Security Incident Template',
    owner: 'securitySolution',
    tags: ['security', 'incident'],
    author: 'alice',
    definition: yamlStringify({
      name: 'Security Incident Template',
      fields: [
        {
          control: 'INPUT_TEXT',
          name: 'incident_type',
          label: 'Incident Type',
          type: 'keyword',
        },
        {
          control: 'SELECT_BASIC',
          name: 'severity',
          label: 'Severity Level',
          type: 'keyword',
          metadata: { options: ['low', 'medium', 'high', 'critical'] },
        },
      ],
    }),
    templateVersion: 1,
    deletedAt: null,
  },
  {
    templateId: 'template-2',
    name: 'Observability Alert Template',
    owner: 'observability',
    tags: ['observability', 'alert'],
    author: 'bob',
    definition: yamlStringify({
      name: 'Observability Alert Template',
      fields: [
        {
          control: 'INPUT_TEXT',
          name: 'alert_source',
          label: 'Alert Source',
          type: 'keyword',
        },
      ],
    }),
    templateVersion: 2,
    deletedAt: null,
  },
  {
    templateId: 'template-3',
    name: 'Deleted Template',
    owner: 'securitySolution',
    tags: ['security', 'deleted'],
    author: 'charlie',
    definition: yamlStringify({ fields: [] }),
    templateVersion: 1,
    deletedAt: '2024-01-15T10:00:00.000Z',
  },
];
