/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getMetadataIndexTemplateId,
  getMetadataEntityIndexTemplateConfig,
} from './metadata_index_template';
import { getMetadataIndexIngestPipelineId } from './metadata_index_ingest_pipeline';

describe('getMetadataEntityIndexTemplateConfig', () => {
  const namespace = 'default';

  it('exposes a namespace-scoped index template id', () => {
    const id = getMetadataIndexTemplateId(namespace);
    expect(typeof id).toBe('string');
    expect(id).toContain('metadata');
    expect(id).toContain(namespace);
  });

  describe('config', () => {
    const config = getMetadataEntityIndexTemplateConfig(namespace);

    it('uses the metadata index template id as the request name', () => {
      expect(config.name).toBe(getMetadataIndexTemplateId(namespace));
    });

    it('targets a data stream (not a plain index)', () => {
      expect(config.data_stream).toBeDefined();
    });

    it('matches the v2 metadata index pattern', () => {
      expect(config.index_patterns).toContain('.entities.v2.metadata.security_default');
    });

    it('applies DSL data_retention (not ILM) with a 365-day default', () => {
      const lifecycle = config.template?.lifecycle as { data_retention?: string } | undefined;
      expect(lifecycle).toBeDefined();
      expect(lifecycle?.data_retention).toBeDefined();
      // DSL `data_retention`, not ILM; 1-year retention for relationship history.
      expect(lifecycle?.data_retention).toMatch(/^365d$/);
    });

    it('does NOT configure an ILM policy on the template settings', () => {
      const settings = (config.template?.settings ?? {}) as {
        index?: { lifecycle?: unknown };
        'index.lifecycle.name'?: unknown;
        lifecycle?: unknown;
      };
      expect(settings.lifecycle).toBeUndefined();
      expect(settings['index.lifecycle.name']).toBeUndefined();
      expect(settings.index?.lifecycle).toBeUndefined();
    });

    it('wires the metadata ingest pipeline as default_pipeline', () => {
      const settings = (config.template?.settings ?? {}) as {
        index?: { default_pipeline?: string };
      };
      expect(settings.index?.default_pipeline).toBe(getMetadataIndexIngestPipelineId(namespace));
    });

    it('disables date_detection on the template mappings', () => {
      expect(config.template?.mappings?.date_detection).toBe(false);
    });

    it('composes the metadata component template', () => {
      // Implementer must include `getMetadataComponentTemplateName(namespace)` in composed_of.
      // We check by substring so the exact constant location is not coupled here.
      const composed: string[] = config.composed_of ?? [];
      expect(composed.some((name: string) => name.includes('metadata'))).toBe(true);
    });
  });
});
