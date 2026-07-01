/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FieldEvaluation } from '../definitions/entity_schema';
import { getEntityDefinitionWithoutId } from '../definitions/registry';
import { USER_ENTITY_NAMESPACE } from '../definitions/user_entity_constants';
import {
  applyFieldEvaluations,
  getFieldEvaluationsFromDefinition,
  getIdentityFieldEvaluationsFromDefinition,
  getFieldValue,
  getSourceMatchSpec,
} from './field_evaluations';

describe('getFieldValue', () => {
  it('should return string value when doc has flat field', () => {
    expect(getFieldValue({ foo: 'bar' }, 'foo')).toBe('bar');
    expect(getFieldValue({ a: 'x' }, 'a')).toBe('x');
  });

  it('should return value from nested path via get(doc, field) when flat key is missing', () => {
    expect(getFieldValue({ event: { module: 'okta' } }, 'event.module')).toBe('okta');
    expect(getFieldValue({ a: { b: { c: 'nested' } } }, 'a.b.c')).toBe('nested');
  });

  it('should prefer flat key over nested path when both exist', () => {
    const doc = { 'event.module': 'flat', event: { module: 'nested' } };
    expect(getFieldValue(doc, 'event.module')).toBe('flat');
  });

  it('should return undefined when field is missing, null, or empty string', () => {
    expect(getFieldValue({}, 'missing')).toBeUndefined();
    expect(getFieldValue({ foo: null }, 'foo')).toBeUndefined();
    expect(getFieldValue({ foo: undefined }, 'foo')).toBeUndefined();
    expect(getFieldValue({ foo: '' }, 'foo')).toBeUndefined();
    expect(getFieldValue({ event: { module: null } }, 'event.module')).toBeUndefined();
    expect(getFieldValue({ event: { module: '' } }, 'event.module')).toBeUndefined();
  });

  it('should return first element as string when value is array', () => {
    expect(getFieldValue({ foo: ['a', 'b'] }, 'foo')).toBe('a');
    expect(getFieldValue({ event: { module: ['okta'] } }, 'event.module')).toBe('okta');
  });

  it('should return undefined for empty array or array with null/undefined first element', () => {
    expect(getFieldValue({ foo: [] }, 'foo')).toBeUndefined();
    expect(getFieldValue({ foo: [null] }, 'foo')).toBeUndefined();
    expect(getFieldValue({ foo: [undefined] }, 'foo')).toBeUndefined();
  });

  it('should return undefined when value is an object', () => {
    expect(getFieldValue({ foo: {} }, 'foo')).toBeUndefined();
    expect(getFieldValue({ foo: { bar: 1 } }, 'foo')).toBeUndefined();
  });

  it('should convert number and boolean to string', () => {
    expect(getFieldValue({ foo: 42 }, 'foo')).toBe('42');
    expect(getFieldValue({ foo: 0 }, 'foo')).toBe('0');
    expect(getFieldValue({ foo: true }, 'foo')).toBe('true');
    expect(getFieldValue({ foo: false }, 'foo')).toBe('false');
  });
});

