/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { isEqual } from 'lodash';
import {
  getBreachEsqlQuery,
  isNoDataQueryProvidedForStrategy,
  isRecoveryQueryConsistentWithStrategy,
  isRecoveryQueryProvidedForStrategy,
  isSignalUsingStandaloneFormat,
  type CreateRuleData,
  type Query,
  type RuleKind,
  type UpdateRuleData,
} from '@kbn/alerting-v2-schemas';
import type { RuleSavedObjectAttributes } from '../../saved_objects';
import type { BuilderTypeRegistry, GeneratedQuery, OpaqueBuilderFields } from '../builder_types';
import { ALERTING_ERROR_CODES } from '../errors/error_codes';
import type { ResolvedCreateRuleData, ResolvedUpdateRuleData } from './types';
import { toStoredQuery } from './utils';

const adaptToKind = (
  generated: GeneratedQuery,
  kind: RuleKind,
  builderType: string
): GeneratedQuery => {
  if (kind !== 'signal' || generated.query.format === 'standalone') {
    return generated;
  }

  if (generated.query.recovery) {
    throw Boom.badRequest(
      `The "${builderType}" rule builder generated a recovery query, which a signal rule cannot run.`,
      {
        code: ALERTING_ERROR_CODES.BUILDER_QUERY_GENERATION_FAILED,
        details: { builder_type: builderType },
      }
    );
  }

  return {
    ...generated,
    query: {
      format: 'standalone',
      breach: { query: getBreachEsqlQuery(generated.query) },
    },
  };
};

const GENERATED_QUERY_INVARIANTS = [
  {
    holds: isSignalUsingStandaloneFormat,
    message: 'kind "signal" requires query.format "standalone".',
  },
  {
    holds: isRecoveryQueryConsistentWithStrategy,
    message: 'query.recovery is only allowed when recovery_strategy is "query".',
  },
  {
    holds: isRecoveryQueryProvidedForStrategy,
    message: 'query.recovery is required when recovery_strategy is "query".',
  },
  {
    holds: isNoDataQueryProvidedForStrategy,
    message:
      'query.no_data is required when no_data_strategy is not "none" for standalone-format rules.',
  },
] as const;

const assertGeneratedQueryIsValid = (
  resolved: ResolvedCreateRuleData,
  builderType: string
): void => {
  for (const { holds, message } of GENERATED_QUERY_INVARIANTS) {
    if (!holds(resolved)) {
      throw Boom.badRequest(
        `The "${builderType}" rule builder generated a query that is not valid for this rule: ${message}`,
        {
          code: ALERTING_ERROR_CODES.BUILDER_QUERY_GENERATION_FAILED,
          details: { builder_type: builderType },
        }
      );
    }
  }
};

const withGenerated = <T extends { query?: Query; time_field?: string; grouping?: unknown }>(
  data: T,
  generated: GeneratedQuery
): T & { query: Query } => ({
  ...data,
  query: generated.query,
  ...(generated.time_field === undefined ? {} : { time_field: generated.time_field }),
  ...(generated.grouping === undefined ? {} : { grouping: generated.grouping }),
});

/**
 * Settles the query for a create (or PUT upsert): generated from
 * `metadata.builder_fields` when the rule carries them, otherwise taken as sent.
 *
 * @throws `Boom` 400 when the builder type is unregistered or its fields are
 * invalid.
 */
export function resolveCreateRuleBuilder(
  registry: BuilderTypeRegistry,
  data: CreateRuleData
): ResolvedCreateRuleData {
  const { builder_type: builderType, builder_fields: builderFields } = data.metadata;

  if (builderType && builderFields) {
    const resolved = withGenerated(
      data,
      adaptToKind(registry.generate(builderType, builderFields), data.kind, builderType)
    );
    assertGeneratedQueryIsValid(resolved, builderType);
    return resolved;
  }

  if (!data.query) {
    // Unreachable through the API: `createRuleDataSchema` requires a query
    // unless a builder supplies one. Guarded so a future schema change cannot
    // silently persist a rule with no query.
    throw Boom.badRequest('query is required unless metadata.builder_fields is set.', {
      code: ALERTING_ERROR_CODES.INVALID_RULE_DATA,
      details: {},
    });
  }

  return { ...data, query: data.query };
}

export function resolveUpdateRuleBuilder(
  registry: BuilderTypeRegistry,
  ruleId: string,
  data: UpdateRuleData,
  existing: RuleSavedObjectAttributes
): ResolvedUpdateRuleData {
  const requestedType = data.metadata?.builder_type;
  const requestedFields = data.metadata?.builder_fields;
  const existingType = existing.metadata.builder_type;

  if (requestedType === null) {
    if (requestedFields != null) {
      throw Boom.badRequest(
        `Rule "${ruleId}" cannot set metadata.builder_fields while clearing metadata.builder_type.`,
        {
          code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS,
          details: { rule_id: ruleId },
        }
      );
    }

    return {
      ...data,
      metadata: { ...data.metadata, builder_type: null, builder_fields: null },
    };
  }

  const effectiveType = requestedType ?? existingType;

  if (requestedFields === null && effectiveType) {
    throw Boom.badRequest(
      `Rule "${ruleId}" cannot clear metadata.builder_fields without also clearing metadata.builder_type (send metadata.builder_type: null).`,
      {
        code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS,
        details: { rule_id: ruleId, builder_type: effectiveType },
      }
    );
  }

  if (requestedFields != null) {
    if (!effectiveType) {
      throw Boom.badRequest(
        `Rule "${ruleId}" has no rule builder, so metadata.builder_fields cannot be set without metadata.builder_type.`,
        {
          code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS,
          details: { rule_id: ruleId },
        }
      );
    }

    const generated = adaptToKind(
      registry.generate(effectiveType, requestedFields as OpaqueBuilderFields),
      existing.kind,
      effectiveType
    );
    return withGenerated(
      { ...data, metadata: { ...data.metadata, builder_type: effectiveType } },
      generated
    );
  }

  const storedQuery = toStoredQuery(existing.query);
  const queryChanged = data.query !== undefined && !isEqual(toStoredQuery(data.query), storedQuery);

  if (queryChanged && effectiveType) {
    throw Boom.badRequest(
      `Rule "${ruleId}" is authored by the "${effectiveType}" rule builder, so its query cannot be changed directly. Send metadata.builder_fields to regenerate it, or metadata.builder_type: null in the same request to confirm the transition to ES|QL mode.`,
      {
        code: ALERTING_ERROR_CODES.BUILDER_TYPE_NOT_CLEARED,
        details: { rule_id: ruleId, builder_type: effectiveType },
      }
    );
  }

  if (requestedType && existingType && requestedType !== existingType) {
    throw Boom.badRequest(
      `Rule "${ruleId}" cannot change its rule builder from "${existingType}" to "${requestedType}" without metadata.builder_fields for the new builder.`,
      {
        code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS,
        details: {
          rule_id: ruleId,
          builder_type: requestedType,
          previous_builder_type: existingType,
        },
      }
    );
  }

  if (requestedType && !existingType) {
    throw Boom.badRequest(
      `Rule "${ruleId}" cannot adopt the "${requestedType}" rule builder without metadata.builder_fields to generate its query from.`,
      {
        code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS,
        details: { rule_id: ruleId, builder_type: requestedType },
      }
    );
  }

  return data;
}
