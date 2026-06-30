/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GrokCollection } from '@kbn/grok-ui';
import type { StreamlangStepWithUIAttributes } from '@kbn/streamlang';
import { ALWAYS_CONDITION, convertUIStepsToDSL } from '@kbn/streamlang';
import type { Streams } from '@kbn/streams-schema';
import { type FieldDefinition, type FlattenRecord } from '@kbn/streams-schema';
import { omit } from 'lodash';
import { buildUpsertStreamRequestPayload, getDefaultFormStateByType } from './utils';

let grokCollection: GrokCollection;

describe('utils', () => {
  beforeAll(async () => {
    grokCollection = new GrokCollection();
    await grokCollection.setup();
  });
  describe('defaultGrokProcessorFormState', () => {
    it('should return default form state with empty field when no well known text fields are present', () => {
      const sampleDocs: FlattenRecord[] = [
        {
          'unknown.field': 'some value',
          'another.field': 'another value',
        },
        {
          'random.field': 'random value',
        },
      ];

      const result = getDefaultFormStateByType('grok', sampleDocs, { grokCollection });

      expect(omit(result, 'patterns')).toEqual({
        action: 'grok',
        from: '',
        ignore_failure: true,
        ignore_missing: true,
        where: ALWAYS_CONDITION,
      });

      if (result.action === 'grok') {
        expect(result.patterns[0]).toEqual({ value: '' });
      } else {
        throw new Error('Result is not a grok processor');
      }
    });

    it('should select the only well known text field present', () => {
      const sampleDocs: FlattenRecord[] = [
        {
          'error.message': 'This is an error',
          'another.field': 'another value',
        },
        {
          'error.message': 'Another error',
          'random.field': 'random value',
        },
      ];

      const result = getDefaultFormStateByType('grok', sampleDocs, { grokCollection });

      expect(omit(result, 'patterns')).toEqual({
        action: 'grok',
        from: 'error.message',
        ignore_failure: true,
        ignore_missing: true,
        where: ALWAYS_CONDITION,
      });

      if (result.action === 'grok') {
        expect(result.patterns[0]).toEqual({ value: '' });
      } else {
        throw new Error('Result is not a grok processor');
      }
    });

    it('should select the most common well known text field when multiple are present', () => {
      const sampleDocs: FlattenRecord[] = [
        {
          message: 'Log message 1',
          'error.message': 'Error message 1',
        },
        {
          message: 'Log message 2',
          'error.message': 'Error message 2',
        },
        {
          'error.message': 'Error message 3',
        },
      ];

      const result = getDefaultFormStateByType('grok', sampleDocs, { grokCollection });

      expect(omit(result, 'patterns')).toEqual({
        action: 'grok',
        from: 'error.message', // 'error.message' appears 3 times vs 'message' 2 times
        ignore_failure: true,
        ignore_missing: true,
        where: ALWAYS_CONDITION,
      });

      if (result.action === 'grok') {
        expect(result.patterns[0]).toEqual({ value: '' });
      } else {
        throw new Error('Result is not a grok processor');
      }
    });

    it('should select based on WELL_KNOWN_TEXT_FIELDS order when frequencies are equal', () => {
      const sampleDocs: FlattenRecord[] = [
        {
          message: 'Log message 1',
          'error.message': 'Error message 1',
          'event.original': 'Original event 1',
        },
        {
          message: 'Log message 2',
          'error.message': 'Error message 2',
          'event.original': 'Original event 2',
        },
      ];

      const result = getDefaultFormStateByType('grok', sampleDocs, { grokCollection });

      // In WELL_KNOWN_TEXT_FIELDS, 'message' comes before 'error.message' and 'event.original'
      expect(omit(result, 'patterns')).toEqual({
        action: 'grok',
        from: 'message',
        ignore_failure: true,
        ignore_missing: true,
        where: ALWAYS_CONDITION,
      });

      if (result.action === 'grok') {
        expect(result.patterns[0]).toEqual({ value: '' });
      } else {
        throw new Error('Result is not a grok processor');
      }
    });
  });

  describe('buildUpsertStreamRequestPayload()', () => {
    const mockSteps: StreamlangStepWithUIAttributes[] = [
      {
        customIdentifier: 'set-1',
        parentId: null,
        action: 'set',
        to: 'event.outcome',
        value: 'processed',
      },
      {
        customIdentifier: 'append-1',
        parentId: null,
        action: 'append',
        to: 'tags',
        value: ['streams'],
      },
    ];

    it('builds payload for wired stream definitions and replaces wired fields', () => {
      const wiredDefinition = createWiredDefinition();
      const updatedFields: FieldDefinition = {
        message: { type: 'match_only_text' },
      };

      const result = buildUpsertStreamRequestPayload(
        wiredDefinition,
        convertUIStepsToDSL(mockSteps),
        updatedFields
      );

      expect(result).toEqual({
        ingest: {
          ...wiredDefinition.stream.ingest,
          processing: convertUIStepsToDSL(mockSteps),
          wired: {
            ...wiredDefinition.stream.ingest.wired,
            fields: updatedFields,
          },
        },
      });
    });

    it('builds payload for classic stream definitions and replaces field overrides', () => {
      const classicDefinition = createClassicDefinition();
      const overrides: FieldDefinition = {
        severity: { type: 'keyword' },
      };

      const result = buildUpsertStreamRequestPayload(
        classicDefinition,
        convertUIStepsToDSL(mockSteps),
        overrides
      );

      expect(result).toEqual({
        ingest: {
          ...classicDefinition.stream.ingest,
          processing: convertUIStepsToDSL(mockSteps),
          classic: {
            ...classicDefinition.stream.ingest.classic,
            field_overrides: overrides,
          },
        },
      });
    });

    const createPrivileges = () => ({
      manage: true,
      monitor: true,
      view_index_metadata: true,
      lifecycle: true,
      simulate: true,
      text_structure: true,
      read_failure_store: true,
      manage_failure_store: true,
      create_snapshot_repository: true,
    });

    const createWiredDefinition = (): Streams.WiredStream.GetResponse => ({
      dashboards: [],
      rules: [],
      privileges: createPrivileges(),
      inherited_fields: {},
      effective_lifecycle: { dsl: { data_retention: '1d' }, from: 'ancestor' },
      effective_settings: {},
      data_stream_exists: true,
      stream: {
        type: 'wired',
        name: 'wired-stream',
        description: 'A wired stream',
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { dsl: { data_retention: '1d' } },
          processing: { steps: [], updated_at: new Date().toISOString() },
          settings: {},
          wired: {
            fields: { '@timestamp': { type: 'date' } },
            routing: [],
          },
          failure_store: { disabled: {} },
        },
      },
      effective_failure_store: { disabled: {}, from: 'parent' },
    });

    const createClassicDefinition = (): Streams.ClassicStream.GetResponse => ({
      dashboards: [],
      rules: [],
      privileges: createPrivileges(),
      data_stream_exists: true,
      effective_lifecycle: { inherit: {} },
      effective_settings: {},
      stream: {
        type: 'classic',
        name: 'classic-stream',
        description: 'A classic stream',
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { dsl: { data_retention: '1d' } },
          processing: { steps: [], updated_at: new Date().toISOString() },
          settings: {},
          classic: {
            field_overrides: { '@timestamp': { type: 'date' } },
          },
          failure_store: { disabled: {} },
        },
      },
      effective_failure_store: { disabled: {} },
    });
  });
});
