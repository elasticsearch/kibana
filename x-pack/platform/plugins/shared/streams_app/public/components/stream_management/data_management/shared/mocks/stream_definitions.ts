/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { emptyAssets, type Streams } from '@kbn/streams-schema';
import type { SchemaField } from '../../schema_editor/types';

// Mock stream definitions for reuse in tests
export const createMockClassicStreamDefinition = (
  overrides: Partial<Streams.ClassicStream.GetResponse> = {}
): Streams.ClassicStream.GetResponse => ({
  stream: {
    type: 'classic',
    name: 'logs.classic-test',
    description: '',
    updated_at: '2024-01-01T00:00:00.000Z',
    ingest: {
      lifecycle: { inherit: {} },
      processing: { steps: [], updated_at: '2024-01-01T00:00:00.000Z' },
      settings: {},
      failure_store: { inherit: {} },
      classic: {
        field_overrides: {
          'attributes.test_field': {
            type: 'keyword',
          },
        },
      },
    },
  },
  privileges: {
    manage: true,
    monitor: true,
    lifecycle: true,
    simulate: true,
    text_structure: true,
    read_failure_store: true,
    manage_failure_store: true,
    view_index_metadata: true,
    create_snapshot_repository: true,
  },
  data_stream_exists: true,
  effective_lifecycle: { dsl: {} },
  effective_failure_store: { lifecycle: { disabled: {} } },
  effective_settings: {},
  dashboards: [],
  rules: [],
  ...overrides,
});

export const createMockWiredStreamDefinition = (
  overrides: Partial<Streams.WiredStream.GetResponse> = {}
): Streams.WiredStream.GetResponse => ({
  stream: {
    type: 'wired',
    name: 'logs.wired-test',
    description: '',
    updated_at: '2024-01-01T00:00:00.000Z',
    ingest: {
      lifecycle: { inherit: {} },
      processing: { steps: [], updated_at: '2024-01-01T00:00:00.000Z' },
      settings: {},
      failure_store: { inherit: {} },
      wired: {
        fields: {
          'attributes.mapped_field': {
            type: 'keyword',
          },
        },
        routing: [],
      },
    },
  },
  privileges: {
    manage: true,
    monitor: true,
    lifecycle: true,
    simulate: true,
    text_structure: true,
    read_failure_store: true,
    manage_failure_store: true,
    view_index_metadata: true,
    create_snapshot_repository: true,
  },
  data_stream_exists: true,
  inherited_fields: {
    'attributes.inherited_field': {
      type: 'keyword',
      from: 'logs.parent',
    },
  },
  effective_lifecycle: {
    dsl: {},
    from: 'logs',
  },
  effective_failure_store: {
    lifecycle: { disabled: {} },
    from: 'logs',
  },
  effective_settings: {},
  dashboards: [],
  rules: [],
  ...overrides,
});

export const createMockQueryStreamDefinition = (
  overrides: Partial<Streams.QueryStream.GetResponse> = {}
): Streams.QueryStream.GetResponse => ({
  stream: {
    type: 'query',
    name: 'logs.ecs.query',
    description: '',
    updated_at: '2024-01-01T00:00:00.000Z',
    query: { view: '$.logs.ecs.query', esql: 'FROM $.logs.ecs | LIMIT 100' },
  },
  inherited_fields: {},
  ...emptyAssets,
  ...overrides,
});

// Factory functions for creating mock fields with custom values
export const createMockMappedField = (
  overrides: Partial<Omit<SchemaField, 'status'>> = {}
): SchemaField => ({
  name: 'attributes.test_field',
  type: 'keyword',
  parent: 'logs.test',
  ...overrides,
  status: 'mapped',
});

export const createMockUnmappedField = (
  overrides: Partial<Omit<SchemaField, 'status'>> = {}
): SchemaField => ({
  name: 'attributes.unmapped_field',
  parent: 'logs.test',
  ...overrides,
  status: 'unmapped',
});

export const createMockInheritedField = (
  overrides: Partial<Omit<SchemaField, 'status'>> = {}
): SchemaField => ({
  name: 'attributes.inherited_field',
  type: 'keyword',
  parent: 'logs.parent',
  ...overrides,
  status: 'inherited',
});

// Static mock field instances for simple cases
export const mockMappedField: SchemaField = createMockMappedField();
export const mockUnmappedField: SchemaField = createMockUnmappedField();
export const mockInheritedField: SchemaField = createMockInheritedField();