describe('applyFieldEvaluations', () => {
  // User entity uses calculated identity with fieldEvaluations (entity.namespace from event.module)
  const userEvaluations = (
    getEntityDefinitionWithoutId('user').identityField as { fieldEvaluations?: FieldEvaluation[] }
  ).fieldEvaluations!;

  it('should set entity.namespace to fallbackValue when both event.module and data_stream.dataset are missing', () => {
    expect(applyFieldEvaluations({}, userEvaluations)).toEqual({
      'entity.namespace': 'unknown',
    });
    expect(applyFieldEvaluations({ event: {} }, userEvaluations)).toEqual({
      'entity.namespace': 'unknown',
    });
    expect(applyFieldEvaluations({ event: { module: null } }, userEvaluations)).toEqual({
      'entity.namespace': 'unknown',
    });
    expect(applyFieldEvaluations({ event: { module: '' } }, userEvaluations)).toEqual({
      'entity.namespace': 'unknown',
    });
  });

  it('should map okta and entityanalytics_okta to okta', () => {
    expect(applyFieldEvaluations({ event: { module: 'okta' } }, userEvaluations)).toEqual({
      'entity.namespace': 'okta',
    });
    expect(
      applyFieldEvaluations({ event: { module: 'entityanalytics_okta' } }, userEvaluations)
    ).toEqual({
      'entity.namespace': 'okta',
    });
  });

  it('should map azure and entityanalytics_entra_id to entra_id', () => {
    expect(applyFieldEvaluations({ event: { module: 'azure' } }, userEvaluations)).toEqual({
      'entity.namespace': 'entra_id',
    });
    expect(
      applyFieldEvaluations({ event: { module: 'entityanalytics_entra_id' } }, userEvaluations)
    ).toEqual({
      'entity.namespace': 'entra_id',
    });
  });

  it('should map o365 and o365_metrics to microsoft_365', () => {
    expect(applyFieldEvaluations({ event: { module: 'o365' } }, userEvaluations)).toEqual({
      'entity.namespace': 'microsoft_365',
    });
    expect(applyFieldEvaluations({ event: { module: 'o365_metrics' } }, userEvaluations)).toEqual({
      'entity.namespace': 'microsoft_365',
    });
  });

  it('should use event.module as-is when no whenClause matches (fallback to source)', () => {
    expect(applyFieldEvaluations({ event: { module: 'custom_module' } }, userEvaluations)).toEqual({
      'entity.namespace': 'custom_module',
    });
  });

  it('should set entity.namespace to local when event.module is local', () => {
    expect(
      applyFieldEvaluations({ event: { module: USER_ENTITY_NAMESPACE.Local } }, userEvaluations)
    ).toEqual({
      'entity.namespace': USER_ENTITY_NAMESPACE.Local,
    });
  });

  it('should use first element of event.module list for matching and fallback', () => {
    expect(applyFieldEvaluations({ event: { module: ['okta'] } }, userEvaluations)).toEqual({
      'entity.namespace': 'okta',
    });
    expect(
      applyFieldEvaluations({ event: { module: ['other', 'okta'] } }, userEvaluations)
    ).toEqual({
      'entity.namespace': 'other',
    });
    expect(
      applyFieldEvaluations(
        { event: { module: ['entityanalytics_entra_id', 'azure'] } },
        userEvaluations
      )
    ).toEqual({
      'entity.namespace': 'entra_id',
    });
  });

  it('should use first element as fallback when event.module is a list and no clause matches', () => {
    expect(
      applyFieldEvaluations({ event: { module: ['custom_a', 'custom_b'] } }, userEvaluations)
    ).toEqual({
      'entity.namespace': 'custom_a',
    });
  });

  it('should return empty object when fieldEvaluations is empty', () => {
    expect(applyFieldEvaluations({ event: { module: 'okta' } }, [])).toEqual({});
  });

  it('should use first chunk of data_stream.dataset when event.module is missing', () => {
    expect(
      applyFieldEvaluations({ data_stream: { dataset: 'okta.logs' } }, userEvaluations)
    ).toEqual({
      'entity.namespace': 'okta',
    });
    expect(
      applyFieldEvaluations(
        { data_stream: { dataset: 'entityanalytics_entra_id.metrics' } },
        userEvaluations
      )
    ).toEqual({
      'entity.namespace': 'entra_id',
    });
  });

  it('should return full data_stream.dataset when it has no delimiter', () => {
    expect(applyFieldEvaluations({ data_stream: { dataset: 'okta' } }, userEvaluations)).toEqual({
      'entity.namespace': 'okta',
    });
    expect(
      applyFieldEvaluations(
        { data_stream: { dataset: 'entityanalytics_entra_id' } },
        userEvaluations
      )
    ).toEqual({
      'entity.namespace': 'entra_id',
    });
  });

  it('should set entity.namespace to unknown when data_stream.dataset starts with delimiter (empty first chunk)', () => {
    expect(applyFieldEvaluations({ data_stream: { dataset: '.logs' } }, userEvaluations)).toEqual({
      'entity.namespace': 'unknown',
    });
  });

  it('should prefer event.module over data_stream.dataset when both are present', () => {
    expect(
      applyFieldEvaluations(
        { event: { module: 'azure' }, data_stream: { dataset: 'okta.logs' } },
        userEvaluations
      )
    ).toEqual({
      'entity.namespace': 'entra_id',
    });
  });

  it('should set entity.namespace to unknown when only data_stream.dataset is present but empty', () => {
    expect(applyFieldEvaluations({ data_stream: { dataset: '' } }, userEvaluations)).toEqual({
      'entity.namespace': 'unknown',
    });
  });

  const nonIdpLocalDoc = {
    user: { name: 'alice' },
    host: { id: 'host-1' },
    event: { module: 'winlogbeat', kind: 'event', category: 'process' },
  };

  it('should set entity.namespace to local from condition whenClause when non-IDP document matches', () => {
    expect(applyFieldEvaluations(nonIdpLocalDoc, userEvaluations)).toEqual({
      'entity.namespace': USER_ENTITY_NAMESPACE.Local,
    });
  });

  it('should override mapped namespace when IDP host.id present', () => {
    const idpLikeDoc = {
      user: { name: 'alice' },
      host: { id: 'host-1' },
      event: { module: 'okta', kind: 'asset' },
    };
    expect(applyFieldEvaluations(idpLikeDoc, userEvaluations)).toEqual({
      'entity.namespace': 'local',
    });
  });

  it('should map cloud.provider to aws, gcp, or entra_id when event.kind is asset and local namespace gate does not match', () => {
    const assetCloudBase = {
      user: { name: 'inventory-user' },
      event: { kind: 'asset', module: 'asset_inventory' },
    };
    expect(
      applyFieldEvaluations({ ...assetCloudBase, cloud: { provider: 'aws' } }, userEvaluations)
    ).toEqual({ 'entity.namespace': 'aws' });
    expect(
      applyFieldEvaluations({ ...assetCloudBase, cloud: { provider: 'gcp' } }, userEvaluations)
    ).toEqual({ 'entity.namespace': 'gcp' });
    expect(
      applyFieldEvaluations({ ...assetCloudBase, cloud: { provider: 'azure' } }, userEvaluations)
    ).toEqual({ 'entity.namespace': 'entra_id' });
  });

  it('should prefer local namespace over cloud.provider when asset event satisfies local namespace gate', () => {
    expect(
      applyFieldEvaluations(
        {
          user: { name: 'alice' },
          host: { id: 'host-1' },
          event: { kind: 'asset', module: 'asset_inventory' },
          cloud: { provider: 'aws' },
        },
        userEvaluations
      )
    ).toEqual({ 'entity.namespace': USER_ENTITY_NAMESPACE.Local });
  });

  describe('cloud.provider field-mapping whenClause', () => {
    const assetBase = {
      user: { name: 'cloud-user' },
      event: { kind: 'asset', module: 'asset_discovery' },
    };

    it('maps cloud.provider aws → aws namespace', () => {
      expect(
        applyFieldEvaluations({ ...assetBase, cloud: { provider: 'aws' } }, userEvaluations)
      ).toEqual({ 'entity.namespace': 'aws' });
    });

    it('maps cloud.provider gcp → gcp namespace', () => {
      expect(
        applyFieldEvaluations({ ...assetBase, cloud: { provider: 'gcp' } }, userEvaluations)
      ).toEqual({ 'entity.namespace': 'gcp' });
    });

    it('maps cloud.provider azure → entra_id namespace', () => {
      expect(
        applyFieldEvaluations({ ...assetBase, cloud: { provider: 'azure' } }, userEvaluations)
      ).toEqual({ 'entity.namespace': 'entra_id' });
    });

    it('falls through to source value when cloud.provider is not in the mapping', () => {
      // event.module = 'asset_discovery' becomes the namespace when provider is unknown
      expect(
        applyFieldEvaluations({ ...assetBase, cloud: { provider: 'ibm' } }, userEvaluations)
      ).toEqual({ 'entity.namespace': 'asset_discovery' });
    });

    it('falls through to source value when cloud.provider is absent', () => {
      expect(applyFieldEvaluations(assetBase, userEvaluations)).toEqual({
        'entity.namespace': 'asset_discovery',
      });
    });

    it('does not apply cloud.provider mapping when event.kind is not asset', () => {
      // event.module and cloud.provider intentionally differ: if the mapping incorrectly fired,
      // the result would be 'aws'; the correct result is 'custom-module' (from event.module source).
      expect(
        applyFieldEvaluations(
          {
            user: { name: 'regular-user' },
            event: { kind: 'event', module: 'custom-module' },
            cloud: { provider: 'aws' },
          },
          userEvaluations
        )
      ).toEqual({ 'entity.namespace': 'custom-module' });
    });
  });
});

