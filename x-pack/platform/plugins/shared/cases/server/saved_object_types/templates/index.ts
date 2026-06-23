/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsType } from '@kbn/core/server';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { type Template } from '../../../common/types/domain/template/latest';
import { CASE_TEMPLATE_SAVED_OBJECT } from '../../../common/constants';
import { modelVersion1 } from './model_versions/model_version_1';

const mappings = {
  dynamic: false,
  properties: {
    templateId: {
      type: 'keyword',
      ignore_above: 1024,
    },
    name: {
      type: 'keyword',
      ignore_above: 1024,
    },
    templateVersion: {
      type: 'integer',
    },
    owner: {
      type: 'keyword',
      ignore_above: 1024,
    },
    // NOTE: yaml-based template definition
    definition: {
      type: 'text',
    },
    // NOTE: other timestamp fields are provided by the SO api / model itself
    deletedAt: {
      type: 'date',
    },
    // Optional fields - not indexed due to dynamic: false, but needed for type checking
    description: {
      type: 'text',
    },
    tags: {
      type: 'keyword',
      ignore_above: 1024,
    },
    author: {
      type: 'keyword',
      ignore_above: 1024,
    },
    usageCount: {
      type: 'integer',
    },
    fieldCount: {
      type: 'integer',
    },
    fieldNames: {
      type: 'nested',
      properties: {
        name: { type: 'keyword', ignore_above: 1024 },
        label: { type: 'text' },
        type: { type: 'keyword', ignore_above: 1024 },
        control: { type: 'keyword', ignore_above: 1024 },
      },
    },
    lastUsedAt: {
      type: 'date',
    },
    isDefault: {
      type: 'boolean',
    },
    isLatest: {
      type: 'boolean',
    },
    isEnabled: {
      type: 'boolean',
    },
  },
} as const;

/**
 * The comments in the mapping indicate the additional properties that are stored in Elasticsearch but are not indexed.
 * Remove these comments when https://github.com/elastic/kibana/issues/152756 is resolved.
 */

export const caseTemplateSavedObjectType: SavedObjectsType = {
  name: CASE_TEMPLATE_SAVED_OBJECT,
  indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
  hidden: true,
  namespaceType: 'multiple-isolated',
  convertToMultiNamespaceTypeVersion: '8.0.0',
  mappings,
  modelVersions: {
    1: modelVersion1,
  },
};

// NOTE: maintain type "connection" with Domain Schema
mappings.properties satisfies Record<keyof Template, unknown>;
