/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getGeoPointSuggestion,
  buildSchemaSavePayload,
  convertToFieldDefinitionConfig,
} from './utils';
import type { MappedSchemaField, SchemaEditorField, SchemaField } from './types';
import type { Streams } from '@kbn/streams-schema';
import { omit } from 'lodash';

describe('buildSchemaSavePayload', () => {
  it('builds payload for wired streams by updating wired.fields', () => {
    const mockDefinition = buildWiredDefinition();

    const schemaFields: SchemaField[] = [
      {
        name: 'message',
        parent: '',
        status: 'mapped',
        type: 'keyword',
      },
      {
        name: '@timestamp',
        parent: '',
        status: 'mapped',
        type: 'date',
        format: 'strict_date_optional_time',
      },
      {
        name: 'severity',
        parent: '',
        status: 'mapped',
        type: 'keyword',
        additionalParameters: { ignore_above: 256 },
      },
    ];

    const payload = buildSchemaSavePayload(mockDefinition, schemaFields);

    expect(payload).toEqual({
      ingest: {
        ...mockDefinition.stream.ingest,
        processing: omit(mockDefinition.stream.ingest.processing, 'updated_at'),
        wired: {
          ...mockDefinition.stream.ingest.wired,
          fields: {
            message: { type: 'keyword' },
            '@timestamp': { type: 'date', format: 'strict_date_optional_time' },
            severity: { type: 'keyword', ignore_above: 256 },
          },
        },
      },
    });
  });

  it('builds payload for classic streams by updating classic.field_overrides', () => {
    const mockDefinition = buildClassicDefinition();
    const schemaFields: SchemaField[] = [
      {
        name: 'host.name',
        parent: '',
        status: 'mapped',
        type: 'keyword',
      },
      {
        name: 'event.ingested',
        parent: '',
        status: 'mapped',
        type: 'date',
      },
    ];

    const payload = buildSchemaSavePayload(mockDefinition, schemaFields);

    expect(payload).toEqual({
      ingest: {
        ...mockDefinition.stream.ingest,
        processing: omit(mockDefinition.stream.ingest.processing, 'updated_at'),
        classic: {
          ...mockDefinition.stream.ingest.classic,
          field_overrides: {
            'host.name': { type: 'keyword' },
            'event.ingested': { type: 'date' },
          },
        },
      },
    });
  });

  it('includes description in payload when provided', () => {
    const mockDefinition = buildWiredDefinition();
    const schemaFields: SchemaField[] = [
      {
        name: 'message',
        parent: '',
        status: 'mapped',
        type: 'keyword',
        description: 'The log message content',
      },
      {
        name: '@timestamp',
        parent: '',
        status: 'mapped',
        type: 'date',
        format: 'strict_date_optional_time',
        description: 'Event timestamp',
      },
    ];

    const payload = buildSchemaSavePayload(mockDefinition, schemaFields);

    expect(payload).toEqual({
      ingest: {
        ...mockDefinition.stream.ingest,
        processing: omit(mockDefinition.stream.ingest.processing, 'updated_at'),
        wired: {
          ...mockDefinition.stream.ingest.wired,
          fields: {
            message: { type: 'keyword', description: 'The log message content' },
            '@timestamp': {
              type: 'date',
              format: 'strict_date_optional_time',
              description: 'Event timestamp',
            },
          },
        },
      },
    });
  });

  it('builds payload for unmapped fields with description only', () => {
    const mockDefinition = buildWiredDefinition();
    const schemaFields: SchemaField[] = [
      {
        name: 'documented_field',
        parent: '',
        status: 'unmapped',
        description: 'This field is documented but not mapped to ES',
      },
      {
        name: 'regular_field',
        parent: '',
        status: 'mapped',
        type: 'keyword',
      },
    ];

    const payload = buildSchemaSavePayload(mockDefinition, schemaFields);

    expect(payload).toEqual({
      ingest: {
        ...mockDefinition.stream.ingest,
        processing: omit(mockDefinition.stream.ingest.processing, 'updated_at'),
        wired: {
          ...mockDefinition.stream.ingest.wired,
          fields: {
            documented_field: {
              description: 'This field is documented but not mapped to ES',
            },
            regular_field: { type: 'keyword' },
          },
        },
      },
    });
  });

  it('does not include empty description in payload', () => {
    const mockDefinition = buildWiredDefinition();
    const schemaFields: SchemaField[] = [
      {
        name: 'message',
        parent: '',
        status: 'mapped',
        type: 'keyword',
        description: '',
      },
    ];

    const payload = buildSchemaSavePayload(mockDefinition, schemaFields);

    expect(payload).toEqual({
      ingest: {
        ...mockDefinition.stream.ingest,
        processing: omit(mockDefinition.stream.ingest.processing, 'updated_at'),
        wired: {
          ...mockDefinition.stream.ingest.wired,
          fields: {
            message: { type: 'keyword' },
          },
        },
      },
    });
  });

  it('preserves description overrides on inherited fields', () => {
    const mockDefinition = buildWiredDefinition({
      inherited_fields: {
        trace_id: {
          type: 'keyword',
          from: 'logs',
          // No description in the inherited field
        },
      },
    });
    const schemaFields: SchemaField[] = [
      {
        name: 'trace_id',
        parent: 'logs',
        status: 'inherited',
        type: 'keyword',
        description: 'Description override on child stream',
      },
      {
        name: 'new_field',
        parent: 'logs.child',
        status: 'mapped',
        type: 'keyword',
        description: 'A newly mapped field',
      },
    ];

    const payload = buildSchemaSavePayload(mockDefinition, schemaFields);

    expect('wired' in payload.ingest && payload.ingest.wired.fields).toEqual({
      trace_id: { description: 'Description override on child stream' },
      new_field: { type: 'keyword', description: 'A newly mapped field' },
    });
  });

  it('does not persist inherited field description if it matches inherited description', () => {
    const mockDefinition = buildWiredDefinition({
      inherited_fields: {
        trace_id: {
          type: 'keyword',
          from: 'logs',
          description: 'Same description',
        },
      },
    });
    const schemaFields: SchemaField[] = [
      {
        name: 'trace_id',
        parent: 'logs',
        status: 'inherited',
        type: 'keyword',
        description: 'Same description',
      },
    ];

    const payload = buildSchemaSavePayload(mockDefinition, schemaFields);

    // Should not include trace_id since description matches inherited
    expect('wired' in payload.ingest && payload.ingest.wired.fields).toEqual({});
  });
});

