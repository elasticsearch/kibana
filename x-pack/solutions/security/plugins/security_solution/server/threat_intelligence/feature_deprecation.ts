/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import { SECURITY_FEATURE_ID_V5 } from '@kbn/security-solution-features/constants';
import {
  SAVED_VIEW_SO_TYPE,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  THREAT_INTELLIGENCE_FEATURE_ID,
} from '../../common/threat_intelligence/hub';

/**
 * Registers the standalone `threatIntelligence` Kibana feature in deprecated
 * form so existing role assignments lazy-migrate to the new threat-intelligence
 * sub-feature on the Security Solution feature.
 *
 * Folded in from the standalone threat-intelligence plugin's `server/features.ts`. The
 * feature `id` is preserved (`'threatIntelligence'`) — the deprecation
 * framework keys off the id and would otherwise drop role bindings on the
 * floor. Every privilege carries a `replacedBy` mapping pointing at the
 * matching privilege on `SECURITY_FEATURE_ID_V5`'s
 * `SecuritySubFeatureId.threatIntelligence` sub-feature (see
 * `@kbn/security-solution-features/src/security/kibana_sub_features.ts`).
 *
 * Migration semantics:
 *   - Deprecated `all`  → new sub-feature `threat_intelligence_write_subscriptions`
 *                         + `threat_intelligence_manage_sources` (because the
 *                         standalone `all` implicitly included
 *                         `manage_sources` via `includeIn: 'all'`).
 *     The `minimal` variant maps to just
 *     `threat_intelligence_write_subscriptions` (no auto-included sub-feature).
 *   - Deprecated `read` → new sub-feature `threat_intelligence_read`.
 *   - Deprecated `manage_sources` sub-feature → new sub-feature
 *     `threat_intelligence_manage_sources`.
 *
 * `minimumLicense: 'platinum'` is preserved to match the original gating; the
 * replacement sub-feature is enabled via
 * `ProductFeatureSecurityKey.threatIntelligence`, which is configured for the
 * same product tiers.
 *
 * The `app: []` array is intentionally empty: the standalone Kibana app id
 * `threatIntelligence` is gone (Phase 3 of the threat-intelligence migration
 * folded the Indicators and Intelligence Hub views into the
 * `securitySolutionUI` app), so the deprecated feature has nothing app-scoped
 * to declare. The replacement sub-feature inherits the Security feature's app
 * list.
 */
export const registerDeprecatedThreatIntelligenceFeature = ({
  features,
}: {
  features: FeaturesPluginSetup;
}): void => {
  features.registerKibanaFeature({
    deprecated: {
      notice: i18n.translate('xpack.securitySolution.threatIntelligence.featureDeprecationNotice', {
        defaultMessage:
          'The {currentId} feature is deprecated. Its privileges now live on the {latestId} feature as the Threat Intelligence sub-feature.',
        values: {
          currentId: THREAT_INTELLIGENCE_FEATURE_ID,
          latestId: SECURITY_FEATURE_ID_V5,
        },
      }),
    },
    id: THREAT_INTELLIGENCE_FEATURE_ID,
    name: i18n.translate('xpack.securitySolution.threatIntelligence.deprecatedFeatureName', {
      defaultMessage: 'Threat Intelligence (Deprecated)',
    }),
    minimumLicense: 'platinum',
    order: 1100,
    category: DEFAULT_APP_CATEGORIES.security,
    app: [],
    catalogue: [],
    privileges: {
      all: {
        replacedBy: {
          default: [
            {
              feature: SECURITY_FEATURE_ID_V5,
              privileges: [
                'threat_intelligence_write_subscriptions',
                'threat_intelligence_manage_sources',
              ],
            },
          ],
          minimal: [
            {
              feature: SECURITY_FEATURE_ID_V5,
              privileges: ['threat_intelligence_write_subscriptions'],
            },
          ],
        },
        app: [],
        api: [
          THREAT_INTELLIGENCE_API_PRIVILEGES.read,
          THREAT_INTELLIGENCE_API_PRIVILEGES.writeSubscriptions,
        ],
        catalogue: [],
        savedObject: { all: [SAVED_VIEW_SO_TYPE], read: [SAVED_VIEW_SO_TYPE] },
        ui: ['show', 'createSubscription', 'manageSubscriptions', 'createSavedView'],
      },
      read: {
        replacedBy: {
          default: [
            {
              feature: SECURITY_FEATURE_ID_V5,
              privileges: ['threat_intelligence_read'],
            },
          ],
          minimal: [
            {
              feature: SECURITY_FEATURE_ID_V5,
              privileges: ['threat_intelligence_read'],
            },
          ],
        },
        app: [],
        api: [THREAT_INTELLIGENCE_API_PRIVILEGES.read],
        catalogue: [],
        savedObject: { all: [], read: [SAVED_VIEW_SO_TYPE] },
        ui: ['show'],
      },
    },
    subFeatures: [
      {
        name: i18n.translate(
          'xpack.securitySolution.threatIntelligence.deprecatedFeature.manageSourcesSubFeatureName',
          { defaultMessage: 'Manage feed sources' }
        ),
        privilegeGroups: [
          {
            groupType: 'independent',
            privileges: [
              {
                id: 'manage_sources',
                name: i18n.translate(
                  'xpack.securitySolution.threatIntelligence.deprecatedFeature.manageSourcesPrivilegeName',
                  { defaultMessage: 'All' }
                ),
                includeIn: 'all',
                api: [THREAT_INTELLIGENCE_API_PRIVILEGES.manageSources],
                savedObject: { all: [], read: [] },
                ui: ['manageSources'],
                replacedBy: [
                  {
                    feature: SECURITY_FEATURE_ID_V5,
                    privileges: ['threat_intelligence_manage_sources'],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
};
