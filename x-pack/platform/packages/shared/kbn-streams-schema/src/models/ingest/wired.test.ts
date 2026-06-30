/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { emptyAssets } from '../../helpers/empty_assets';
import { WiredIngestUpsertRequest } from './wired';
import { WiredStream } from './wired';

describe('WiredStream', () => {
  describe('Definition', () => {
    it.each([
      {
        type: 'wired' as const,
        name: 'wired-stream',
        description: '',
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [], updated_at: new Date().toISOString() },
          settings: {},
          wired: {
            fields: {},
            routing: [],
          },
          failure_store: { inherit: {} },
        },
      },
    ] satisfies WiredStream.Definition[])('is valid %s', (val) => {
      expect(WiredStream.Definition.is(val)).toBe(true);
      expect(WiredStream.Definition.right.parse(val)).toEqual(val);
    });

    it.each([
      {
        name: 'wired-stream',
        description: null,
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [] },
          settings: {},
          wired: {
            fields: {},
            routing: [],
          },
        },
      },
      {
        name: 'wired-stream',
        description: '',
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [] },
          settings: {},
          wired: {
            fields: {},
            routing: [],
          },
        },
      },
      {
        name: 'wired-stream',
        description: '',
        updated_at: new Date().toISOString(),
        ingest: {
          settings: {},
          wired: {
            fields: {},
            routing: [],
          },
        },
      },
      {
        name: 'wired-stream',
        description: '',
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { inherit: {} },
          settings: {},
          processing: { steps: [] },
          classic: {},
          wired: {
            fields: {},
            routing: [],
          },
        },
      },
    ])('is not valid %s', (val) => {
      expect(() =>
        WiredStream.Definition.asserts(val as Parameters<typeof WiredStream.Definition.asserts>[0])
      ).toThrow();
    });
  });

  describe('GetResponse', () => {
    it.each([
      {
        stream: {
          type: 'wired' as const,
          name: 'wired-stream',
          description: '',
          updated_at: new Date().toISOString(),
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [], updated_at: new Date().toISOString() },
            settings: {},
            wired: {
              fields: {},
              routing: [],
            },
            failure_store: { inherit: {} },
          },
        },
        privileges: {
          lifecycle: true,
          manage: true,
          monitor: true,
          simulate: true,
          text_structure: true,
          read_failure_store: true,
          manage_failure_store: true,
          view_index_metadata: true,
          create_snapshot_repository: true,
        },
        effective_lifecycle: {
          dsl: {},
          from: 'logs',
        },
        effective_settings: {},
        data_stream_exists: true,
        inherited_fields: {},
        effective_failure_store: {
          lifecycle: { enabled: { data_retention: '30d', is_default_retention: true } },
          from: 'logs',
        },
        ...emptyAssets,
      },
    ] satisfies WiredStream.GetResponse[])('is valid %s', (val) => {
      expect(WiredStream.GetResponse.is(val)).toBe(true);
      expect(WiredStream.GetResponse.right.parse(val)).toEqual(val);
    });

    it.each([
      {
        stream: {
          description: '',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            wired: {
              fields: {},
              routing: [],
            },
          },
        },
        effective_lifecycle: {
          dsl: {},
          from: 'logs',
        },
        effective_settings: {},
        inherited_fields: {},
        privileges: {
          lifecycle: true,
          manage: true,
          monitor: true,
          simulate: true,
          text_structure: true,
          failure_store: true,
          view_index_metadata: true,
          create_snapshot_repository: true,
        },
        dashboards: [],
        rules: [],
      },
    ])('is not valid', (val) => {
      expect(
        WiredStream.GetResponse.is(
          val as unknown as Parameters<typeof WiredStream.GetResponse.is>[0]
        )
      ).toBe(false);
    });
  });

  describe('UpsertRequest', () => {
    it.each([
      {
        stream: {
          type: 'wired' as const,
          description: '',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            wired: {
              fields: {},
              routing: [],
            },
            failure_store: { inherit: {} },
          },
        },
        ...emptyAssets,
      },
    ] satisfies WiredStream.UpsertRequest[])('is valid', (val) => {
      expect(WiredStream.UpsertRequest.is(val)).toBe(true);
      expect(WiredStream.UpsertRequest.right.parse(val)).toEqual(val);
    });

    it.each([
      {
        dashboards: [],
        stream: {
          name: 'my-name',
          description: '',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            wired: {
              fields: {},
              routing: [],
            },
          },
        },
      },
      {
        stream: {
          description: 'updated_at should not be present',
          updated_at: new Date().toISOString(),
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            wired: {
              fields: {},
              routing: [],
            },
          },
        },
        ...emptyAssets,
      },
      {
        stream: {
          description: 'ingest.processing.updated_at should not be present',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [], updated_at: new Date().toISOString() },
            settings: {},
            wired: {
              fields: {},
              routing: [],
            },
          },
        },
        ...emptyAssets,
      },
      {
        stream: {
          description: 'missing ingest',
        },
        ...emptyAssets,
      },
    ])('is not valid', (val) => {
      expect(
        WiredStream.UpsertRequest.is(val as Parameters<typeof WiredStream.UpsertRequest.is>[0])
      ).toBe(false);
    });
  });

  describe('IngestUpsertRequest', () => {
    it.each([
      {
        lifecycle: { inherit: {} },
        processing: { steps: [] },
        settings: {},
        wired: {
          fields: {},
          routing: [],
        },
        failure_store: { inherit: {} },
      },
    ] satisfies WiredIngestUpsertRequest[])('is valid', (val) => {
      expect(WiredIngestUpsertRequest.is(val)).toBe(true);
      expect(WiredIngestUpsertRequest.right.parse(val)).toEqual(val);
    });

    it.each([
      // Missing wired
      {
        lifecycle: { inherit: {} },
        processing: { steps: [] },
        settings: {},
      },
      // Missing processing
      {
        lifecycle: { inherit: {} },
        settings: {},
        wired: {
          fields: {},
          routing: [],
        },
      },
      // Missing settings
      {
        lifecycle: { inherit: {} },
        processing: { steps: [] },
        wired: {
          fields: {},
          routing: [],
        },
      },
      // Processing includes updated_at
      {
        lifecycle: { inherit: {} },
        processing: { steps: [], updated_at: new Date().toISOString() },
        settings: {},
        wired: {
          fields: {},
          routing: [],
        },
      },
    ])('is not valid', (val) => {
      expect(
        WiredIngestUpsertRequest.is(
          val as unknown as Parameters<typeof WiredIngestUpsertRequest.is>[0]
        )
      ).toBe(false);
    });
  });
});
