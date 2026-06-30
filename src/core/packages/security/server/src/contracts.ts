/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreFipsService } from './fips';
import type { CoreAuthenticationService, FakeRequestEnricher } from './authc';
import type { CoreSecurityDelegateContract } from './api_provider';
import type { CoreAuditService } from './audit';
/**
 * Setup contract for Core's security service.
 *
 * @public
 */
export interface SecurityServiceSetup {
  /**
   * Register the security implementation that then will be used and re-exposed by Core.
   *
   * @remark this should **exclusively** be used by the security plugin.
   */
  registerSecurityDelegate(api: CoreSecurityDelegateContract): void;

  /**
   * Returns a function that binds originating-user identity fields (currently
   * `profile_uid` and `username`) to a fake request so that
   * `security.authc.getCurrentUser(request)` resolves to a synthetic
   * {@link AuthenticatedUser} exposing only those fields. Reading any other
   * identity field on the returned user yields `undefined`.
   *
   * One-shot: calling it more than once throws. Reserved for Task Manager,
   * the sole legitimate consumer. The returned enricher throws on non-fake
   * requests; calling it twice on the same fake request is a no-op
   * (first-wins) and emits a warning.
   *
   * @internal
   */
  acquireFakeRequestEnricher(): FakeRequestEnricher;

  /**
   * The {@link CoreFipsService | FIPS service}
   */
  fips: CoreFipsService;
}

/**
 * Start contract for Core's security service.
 *
 * @public
 */
export interface SecurityServiceStart {
  /**
   * The {@link CoreAuthenticationService | authentication service}
   */
  authc: CoreAuthenticationService;
  /**
   * The {@link CoreAuditService | audit service}
   */
  audit: CoreAuditService;
}