describe('shared entity.source field evaluation', () => {
  const hostSourceEvaluation = getEntityDefinitionWithoutId('host').fieldEvaluations ?? [];

  it('should prefer event.module over event.dataset and data_stream.dataset', () => {
    expect(
      applyFieldEvaluations(
        {
          event: { module: 'aws', dataset: 'cloudtrail' },
          data_stream: { dataset: 'logs-endpoint.alerts' },
        },
        hostSourceEvaluation
      )
    ).toEqual({
      'entity.source': 'aws',
    });
  });

  it('should fall back from event.dataset to data_stream.dataset and then null', () => {
    expect(
      applyFieldEvaluations(
        {
          event: { dataset: 'cloudtrail' },
          data_stream: { dataset: 'logs-endpoint.alerts' },
        },
        hostSourceEvaluation
      )
    ).toEqual({
      'entity.source': 'cloudtrail',
    });

    expect(
      applyFieldEvaluations(
        {
          data_stream: { dataset: 'logs-endpoint.alerts' },
        },
        hostSourceEvaluation
      )
    ).toEqual({
      'entity.source': 'logs-endpoint.alerts',
    });

    expect(applyFieldEvaluations({}, hostSourceEvaluation)).toEqual({
      'entity.source': null,
    });
  });
});

describe('getFieldEvaluationsFromDefinition', () => {
  it('should include shared field evaluations for single-field identities', () => {
    const serviceDefinition = getEntityDefinitionWithoutId('service');

    expect(getFieldEvaluationsFromDefinition(serviceDefinition)).toEqual(
      serviceDefinition.fieldEvaluations
    );
  });

  it('should return only shared field evaluations for calculated identities (identity evals are separate)', () => {
    const userDefinition = getEntityDefinitionWithoutId('user');

    expect(getFieldEvaluationsFromDefinition(userDefinition)).toHaveLength(
      userDefinition.fieldEvaluations?.length ?? 0
    );
    expect(getFieldEvaluationsFromDefinition(userDefinition)).toEqual(
      userDefinition.fieldEvaluations
    );
  });
});

