/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ParsedTechnicalFields } from '@kbn/rule-registry-plugin/common';
import type { Subscription } from 'rxjs';
import type { CreateLiveQueryRequestBodySchema } from '../../../common/api';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import type { OsqueryActiveLicenses } from './validate_license';
import { validateLicense } from './validate_license';
import { createActionHandler } from './create_action_handler';
import { containsDynamicQuery } from '../../../common/utils/replace_params_query';
import { resolveQueryReference } from '../../lib/resolve_query_reference';

export interface CreateActionOptions {
  alertData?: ParsedTechnicalFields & { _index: string };
  space?: { id: string };
}

export const createActionService = (osqueryContext: OsqueryAppContext) => {
  let licenseSubscription: Subscription | null = null;
  const licenses: OsqueryActiveLicenses = { isActivePlatinumLicense: false };

  licenseSubscription = osqueryContext.licensing.license$.subscribe((license) => {
    licenses.isActivePlatinumLicense = license.isActive && license.hasAtLeast('platinum');
  });

  const logger = osqueryContext.logFactory.get('createActionService');

  /**
   * Reports whether dispatching `params` would substitute `{{...}}` parameters.
   *
   * A rule run dispatches the *stored* saved query / pack content, but the caller only has the
   * copy persisted on the rule, which drifts as soon as the referenced object is edited. Editing
   * a saved query needs only `writeSavedQueries` — a lower bar than editing the rule — so a
   * template added there would otherwise leave the stale persisted copy looking static, the run
   * would take the non-parameterized branch, and nothing would be dispatched at all. Resolve the
   * stored content so the decision matches what actually runs.
   */
  const containsDynamicQueries = async (
    // Only the referenced ids and the SQL are read, so accept that narrow shape rather than a
    // full request body: callers pass a rule's persisted params, not a live-query payload.
    params: {
      query?: string;
      queries?: Array<{ query?: string }>;
      saved_query_id?: string;
      pack_id?: string;
    },
    options?: { space?: { id: string } }
  ): Promise<boolean> => {
    const persisted = params.queries?.length
      ? params.queries.map(({ query }) => query)
      : [params.query];

    if (persisted.some((query) => query && containsDynamicQuery(query))) {
      return true;
    }

    if (!params.saved_query_id?.trim() && !params.pack_id?.trim()) {
      return false;
    }

    const [coreStart] = await osqueryContext.getStartServices();

    try {
      const resolved = await resolveQueryReference(coreStart, options?.space?.id, {
        saved_query_id: params.saved_query_id,
        pack_id: params.pack_id,
      });

      const stored = resolved?.queries ?? (resolved?.query ? [resolved.query] : []);

      return stored.some((query) => query && containsDynamicQuery(query));
    } catch (error) {
      // Unresolvable stored content is reported on the action document by the dispatch path.
      // Fall back to the persisted copy's verdict rather than failing the whole rule run here.
      logger.warn(
        `Unable to resolve stored osquery content to determine parameterization: ${error.message}`
      );

      return false;
    }
  };

  const create = async (
    params: CreateLiveQueryRequestBodySchema,
    options?: CreateActionOptions
  ) => {
    const error = validateLicense(licenses);

    return createActionHandler(osqueryContext, params, {
      alertData: options?.alertData,
      space: options?.space,
      error,
      // Rule-run dispatches stored content for saved_query_id / pack_id.
      useStoredQuery: true,
      // A throw here would be swallowed by osqueryResponseAction and the rule run would still
      // report success; record the failure on the action document so the alert's Osquery
      // Results tab shows why nothing ran.
      reportErrorsOnAction: true,
    });
  };

  const stop = () => {
    if (licenseSubscription) {
      licenseSubscription.unsubscribe();
    }
  };

  return {
    create,
    containsDynamicQueries,
    stop,
    logger,
  };
};
