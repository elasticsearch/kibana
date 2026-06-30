/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CASES_INTERNAL_URL } from '../../common/constants';

/**
 * Name of the Elasticsearch index owned by cases-analytics v2's case
 * surface. Cluster-level (one index regardless of spaces or owners),
 * hidden by default, `index.mode: lookup` so downstream surfaces can
 * `LOOKUP JOIN` from ES|QL. Mirrors the source `cases` saved-object
 * type so an administrator reading `_cat/indices` can map back to the
 * source data.
 */
export const CASE_INDEX_NAME = '.cases';

/**
 * Administrator route URLs. All under `/internal/cases/_analyticsV2/*`
 * — internal access only, superuser-gated. Not customer-facing;
 * exist so on-call can introspect state and recover from
 * inconsistencies without querying system indices by hand.
 */
export const CASES_ANALYTICS_V2_STATE_URL = `${CASES_INTERNAL_URL}/_analyticsV2/state`;
export const CASES_ANALYTICS_V2_RECONCILE_RUN_SOON_URL = `${CASES_INTERNAL_URL}/_analyticsV2/reconcile/run_soon`;
export const CASES_ANALYTICS_V2_RESET_URL = `${CASES_INTERNAL_URL}/_analyticsV2/reset`;