describe('getIdentityFieldEvaluationsFromDefinition', () => {
  it('returns empty array for single-field identities (service)', () => {
    const serviceDefinition = getEntityDefinitionWithoutId('service');

    expect(getIdentityFieldEvaluationsFromDefinition(serviceDefinition)).toEqual([]);
  });

  it('returns identity-specific evaluations for calculated identities (user)', () => {
    const userDefinition = getEntityDefinitionWithoutId('user');
    const identityEvals = getIdentityFieldEvaluationsFromDefinition(userDefinition);

    expect(identityEvals.length).toBeGreaterThan(0);
    expect(identityEvals.map((e) => e.destination)).toContain('entity.namespace');
  });
});

describe('getSourceMatchSpec', () => {
  const userEvaluations = (
    getEntityDefinitionWithoutId('user').identityField as { fieldEvaluations?: FieldEvaluation[] }
  ).fieldEvaluations!;
  const userEval = userEvaluations[0];

  it('should return unknown when both event.module and data_stream.dataset are missing', () => {
    expect(getSourceMatchSpec({}, userEval)).toEqual({ type: 'unknown' });
    expect(getSourceMatchSpec({ event: {} }, userEval)).toEqual({ type: 'unknown' });
    expect(getSourceMatchSpec({ event: { module: null } }, userEval)).toEqual({ type: 'unknown' });
    expect(getSourceMatchSpec({ event: { module: '' } }, userEval)).toEqual({ type: 'unknown' });
  });

  it('should return single value when only event.module is present (no whenClause match)', () => {
    expect(getSourceMatchSpec({ event: { module: 'aws' } }, userEval)).toEqual({
      type: 'values',
      values: ['aws'],
    });
  });

  it('should return single value when only first chunk of data_stream.dataset is present', () => {
    expect(getSourceMatchSpec({ data_stream: { dataset: 'aws.cloudtrail' } }, userEval)).toEqual({
      type: 'values',
      values: ['aws'],
    });
  });

  it('should return full value when data_stream.dataset has no delimiter', () => {
    // okta matches whenClause so spec expands to sourceMatchesAny
    expect(getSourceMatchSpec({ data_stream: { dataset: 'okta' } }, userEval)).toEqual({
      type: 'values',
      values: ['okta', 'entityanalytics_okta'],
    });
    // aws has no whenClause match so single value
    expect(getSourceMatchSpec({ data_stream: { dataset: 'aws' } }, userEval)).toEqual({
      type: 'values',
      values: ['aws'],
    });
  });

  it('should return unknown when data_stream.dataset starts with delimiter (empty first chunk)', () => {
    expect(getSourceMatchSpec({ data_stream: { dataset: '.logs' } }, userEval)).toEqual({
      type: 'unknown',
    });
  });

  it('should expand to sourceMatchesAny when whenClause matches (event.module)', () => {
    expect(getSourceMatchSpec({ event: { module: 'okta' } }, userEval)).toEqual({
      type: 'values',
      values: ['okta', 'entityanalytics_okta'],
    });
    expect(getSourceMatchSpec({ event: { module: 'entityanalytics_okta' } }, userEval)).toEqual({
      type: 'values',
      values: ['okta', 'entityanalytics_okta'],
    });
  });

  it('should expand to sourceMatchesAny when whenClause matches (data_stream.dataset first chunk)', () => {
    expect(getSourceMatchSpec({ data_stream: { dataset: 'okta.logs' } }, userEval)).toEqual({
      type: 'values',
      values: ['okta', 'entityanalytics_okta'],
    });
  });

  it('should prefer event.module over data_stream.dataset (first source wins)', () => {
    expect(
      getSourceMatchSpec(
        { event: { module: 'azure' }, data_stream: { dataset: 'okta.logs' } },
        userEval
      )
    ).toEqual({ type: 'values', values: ['azure', 'entityanalytics_entra_id'] });
  });

  it('should return condition spec when a condition whenClause wins', () => {
    const nonIdpLocalDoc = {
      user: { name: 'alice' },
      host: { id: 'host-1' },
      event: { module: 'winlogbeat', kind: 'event', category: 'process' },
    };
    expect(getSourceMatchSpec(nonIdpLocalDoc, userEval)).toEqual({
      type: 'condition',
      condition: expect.objectContaining({
        and: expect.any(Array),
      }),
    });
  });

  it('should return condition spec when asset + cloud.provider whenClause wins', () => {
    const doc = {
      user: { name: 'u' },
      event: { kind: 'asset', module: 'x' },
      cloud: { provider: 'gcp' },
    };
    // The winning condition is the outer event.kind=asset check; cloud.provider
    // lookup happens inside the then resolution, not as part of the condition.
    expect(getSourceMatchSpec(doc, userEval)).toEqual({
      type: 'condition',
      condition: { field: 'event.kind', includes: 'asset' },
    });
  });
});
