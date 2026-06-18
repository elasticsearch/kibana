/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { AnalyticsServiceSetup } from '@kbn/core-analytics-server';

/**
 * Internal-only extension of the analytics setup contract.
 *
 * Exposes the registration of the opt-in status source of truth, which is intentionally kept off
 * the public {@link AnalyticsServiceSetup} so regular plugins cannot drive the global consent.
 *
 * @internal
 */
export interface InternalAnalyticsServiceSetup extends AnalyticsServiceSetup {
  /**
   * Registers the observable that becomes the source of truth for the global opt-in status.
   *
   * The provided observable both feeds the consumer-facing {@link AnalyticsServiceStart.isOptedIn$}
   * and drives the analytics client's global consent.
   *
   * It is expected to emit only once the opt-in status is known (i.e. it should withhold emissions
   * while the user has not made a decision yet, e.g. after a major/minor upgrade), and to emit again
   * whenever the preference changes. Registering more than once overrides the previous source of truth.
   *
   * @remark Intended to be called by the platform-owned telemetry producer only.
   * @param isOptedIn$ An observable emitting the global opt-in status.
   */
  registerOptInStatus$: (isOptedIn$: Observable<boolean>) => void;
}
