/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Feature } from '@kbn/significant-events-schema';
import {
  toFeatureForLlmContext,
  getFeatureQueryFromToolArgs,
  resolveFeatureTypeFilters,
  PARTITION_FEATURE_TOOL_TYPES,
} from './features_tool';

/**
 * Tests for the feature tool utilities used in partitionStream.
 * The actual workflow function is tested through integration tests,
 * but this verifies the feature serialization and tool argument parsing works correctly.
 */
describe('partitionStream features_tool', () => {
  const sampleFeatures: Feature[] = [
    {
      id: 'feature-1',
      uuid: 'feature-1-uuid',
      stream_name: 'logs',
      type: 'technology',
      title: 'Node.js',
      description: 'Node.js application framework detected',
      properties: { version: '18.x' },
      confidence: 95,
      evidence: ['require statement', 'package.json reference'],
      tags: ['backend', 'javascript'],
      meta: { detected_at: '2024-01-01' },
    },
    {
      id: 'feature-2',
      uuid: 'feature-2-uuid',
      stream_name: 'logs',
      type: 'entity',
      title: 'API Gateway',
      description: 'API Gateway service identified',
      properties: { endpoints: ['/api/v1', '/api/v2'] },
      confidence: 87,
      evidence: ['HTTP routing patterns'],
      tags: ['api', 'gateway'],
      meta: {},
    },
  ];

  describe('toFeatureForLlmContext', () => {
    it('should pick only LLM-relevant fields from a feature', () => {
      const result = toFeatureForLlmContext(sampleFeatures[0]);

      expect(result).toHaveProperty('id', 'feature-1');
      expect(result).toHaveProperty('type', 'technology');
      expect(result).toHaveProperty('title', 'Node.js');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('confidence', 95);
      expect(result).toHaveProperty('properties');
      expect(result).toHaveProperty('evidence');
      expect(result).toHaveProperty('tags');
      expect(result).toHaveProperty('meta');

      expect(result).not.toHaveProperty('uuid');
      expect(result).not.toHaveProperty('stream_name');
      expect(result).not.toHaveProperty('status');
      expect(result).not.toHaveProperty('last_seen');
      expect(result).not.toHaveProperty('expires_at');
    });

    it('should preserve nested properties objects', () => {
      const featureWithComplexProperties: Feature = {
        id: 'feature-3',
        uuid: 'feature-3-uuid',
        stream_name: 'logs',
        type: 'infrastructure',
        title: 'PostgreSQL',
        description: 'PostgreSQL database detected',
        properties: {
          version: '14.x',
          config: {
            host: 'localhost',
            port: 5432,
          },
        },
        confidence: 92,
        evidence: ['connection string'],
        tags: ['database', 'sql'],
        meta: { tables: ['users', 'orders'] },
      };

      const result = toFeatureForLlmContext(featureWithComplexProperties);

      expect(result.properties).toEqual({
        version: '14.x',
        config: {
          host: 'localhost',
          port: 5432,
        },
      });
    });

    it('should result in valid JSON that can be embedded in tool responses', () => {
      const llmFeatures = sampleFeatures.map(toFeatureForLlmContext);
      const serialized = JSON.stringify(llmFeatures);

      expect(() => JSON.parse(serialized)).not.toThrow();
      expect(serialized).toContain('technology');
      expect(serialized).toContain('Node.js');
    });
  });

  describe('getFeatureQueryFromToolArgs', () => {
    it('should parse valid tool arguments', () => {
      const args = {
        feature_types: ['entity'],
        min_confidence: 80,
        limit: 10,
      };

      const result = getFeatureQueryFromToolArgs(args);

      expect(result.featureTypes).toEqual(['entity']);
      expect(result.minConfidence).toBe(80);
      expect(result.limit).toBe(10);
    });

    it('should handle empty/missing arguments', () => {
      expect(getFeatureQueryFromToolArgs({})).toEqual({
        featureTypes: undefined,
        minConfidence: undefined,
        limit: undefined,
      });

      expect(getFeatureQueryFromToolArgs(undefined)).toEqual({
        featureTypes: undefined,
        minConfidence: undefined,
        limit: undefined,
      });
    });

    it('should filter out invalid feature types', () => {
      const args = {
        feature_types: ['technology', 'invalid_type', 'entity', 'another_invalid'],
      };

      const result = getFeatureQueryFromToolArgs(args);

      expect(result.featureTypes).toEqual(['entity']);
    });

    it('should return undefined for feature_types when no valid types remain', () => {
      const args = {
        feature_types: ['technology', 'infrastructure', 'invalid_type'],
      };

      const result = getFeatureQueryFromToolArgs(args);

      expect(result.featureTypes).toBeUndefined();
    });

    it('should handle invalid min_confidence values', () => {
      expect(getFeatureQueryFromToolArgs({ min_confidence: -10 }).minConfidence).toBeUndefined();
      expect(getFeatureQueryFromToolArgs({ min_confidence: 150 }).minConfidence).toBeUndefined();
      expect(getFeatureQueryFromToolArgs({ min_confidence: 'abc' }).minConfidence).toBeUndefined();
      expect(getFeatureQueryFromToolArgs({ min_confidence: NaN }).minConfidence).toBeUndefined();
    });

    it('should handle invalid limit values', () => {
      expect(getFeatureQueryFromToolArgs({ limit: 0 }).limit).toBeUndefined();
      expect(getFeatureQueryFromToolArgs({ limit: -5 }).limit).toBeUndefined();
      expect(getFeatureQueryFromToolArgs({ limit: 'abc' }).limit).toBeUndefined();
      expect(getFeatureQueryFromToolArgs({ limit: NaN }).limit).toBeUndefined();
    });

    it('should floor decimal limit values', () => {
      expect(getFeatureQueryFromToolArgs({ limit: 5.7 }).limit).toBe(5);
      expect(getFeatureQueryFromToolArgs({ limit: 3.1 }).limit).toBe(3);
    });
  });

  describe('resolveFeatureTypeFilters', () => {
    it('should return undefined for empty or undefined input', () => {
      expect(resolveFeatureTypeFilters(undefined)).toBeUndefined();
      expect(resolveFeatureTypeFilters([])).toBeUndefined();
    });

    it('should deduplicate feature types', () => {
      const result = resolveFeatureTypeFilters(['entity', 'entity']);
      expect(result).toEqual(['entity']);
    });

    it('should pass through valid feature types', () => {
      const result = resolveFeatureTypeFilters(['entity']);
      expect(result).toEqual(['entity']);
    });
  });

  describe('PARTITION_FEATURE_TOOL_TYPES', () => {
    it('should only include entity type for partitioning', () => {
      expect(PARTITION_FEATURE_TOOL_TYPES).toEqual(['entity']);
    });
  });
});
