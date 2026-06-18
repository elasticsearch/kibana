/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { AnalyticsClient } from '@elastic/ebt/client';

/**
 * Exposes the public APIs of the AnalyticsClient during the preboot phase
 * {@link AnalyticsClient}
 * @public
 */
export type AnalyticsServicePreboot = Omit<AnalyticsClient, 'flush' | 'shutdown'>;

/**
 * Exposes the public APIs of the AnalyticsClient during the setup phase.
 * {@link AnalyticsClient}
 * @public
 */
export type AnalyticsServiceSetup = Omit<AnalyticsClient, 'flush' | 'shutdown'>;

/**
 * Exposes the public APIs of the AnalyticsClient during the start phase
 * {@link AnalyticsClient}
 * @public
 */
export type AnalyticsServiceStart = Pick<
  AnalyticsClient,
  'optIn' | 'reportEvent' | 'telemetryCounter$'
> & {
  /**
   * An Observable that emits the user's global opt-in preference.
   *
   * Pushes `true` when sending usage to Elastic is enabled, and `false` when the user explicitly
   * opted out. It withholds emissions until the opt-in status is known (e.g. while a previously
   * opted-out user has not chosen yet after a major/minor upgrade).
   *
   * @track-adoption
   */
  isOptedIn$: Observable<boolean>;
};
