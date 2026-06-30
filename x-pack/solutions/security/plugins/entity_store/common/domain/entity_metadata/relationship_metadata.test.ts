/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  RelationshipMetadataMaintainer,
  RelationshipMetadataDoc,
} from './relationship_metadata';
import { RELATIONSHIP_KINDS } from './relationship_metadata';
import { getMetadataComponentTemplate } from '../../../server/domain/asset_manager/metadata_component_templates';

// Every flat keyword/date path the Phase 1 template declares for the
// relationship metadata doc.
const FLAT_TEMPLATE_PATHS = [
  '@timestamp',
  'event.kind',
  'event.action',
  'event.ingested',
  'entity.id',
  'entity.source',
  'related.user',
  'related.hosts',
] as const;

const MAINTAINER_SUB_KEYS = ['kind', 'scan_id', 'lookback_window'] as const satisfies ReadonlyArray<
  keyof RelationshipMetadataMaintainer
>;

// Every top-level key on `RelationshipMetadataDoc`. The `satisfies`
// clause asserts the array is a subset of `keyof`; the type-level equality
// assertion below pins it to the full set, so adding a new field to the
// type without listing it here fails compilation.
const RELATIONSHIP_METADATA_FIELD_PATHS = [
  '@timestamp',
  'event.kind',
  'event.action',
  'event.ingested',
  'entity.id',
  'entity.source',
  'related.user',
  'related.hosts',
  'Maintainer',
  'entity.relationships.accesses_frequently.target',
  'entity.relationships.accesses_infrequently.target',
  'entity.relationships.communicates_with.target',
  'entity.relationships.administers.target',
  'entity.relationships.depends_on.target',
  'entity.relationships.owns.target',
  'entity.relationships.supervises.target',
] as const satisfies ReadonlyArray<keyof RelationshipMetadataDoc>;

// True iff A and B are mutually assignable. Used to enforce exhaustiveness
// at the type level: any field added to `RelationshipMetadataDoc`
// without a matching entry in `RELATIONSHIP_METADATA_FIELD_PATHS` makes
// this resolve to `false`, so the assertion at the bottom of this describe
// fails compilation.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

type EnumeratedKeys = (typeof RELATIONSHIP_METADATA_FIELD_PATHS)[number];

describe('drift guard: RelationshipMetadataDoc stays in sync with component template mapping', () => {
  const template = getMetadataComponentTemplate('default');
  const mappings = template.template?.mappings;
  const properties = (mappings?.properties ?? {}) as Record<string, { type?: string }>;
  const dynamicTemplates = (mappings?.dynamic_templates ?? []) as Array<
    Record<string, { path_match?: string; mapping?: { type?: string } }>
  >;

  it('RELATIONSHIP_METADATA_FIELD_PATHS exhaustively covers keyof RelationshipMetadataDoc', () => {
    const exhaustive: Equals<EnumeratedKeys, keyof RelationshipMetadataDoc> = true;
    expect(exhaustive).toBe(true);
  });

  it.each(FLAT_TEMPLATE_PATHS)('declares %s on the Phase 1 component template', (path) => {
    expect(properties[path]).toBeDefined();
    const declaredType = properties[path]?.type;
    expect(['keyword', 'date']).toContain(declaredType);
  });

  it.each(MAINTAINER_SUB_KEYS)(
    'declares Maintainer.%s on the Phase 1 component template',
    (sub) => {
      const key = `Maintainer.${sub}` as const;
      expect(properties[key]).toBeDefined();
      expect(properties[key]?.type).toBe('keyword');
    }
  );

  it('declares entity.relationships.*.target dynamic_template as keyword', () => {
    const targetTemplate = dynamicTemplates.find((dt) =>
      Object.values(dt).some(
        (def) =>
          typeof def.path_match === 'string' &&
          def.path_match.startsWith('entity.relationships.') &&
          def.path_match.endsWith('.target') &&
          def.mapping?.type === 'keyword'
      )
    );
    expect(targetTemplate).toBeDefined();
  });

  it.each(RELATIONSHIP_METADATA_FIELD_PATHS)(
    'maps every keyof RelationshipMetadataDoc — %s — to the Phase 1 template',
    (path) => {
      if (path === 'Maintainer') {
        for (const sub of MAINTAINER_SUB_KEYS) {
          expect(properties[`Maintainer.${sub}`]).toBeDefined();
        }
        return;
      }
      const relationshipTargetMatch = path.match(/^entity\.relationships\.(.+)\.target$/);
      if (relationshipTargetMatch) {
        const kind = relationshipTargetMatch[1];
        expect(RELATIONSHIP_KINDS).toContain(kind);
        const matched = dynamicTemplates.some((dt) =>
          Object.values(dt).some(
            (def) =>
              def.path_match === 'entity.relationships.*.target' && def.mapping?.type === 'keyword'
          )
        );
        expect(matched).toBe(true);
        return;
      }
      expect(properties[path]).toBeDefined();
    }
  );
});