describe('convertToFieldDefinitionConfig', () => {
  it('throws for system-managed field type', () => {
    const field = {
      name: '@timestamp',
      parent: 'logs',
      status: 'mapped',
      type: 'system',
    } as MappedSchemaField;

    expect(() => convertToFieldDefinitionConfig(field)).toThrow(
      'Cannot convert system-managed field type to FieldDefinitionConfig'
    );
  });

  it('converts a valid mapped field', () => {
    const field = {
      name: 'message',
      parent: 'logs',
      status: 'mapped',
      type: 'keyword',
      description: 'The log message',
    } as MappedSchemaField;

    const config = convertToFieldDefinitionConfig(field);

    expect(config).toEqual({
      type: 'keyword',
      description: 'The log message',
    });
  });
});

const privileges = {
  manage: true,
  monitor: true,
  view_index_metadata: true,
  lifecycle: true,
  simulate: true,
  text_structure: true,
  read_failure_store: true,
  manage_failure_store: true,
  create_snapshot_repository: true,
};

const buildWiredDefinition = (
  overrides?: Partial<Streams.WiredStream.GetResponse>
): Streams.WiredStream.GetResponse => ({
  stream: {
    type: 'wired',
    name: 'logs',
    description: 'Wired stream',
    updated_at: new Date().toISOString(),
    ingest: {
      lifecycle: { dsl: { data_retention: '1d' } },
      processing: { steps: [], updated_at: new Date().toISOString() },
      settings: {},
      wired: {
        fields: {},
        routing: [],
      },
      failure_store: { disabled: {} },
    },
  },
  dashboards: [],
  rules: [],
  inherited_fields: {},
  effective_lifecycle: { dsl: { data_retention: '1d' }, from: 'parent' },
  effective_settings: {},
  data_stream_exists: true,
  privileges: { ...privileges },
  effective_failure_store: { disabled: {}, from: 'parent' },
  ...overrides,
});

const buildClassicDefinition = (): Streams.ClassicStream.GetResponse => ({
  stream: {
    type: 'classic',
    name: 'logs-classic',
    description: 'Classic stream',
    updated_at: new Date().toISOString(),
    ingest: {
      lifecycle: { dsl: { data_retention: '1d' } },
      processing: { steps: [], updated_at: new Date().toISOString() },
      settings: {},
      classic: {
        field_overrides: {},
      },
      failure_store: { disabled: {} },
    },
  },
  dashboards: [],
  rules: [],
  elasticsearch_assets: undefined,
  data_stream_exists: true,
  effective_lifecycle: { inherit: {} },
  effective_settings: {},
  privileges: { ...privileges },
  effective_failure_store: { disabled: {} },
});

describe('getGeoPointSuggestion', () => {
  const mockFields = [
    { name: 'geo.lat', status: 'unmapped' },
    { name: 'geo.lon', status: 'unmapped' },
    { name: 'other', status: 'mapped', type: 'keyword' },
  ] as SchemaEditorField[];

  it('should return null for non-classic streams', () => {
    expect(
      getGeoPointSuggestion({ fieldName: 'geo.lat', fields: mockFields, streamType: 'wired' })
    ).toBeNull();
  });

  it('should return null if fields are undefined', () => {
    expect(
      getGeoPointSuggestion({ fieldName: 'geo.lat', fields: undefined, streamType: 'classic' })
    ).toBeNull();
  });

  it('should return null if field name does not end in .lat or .lon', () => {
    expect(
      getGeoPointSuggestion({ fieldName: 'geo.other', fields: mockFields, streamType: 'classic' })
    ).toBeNull();
  });

  it('should return suggestion if sibling exists and base field is not mapped as geo_point', () => {
    expect(
      getGeoPointSuggestion({ fieldName: 'geo.lat', fields: mockFields, streamType: 'classic' })
    ).toEqual({ base: 'geo' });
    expect(
      getGeoPointSuggestion({ fieldName: 'geo.lon', fields: mockFields, streamType: 'classic' })
    ).toEqual({ base: 'geo' });
  });

  it('should return null if sibling does not exist', () => {
    const fields = [{ name: 'geo.lat', status: 'unmapped' }] as SchemaEditorField[];
    expect(
      getGeoPointSuggestion({ fieldName: 'geo.lat', fields, streamType: 'classic' })
    ).toBeNull();
  });

  it('should return null if base field is already mapped as geo_point', () => {
    const fields = [
      { name: 'geo.lat', status: 'unmapped' },
      { name: 'geo.lon', status: 'unmapped' },
      { name: 'geo', status: 'mapped', type: 'geo_point' },
    ] as SchemaEditorField[];
    expect(
      getGeoPointSuggestion({ fieldName: 'geo.lat', fields, streamType: 'classic' })
    ).toBeNull();
  });
});
