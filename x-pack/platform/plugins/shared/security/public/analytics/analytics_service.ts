/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';
import { filter, switchMap, throttleTime } from 'rxjs';

import type {
  AnalyticsServiceSetup as CoreAnalyticsServiceSetup,
  HttpSetup,
  HttpStart,
} from '@kbn/core/public';
import type { AuthenticationServiceSetup } from '@kbn/security-plugin-types-public';

import { registerUserContext } from './register_user_context';
import type { SecurityLicense } from '../../common';

interface AnalyticsServiceSetupParams {
  securityLicense: SecurityLicense;
  analytics: CoreAnalyticsServiceSetup;
  authc: AuthenticationServiceSetup;
  http: HttpSetup;
  cloudId?: string;
}

interface AnalyticsServiceStartParams {
  http: HttpStart;
}

/**
 * The signature of the authentication type used by the user and the timestamp
 * indicating when the signature was calculated.
 */
interface AuthTypeInfo {
  signature: string;
  timestamp: number;
}

export class AnalyticsService {
  public static AuthTypeInfoStorageKey = 'kibana.security.userAuthType';
  private securityLicense!: SecurityLicense;
  private securityFeaturesSubscription?: Subscription;

  public setup({ analytics, authc, cloudId, http, securityLicense }: AnalyticsServiceSetupParams) {
    this.securityLicense = securityLicense;
    if (http.anonymousPaths.isAnonymous(window.location.pathname) === false) {
      registerUserContext(analytics, authc, cloudId);
    }
    analytics.registerEventType({
      eventType: 'display_language_changed',
      schema: {
        from: {
          type: 'keyword',
          _meta: { description: 'The previous display language locale code.' },
        },
        to: {
          type: 'keyword',
          _meta: { description: 'The new display language locale code.' },
        },
        preferred_language_kibana_locale: {
          type: 'keyword',
          _meta: {
            optional: true,
            description:
              "The browser's most-preferred language (from navigator.languages) resolved to a Kibana locale id — exact match first, then primary language-subtag fallback (e.g. en-US resolves to en). Omitted when no browser preference can be served. Directly comparable to `from` and `to`.",
          },
        },
      },
    });
  }

  public start({ http }: AnalyticsServiceStartParams) {
    // Wait for the license info before recording authentication type. License
    // change events are throttled with 5s interval.
    this.securityFeaturesSubscription = this.securityLicense.features$
      .pipe(
        filter(({ allowLogin }) => allowLogin),
        throttleTime(5000),
        switchMap(async () => {
          try {
            await AnalyticsService.recordAuthTypeAnalytics(http);
          } catch {
            // do nothing
          }
        })
      )
      .subscribe();
  }

  public stop() {
    if (this.securityFeaturesSubscription) {
      this.securityFeaturesSubscription.unsubscribe();
      this.securityFeaturesSubscription = undefined;
    }
  }

  private static async recordAuthTypeAnalytics(http: HttpStart) {
    if (http.anonymousPaths.isAnonymous(window.location.pathname)) {
      return;
    }

    localStorage.setItem(
      AnalyticsService.AuthTypeInfoStorageKey,
      JSON.stringify(
        await http.post<AuthTypeInfo>('/internal/security/analytics/_record_auth_type', {
          body: localStorage.getItem(AnalyticsService.AuthTypeInfoStorageKey),
        })
      )
    );
  }
}
