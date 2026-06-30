/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { emptyAssets } from '../../helpers/empty_assets';
import { ClassicIngestUpsertRequest, ClassicStream } from './classic';

describe('ClassicStream', () => {
  describe('Definition', () => {
    it.each([
      {
        type: 'classic' as const,
        name: 'classic-stream',
        description: '',
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [], updated_at: new Date().toISOString() },
          settings: {},
          classic: {},
          failure_store: { inherit: {} },
        },
      },
      {
        type: 'classic' as const,
        name: 'classic-stream-with-fields',
        description: '',
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [], updated_at: new Date().toISOString() },
          settings: {},
          classic: {
            field_overrides: {
              xxx: {
                type: 'keyword',
              },
            },
          },
          failure_store: { inherit: {} },
        },
      },
    ] satisfies ClassicStream.Definition[])('is valid', (val) => {
      expect(ClassicStream.Definition.asserts(val)).toBe(true);
      expect(ClassicStream.Definition.right.parse(val)).toEqual(val);
    });

    it.each([
      {
        name: 'classic-stream',
        description: null,
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [] },
          settings: {},
          classic: {},
        },
      },
      {
        name: 'classic-stream',
        description: '',
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [] },
          settings: {},
          classic: {},
        },
      },
      {
        name: 'classic-stream',
        description: '',
        updated_at: new Date().toISOString(),
        ingest: {
          classic: {},
        },
      },
      {
        name: 'classic-stream',
        description: '',
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [] },
          settings: {},
          classic: {},
          wired: {},
        },
      },
    ])('is not valid', (val) => {
      expect(() =>
        ClassicStream.Definition.asserts(
          val as Parameters<typeof ClassicStream.Definition.asserts>[0]
        )
      ).toThrow();
    });
  });

  describe('GetResponse', () => {
    it.each([
      {
        stream: {
          type: 'classic' as const,
          name: 'classic-stream',
          description: '',
          updated_at: new Date().toISOString(),
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [], updated_at: new Date().toISOString() },
            settings: {},
            classic: {},
            failure_store: { inherit: {} },
          },
        },
        effective_lifecycle: {
          dsl: {},
        },
        effective_settings: {},
        privileges: {
          lifecycle: true,
          manage: true,
          monitor: true,
          simulate: true,
          text_structure: true,
          read_failure_store: true,
          manage_failure_store: true,
          create_snapshot_repository: true,
          view_index_metadata: true,
        },
        data_stream_exists: true,
        effective_failure_store: {
          lifecycle: { enabled: { data_retention: '30d', is_default_retention: true } },
        },
        ...emptyAssets,
      },
    ] satisfies ClassicStream.GetResponse[])('is valid', (val) => {
      expect(ClassicStream.GetResponse.is(val)).toBe(true);
      expect(ClassicStream.GetResponse.right.parse(val)).toEqual(val);
    });

    it.each([
      {
        stream: {
          description: '',
          updated_at: new Date().toISOString(),
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            classic: {},
          },
        },
        effective_lifecycle: {
          dsl: {},
        },
        effective_settings: {},
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
        data_stream_exists: true,
        dashboards: [],
        rules: [],
      },
    ])('is not valid', (val) => {
      expect(
        ClassicStream.GetResponse.is(
          val as unknown as Parameters<typeof ClassicStream.GetResponse.is>[0]
        )
      ).toBe(false);
    });
  });

  describe('UpsertRequest', () => {
    it.each([
      {
        stream: {
          type: 'classic' as const,
          description: '',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            classic: {},
            failure_store: { inherit: {} },
          },
        },
        ...emptyAssets,
      },
    ] satisfies ClassicStream.UpsertRequest[])('is valid', (val) => {
      expect(ClassicStream.UpsertRequest.is(val)).toBe(true);
      expect(ClassicStream.UpsertRequest.right.parse(val)).toEqual(val);
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
            classic: {},
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
            classic: {},
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
            classic: {},
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
        ClassicStream.UpsertRequest.is(val as Parameters<typeof ClassicStream.UpsertRequest.is>[0])
      ).toBe(false);
    });
  });

  describe('IngestUpsertRequest', () => {
    it.each([
      {
        lifecycle: { inherit: {} },
        processing: { steps: [] },
        settings: {},
        classic: {},
        failure_store: { inherit: {} },
      },
    ] satisfies ClassicIngestUpsertRequest[])('is valid', (val) => {
      expect(ClassicIngestUpsertRequest.is(val)).toBe(true);
      expect(ClassicIngestUpsertRequest.right.parse(val)).toEqual(val);
    });

    it.each([
      // Missing classic
      {
        lifecycle: { inherit: {} },
        processing: { steps: [] },
        settings: {},
      },
      // Missing processing
      {
        lifecycle: { inherit: {} },
        settings: {},
        classic: {},
      },
      // Missing settings
      {
        lifecycle: { inherit: {} },
        processing: { steps: [] },
        classic: {},
      },
      // Processing includes updated_at
      {
        lifecycle: { inherit: {} },
        processing: { steps: [], updated_at: new Date().toISOString() },
        settings: {},
        classic: {},
      },
    ])('is not valid', (val) => {
      expect(
        ClassicIngestUpsertRequest.is(
          val as unknown as Parameters<typeof ClassicIngestUpsertRequest.is>[0]
        )
      ).toBe(false);
    });
  });
});
