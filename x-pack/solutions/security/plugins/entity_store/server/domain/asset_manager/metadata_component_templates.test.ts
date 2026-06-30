/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getMetadataComponentTemplateName,
  getMetadataComponentTemplate,
} from './metadata_component_templates';

describe('getMetadataComponentTemplate', () => {
  const namespace = 'default';

  it('exposes a namespace-scoped component template name', () => {
    const name = getMetadataComponentTemplateName(namespace);
    expect(typeof name).toBe('string');
    expect(name).toContain('metadata');
    expect(name).toContain(namespace);
  });

  describe('mappings', () => {
    const template = getMetadataComponentTemplate(namespace);
    const mappings = template.template?.mappings;
    const properties = mappings?.properties ?? {};

    it('has a name matching getMetadataComponentTemplateName', () => {
      expect(template.name).toBe(getMetadataComponentTemplateName(namespace));
    });

    it('maps @timestamp as date', () => {
      expect(properties['@timestamp']).toEqual(expect.objectContaining({ type: 'date' }));
    });

    it('maps event.ingested as date', () => {
      const eventIngested =
        properties['event.ingested'] ??
        (properties.event as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.ingested;
      expect(eventIngested).toEqual(expect.objectContaining({ type: 'date' }));
    });

    it('maps event.kind and event.action as keyword', () => {
      const eventKind =
        properties['event.kind'] ??
        (properties.event as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.kind;
      const eventAction =
        properties['event.action'] ??
        (properties.event as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.action;
      expect(eventKind).toEqual(expect.objectContaining({ type: 'keyword' }));
      expect(eventAction).toEqual(expect.objectContaining({ type: 'keyword' }));
    });

    it('maps entity.id and entity.source as keyword', () => {
      const entityId =
        properties['entity.id'] ??
        (properties.entity as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.id;
      const entitySource =
        properties['entity.source'] ??
        (properties.entity as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.source;
      expect(entityId).toEqual(expect.objectContaining({ type: 'keyword' }));
      expect(entitySource).toEqual(expect.objectContaining({ type: 'keyword' }));
    });

    it('declares entity.relationships as a dynamic object', () => {
      // Either nested under `entity.properties.relationships` or expressed as a
      // flat dotted-key entry. Both forms must declare `dynamic: true`.
      const nestedRelationships = (
        properties.entity as { properties?: Record<string, unknown> } | undefined
      )?.properties?.relationships as { dynamic?: boolean | string } | undefined;
      const dottedRelationships = properties['entity.relationships'] as
        | { dynamic?: boolean | string }
        | undefined;
      const dynamic = nestedRelationships?.dynamic ?? dottedRelationships?.dynamic;
      // Elasticsearch accepts boolean true OR the string 'true'.
      expect([true, 'true']).toContain(dynamic);
    });

    it('pins entity.relationships.*.target to keyword via dynamic_templates', () => {
      const dynamicTemplates = mappings?.dynamic_templates ?? [];
      const targetTemplate = dynamicTemplates.find((dt) => {
        const entry = dt as Record<string, { path_match?: string; mapping?: { type?: string } }>;
        return Object.values(entry).some(
          (def) =>
            typeof def.path_match === 'string' &&
            def.path_match.startsWith('entity.relationships.') &&
            def.path_match.endsWith('.target') &&
            def.mapping?.type === 'keyword'
        );
      });
      expect(targetTemplate).toBeDefined();
    });

    it('maps related.user and related.hosts as keyword (array implied by ES)', () => {
      const relatedUser =
        properties['related.user'] ??
        (properties.related as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.user;
      const relatedHosts =
        properties['related.hosts'] ??
        (properties.related as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.hosts;
      expect(relatedUser).toEqual(expect.objectContaining({ type: 'keyword' }));
      expect(relatedHosts).toEqual(expect.objectContaining({ type: 'keyword' }));
    });

    it('maps Maintainer.kind, Maintainer.scan_id and Maintainer.lookback_window as keyword', () => {
      const maintainerKind =
        properties['Maintainer.kind'] ??
        (properties.Maintainer as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.kind;
      const scanId =
        properties['Maintainer.scan_id'] ??
        (properties.Maintainer as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.scan_id;
      const lookback =
        properties['Maintainer.lookback_window'] ??
        (properties.Maintainer as { properties?: Record<string, { type: string }> } | undefined)
          ?.properties?.lookback_window;
      expect(maintainerKind).toEqual(expect.objectContaining({ type: 'keyword' }));
      expect(scanId).toEqual(expect.objectContaining({ type: 'keyword' }));
      expect(lookback).toEqual(expect.objectContaining({ type: 'keyword' }));
    });
  });
});
