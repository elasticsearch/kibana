/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup } from '@kbn/core-lifecycle-browser';
import type { InternalApplicationSetup } from '@kbn/core-application-browser-internal';
import type { InternalChromeSetup } from '@kbn/core-chrome-browser-internal';
import type { InternalCoreDiServiceSetup } from '@kbn/core-di-internal';
import type { DeferredInitStart } from '@kbn/core-deferred-init-browser';
import type { InternalInjectedMetadataSetup } from '@kbn/core-injected-metadata-browser-internal';
import type { InternalHttpSetup } from '@kbn/core-http-browser-internal';
import type { InternalSecurityServiceSetup } from '@kbn/core-security-browser-internal';
import type { InternalUserProfileServiceSetup } from '@kbn/core-user-profile-browser-internal';
import type { FeatureFlagsSetup } from '@kbn/core-feature-flags-browser';

/** @internal */
export interface InternalCoreSetup
  extends Omit<
    CoreSetup,
    | 'application'
    | 'chrome'
    | 'injection'
    | 'plugins'
    | 'getStartServices'
    | 'http'
    | 'security'
    | 'userProfile'
  > {
  application: InternalApplicationSetup;
  chrome: InternalChromeSetup;
  /** Internal-only: used to gate a lazy plugin's registered app during setup. Not public API. */
  deferredInit: DeferredInitStart;
  featureFlags: FeatureFlagsSetup;
  injectedMetadata: InternalInjectedMetadataSetup;
  injection: InternalCoreDiServiceSetup;
  http: InternalHttpSetup;
  security: InternalSecurityServiceSetup;
  userProfile: InternalUserProfileServiceSetup;
}
