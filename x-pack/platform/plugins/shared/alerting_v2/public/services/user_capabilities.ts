/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import type { ApplicationStart } from '@kbn/core/public';
import { CoreStart } from '@kbn/core-di-browser';
import {
  ALERTING_V2_FEATURES,
  ALERTING_V2_UI_CAPABILITIES,
  type AlertingV2Feature,
  type AlertingV2UICapabilityFor,
} from '../../common/feature_privileges';

/**
 * Typed read-only view over `application.capabilities` for alerting_v2 features.
 *
 * This gates **UI capabilities only**. A `true` result means the capability is
 * surfaced to the current user in the UI; it is NOT an authorization boundary.
 * Server routes must still enforce authorization independently. In particular,
 * `canWrite()` is not a permission check for a mutation.
 *
 * Closed for modification: new (sub-)feature UI capabilities defined in the
 * feature-privileges schema become usable immediately via the generic `can()`
 * method without editing this service. Do not add feature-specific helpers
 * here; keep those next to the UI flow that needs them.
 */
@injectable()
export class UserCapabilities {
  constructor(@inject(CoreStart('application')) private readonly application: ApplicationStart) {}

  /** Returns whether the given UI capability is granted for the feature. */
  public can<F extends AlertingV2Feature>(
    feature: F,
    capability: AlertingV2UICapabilityFor<F>
  ): boolean {
    const { id } = ALERTING_V2_FEATURES[feature];
    return this.application.capabilities[id]?.[capability] === true;
  }

  /**
   * Returns whether the user can read the feature. Granted when either the
   * top-level write/all or read capability is set, since `all` implies `read`.
   */
  public canRead(feature: AlertingV2Feature): boolean {
    return this.canWrite(feature) || this.can(feature, ALERTING_V2_UI_CAPABILITIES[feature].read);
  }

  /** Returns whether the feature's top-level write/all capability is granted. */
  public canWrite(feature: AlertingV2Feature): boolean {
    return this.can(feature, ALERTING_V2_UI_CAPABILITIES[feature].all);
  }
}
