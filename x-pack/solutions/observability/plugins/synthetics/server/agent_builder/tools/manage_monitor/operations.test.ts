/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MonitorAttachmentData } from '../../../../common/agent_builder/attachments/monitor_attachment_schema';
import {
  executeMonitorOperations,
  MonitorOperationValidationError,
  type MonitorOperation,
} from './operations';

const fullValidMonitor: MonitorAttachmentData = {
  type: 'http',
  metadata: { name: 'example.com health' },
  urls: 'https://example.com',
  schedule: { number: '5', unit: 'm' },
  locations: [{ id: 'us_central', label: 'US Central', isServiceManaged: true }],
};

describe('executeMonitorOperations', () => {
  describe('set_metadata', () => {
    it('sets name, description, and tags on a new monitor', () => {
      const { data } = executeMonitorOperations(
        {},
        [
          {
            operation: 'set_metadata',
            name: 'New monitor',
            description: 'desc',
            tags: ['a', 'b'],
          },
        ],
        { isNew: true }
      );
      expect(data.metadata).toEqual({ name: 'New monitor', description: 'desc', tags: ['a', 'b'] });
    });

    it('preserves existing name when only updating description', () => {
      const { data } = executeMonitorOperations(fullValidMonitor, [
        { operation: 'set_metadata', description: 'updated description' },
      ]);
      expect(data.metadata?.name).toBe('example.com health');
      expect(data.metadata?.description).toBe('updated description');
    });

    it('does not overwrite description with undefined when the op omits it', () => {
      const seeded: Partial<MonitorAttachmentData> = {
        ...fullValidMonitor,
        metadata: { name: 'n', description: 'keep me' },
      };
      const { data } = executeMonitorOperations(seeded, [
        { operation: 'set_metadata', name: 'new-name' },
      ]);
      expect(data.metadata?.description).toBe('keep me');
    });
  });

  describe('set_url', () => {
    it('replaces urls', () => {
      const { data } = executeMonitorOperations(fullValidMonitor, [
        { operation: 'set_url', urls: 'https://acme.test' },
      ]);
      expect(data.urls).toBe('https://acme.test');
    });
  });

  describe('set_schedule', () => {
    it('replaces schedule wholesale', () => {
      const { data } = executeMonitorOperations(fullValidMonitor, [
        { operation: 'set_schedule', number: '10', unit: 'm' },
      ]);
      expect(data.schedule).toEqual({ number: '10', unit: 'm' });
    });
  });

  describe('set_locations', () => {
    it('replaces the entire locations array', () => {
      const { data } = executeMonitorOperations(fullValidMonitor, [
        {
          operation: 'set_locations',
          locations: [{ id: 'eu_west' }, { id: 'us_east', label: 'US East' }],
        },
      ]);
      expect(data.locations).toEqual([{ id: 'eu_west' }, { id: 'us_east', label: 'US East' }]);
    });
  });

  describe('validate', () => {
    it('passes for a complete valid monitor', () => {
      expect(() =>
        executeMonitorOperations(fullValidMonitor, [{ operation: 'validate' }])
      ).not.toThrow();
    });

    it('throws MonitorOperationValidationError listing each issue', () => {
      const ops: MonitorOperation[] = [
        { operation: 'set_metadata', name: 'M' },
        { operation: 'validate' },
      ];
      try {
        executeMonitorOperations({}, ops, { isNew: true });
        fail('expected validate to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(MonitorOperationValidationError);
        const message = (e as Error).message;
        expect(message).toContain('Synthetics monitor is not ready to save');
        expect(message).toContain('urls');
        expect(message).toContain('schedule');
        expect(message).toContain('locations');
      }
    });
  });

  describe('isNew', () => {
    it('defaults type to "http" for new monitors', () => {
      const { data } = executeMonitorOperations({}, [{ operation: 'set_metadata', name: 'New' }], {
        isNew: true,
      });
      expect(data.type).toBe('http');
    });

    it('requires a name when creating a new monitor', () => {
      expect(() =>
        executeMonitorOperations({}, [{ operation: 'set_url', urls: 'https://example.com' }], {
          isNew: true,
        })
      ).toThrow(MonitorOperationValidationError);
    });

    it('does not require a name when updating an existing monitor', () => {
      expect(() =>
        executeMonitorOperations({ ...fullValidMonitor, metadata: { name: '' } }, [
          { operation: 'set_url', urls: 'https://example.com' },
        ])
      ).not.toThrow();
    });
  });

  describe('composition', () => {
    it('applies a sequence of operations in order', () => {
      const { data } = executeMonitorOperations(
        {},
        [
          { operation: 'set_metadata', name: 'M', tags: ['t1'] },
          { operation: 'set_url', urls: 'https://example.com' },
          { operation: 'set_schedule', number: '3', unit: 'm' },
          { operation: 'set_locations', locations: [{ id: 'us_central' }] },
          { operation: 'validate' },
        ],
        { isNew: true }
      );
      expect(data).toEqual({
        type: 'http',
        metadata: { name: 'M', tags: ['t1'] },
        urls: 'https://example.com',
        schedule: { number: '3', unit: 'm' },
        locations: [{ id: 'us_central' }],
      });
    });
  });
});
