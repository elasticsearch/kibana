/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import deepEqual from 'fast-deep-equal';
import type { CoreSetup, CoreStart, KibanaRequest } from '@kbn/core/server';
import type { ParsedTechnicalFields } from '@kbn/rule-registry-plugin/common';
import type { CheckResponseActionAuthzParams } from '../types';
import { CustomHttpRequestError } from '../common/error';
import { containsDynamicQuery, replaceParamsQuery } from '../../common/utils/replace_params_query';
import type { ResolvedQueryReference } from './resolve_query_reference';
import { resolveQueryReference, toEcsMappingRecord } from './resolve_query_reference';

interface OsqueryCapabilities {
  writeLiveQueries: boolean;
  runSavedQueries: boolean;
}

const capabilitiesCache = new WeakMap<KibanaRequest, Promise<OsqueryCapabilities>>();
const referenceCache = new WeakMap<
  KibanaRequest,
  Map<string, Promise<ResolvedQueryReference | undefined>>
>();

const resolveCachedQueryReference = (
  request: KibanaRequest,
  coreStart: CoreStart,
  spaceId: string | undefined,
  reference: { saved_query_id?: string; pack_id?: string }
): Promise<ResolvedQueryReference | undefined> => {
  const cacheKey = `${spaceId ?? ''}::${reference.saved_query_id ?? ''}::${
    reference.pack_id ?? ''
  }`;
  let perRequest = referenceCache.get(request);

  if (!perRequest) {
    perRequest = new Map();
    referenceCache.set(request, perRequest);
  }

  const cache = perRequest;
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = resolveQueryReference(coreStart, spaceId, reference).catch((error) => {
    cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, pending);

  return pending;
};

export const getOsqueryCapabilities = (
  coreStart: CoreStart,
  request: KibanaRequest
): Promise<OsqueryCapabilities> => {
  let promise = capabilitiesCache.get(request);

  if (!promise) {
    promise = (async () => {
      const resolved = await coreStart.capabilities.resolveCapabilities(request, {
        capabilityPath: 'osquery.*',
      });

      return {
        writeLiveQueries: !!resolved.osquery.writeLiveQueries,
        runSavedQueries: !!resolved.osquery.runSavedQueries,
      };
    })();
    capabilitiesCache.set(request, promise);
  }

  return promise;
};

export interface AuthorizeOsqueryResponseActionResult {
  authorized: boolean;
  resolved?: ResolvedQueryReference;
}

/** `writeLiveQueries` may supply SQL. `runSavedQueries` may only run a resolved saved query or pack. */
export const authorizeOsqueryResponseAction = async (
  coreStart: CoreStart,
  request: KibanaRequest,
  actionParams: CheckResponseActionAuthzParams,
  spaceId?: string,
  alertData?: ParsedTechnicalFields & { _index: string }
): Promise<AuthorizeOsqueryResponseActionResult> => {
  const { writeLiveQueries, runSavedQueries } = await getOsqueryCapabilities(coreStart, request);

  if (writeLiveQueries) {
    return { authorized: true };
  }

  if (!runSavedQueries) {
    return { authorized: false };
  }

  const resolved = await resolveCachedQueryReference(request, coreStart, spaceId, {
    saved_query_id: actionParams.saved_query_id,
    pack_id: actionParams.pack_id,
  });

  if (!resolved) {
    return { authorized: false };
  }

  return {
    authorized: callerSuppliedQueryMatches(actionParams, resolved, alertData),
    resolved,
  };
};

export const isOsqueryResponseActionAuthorized = async (
  coreStart: CoreStart,
  request: KibanaRequest,
  actionParams: CheckResponseActionAuthzParams,
  spaceId?: string,
  alertData?: ParsedTechnicalFields & { _index: string }
): Promise<boolean> =>
  (await authorizeOsqueryResponseAction(coreStart, request, actionParams, spaceId, alertData))
    .authorized;

const callerSuppliedQueryMatches = (
  actionParams: CheckResponseActionAuthzParams,
  resolved: ResolvedQueryReference,
  alertData?: ParsedTechnicalFields & { _index: string }
): boolean => {
  // Pack response actions persist a copy of the pack's queries. Ad-hoc queries[]
  // (no pack_id) is writeLiveQueries. saved_query_id + queries[] is not a pack.
  if (actionParams.queries?.length && !actionParams.pack_id?.trim()) {
    return false;
  }

  // A pack action persists a copy of the pack's queries. Dispatch rebuilds the query set from the
  // pack itself, so an unvouched-for copy cannot change what SQL runs — but it is still persisted
  // on the rule and is read to decide whether to dispatch per alert with parameter substitution.
  // Require every persisted entry to match a stored pack query so that decision cannot be steered.
  if (actionParams.queries?.length && actionParams.pack_id?.trim()) {
    const storedQueries = resolved.queries ?? [];

    const everyQueryMatchesPack = actionParams.queries.every(
      (suppliedQuery) =>
        suppliedQuery.query === undefined ||
        storedQueries.some((stored) =>
          queriesMatch(suppliedQuery.query as string, stored, alertData)
        )
    );

    if (!everyQueryMatchesPack) {
      return false;
    }
  }

  if (actionParams.query !== undefined) {
    const storedQueries = resolved.queries ?? (resolved.query ? [resolved.query] : []);

    if (
      !storedQueries.some((stored) => queriesMatch(actionParams.query as string, stored, alertData))
    ) {
      return false;
    }
  }

  const suppliedMapping = toEcsMappingRecord(actionParams.ecs_mapping);

  // An absent or empty mapping asserts nothing. The rule-action form defaults `ecs_mapping` to
  // `{}`, so treating empty as an assertion of emptiness would deny every unrelated edit to an
  // action whose mapping does not match the referenced object, leaving removal as the only
  // possible change. A mapping cannot widen what SQL runs on the host, and dispatch derives the
  // stored mapping for stored content anyway, so there is nothing to vouch for here.
  if (suppliedMapping !== undefined) {
    // Packs carry `ecs_mapping` per query rather than at the top level, so `resolved.ecs_mapping`
    // is always undefined for them and a top-level mapping could never be satisfied. Match
    // against the pack's per-query mappings instead; a mapping matching none of them still fails.
    const storedMappings = resolved.isPack
      ? resolved.queryEcsMappings ?? []
      : [toEcsMappingRecord(resolved.ecs_mapping)];

    if (!storedMappings.some((stored) => deepEqual(suppliedMapping, stored))) {
      return false;
    }
  }

  return true;
};

const queriesMatch = (
  supplied: string,
  stored: string,
  alertData?: ParsedTechnicalFields & { _index: string }
): boolean => {
  if (supplied === stored) {
    return true;
  }

  if (!alertData || !containsDynamicQuery(stored)) {
    return false;
  }

  return replaceParamsQuery(stored, alertData).result === supplied;
};

/** Throws 403 if the request is not authorized for the given osquery response action. */
export const checkResponseActionAuthz = async (
  core: CoreSetup,
  request: KibanaRequest,
  actionParams: CheckResponseActionAuthzParams,
  spaceId?: string
): Promise<void> => {
  const [coreStart] = await core.getStartServices();
  const isAuthorized = await isOsqueryResponseActionAuthorized(
    coreStart,
    request,
    actionParams,
    spaceId
  );

  if (!isAuthorized) {
    throw new CustomHttpRequestError(
      'User is not authorized to create/update osquery response action',
      403
    );
  }
};
