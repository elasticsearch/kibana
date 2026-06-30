/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServiceMapAttachmentType } from './service_map';

describe('createServiceMapAttachmentType', () => {
  const type = createServiceMapAttachmentType();

  it('has the correct id', () => {
    expect(type.id).toBe('observability.service-map');
  });

  describe('validate', () => {
    it('accepts a service-to-service connection', async () => {
      const result = await type.validate({
        connections: [
          {
            source: { 'service.name': 'frontend', 'agent.name': 'nodejs' },
            target: { 'service.name': 'backend', 'agent.name': 'java' },
            metrics: { latencyMs: 150 },
          },
        ],
      });
      expect(result.valid).toBe(true);
    });

    // Regression: real exit-span topology frequently omits span.subtype (and
    // occasionally span.type). The attachment must still validate, otherwise the
    // whole service map is rejected and never renders.
    it('accepts a dependency node missing span.subtype', async () => {
      const result = await type.validate({
        connections: [
          {
            source: { 'service.name': 'synth-node-0' },
            target: {
              'span.destination.service.resource': 'elasticsearch',
              'span.type': 'db',
              // no span.subtype
            },
            metrics: { latencyMs: 1000 },
          },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a dependency node missing both span.type and span.subtype', async () => {
      const result = await type.validate({
        connections: [
          {
            source: { 'service.name': 'synth-node-0' },
            target: { 'span.destination.service.resource': 'elasticsearch' },
            metrics: undefined,
          },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts connections plus a nodeMetadata map with badges', async () => {
      const result = await type.validate({
        connections: [
          {
            source: { 'service.name': 'a' },
            target: { 'service.name': 'b' },
            metrics: { latencyMs: 10 },
          },
        ],
        nodeMetadata: {
          a: { alertsCount: 2, sloStatus: 'violated', sloCount: 1 },
          b: { sloStatus: 'noData' },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('ignores internal connection fields produced by get_service_topology', async () => {
      const result = await type.validate({
        connections: [
          {
            source: { 'service.name': 'a' },
            target: { 'service.name': 'b' },
            metrics: undefined,
            _key: 'a::b',
            _sourceName: 'a',
            _dependencyName: 'b',
          },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects an empty connections array', async () => {
      const result = await type.validate({ connections: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects an unknown sloStatus value', async () => {
      const result = await type.validate({
        connections: [
          { source: { 'service.name': 'a' }, target: { 'service.name': 'b' }, metrics: undefined },
        ],
        nodeMetadata: { a: { sloStatus: 'on-fire' } },
      });
      expect(result.valid).toBe(false);
    });
  });
});
