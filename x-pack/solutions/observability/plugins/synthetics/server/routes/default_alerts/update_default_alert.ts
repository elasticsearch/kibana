/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getSyntheticsDynamicSettings } from '../../saved_objects/synthetics_settings';
import { DefaultRuleService } from './default_alert_service';
import type { SyntheticsRestApiRouteFactory } from '../types';
import { SYNTHETICS_API_URLS } from '../../../common/constants';
import type { DEFAULT_ALERT_RESPONSE } from '../../../common/types/default_alerts';
import { WRITE_SYNTHETICS_DEFAULT_RULES_API } from '../../feature';

export const updateDefaultAlertingRoute: SyntheticsRestApiRouteFactory = () => ({
  method: 'PUT',
  path: SYNTHETICS_API_URLS.ENABLE_DEFAULT_ALERTING,
  validate: {},
  // Updating default rules is rule management, not monitor mutation, so it does
  // not require `uptime-write`. Either `uptime-write` (existing roles) or the
  // `write_synthetics_default_rules` sub-feature is enough.
  writeAccess: false,
  anyRequiredPrivileges: ['uptime-write', WRITE_SYNTHETICS_DEFAULT_RULES_API],
  handler: async ({ context, server, savedObjectsClient }): Promise<DEFAULT_ALERT_RESPONSE> => {
    const defaultAlertService = new DefaultRuleService(context, server, savedObjectsClient);
    const { defaultTLSRuleEnabled, defaultStatusRuleEnabled } = await getSyntheticsDynamicSettings(
      savedObjectsClient
    );

    const updateStatusRulePromise = defaultAlertService.updateStatusRule(defaultStatusRuleEnabled);
    const updateTLSRulePromise = defaultAlertService.updateTlsRule(defaultTLSRuleEnabled);

    try {
      const [statusRule, tlsRule] = await Promise.all([
        updateStatusRulePromise,
        updateTLSRulePromise,
      ]);
      return {
        statusRule: statusRule || null,
        tlsRule: tlsRule || null,
      };
    } catch (error) {
      server.logger.error(`Error updating default alerting rules, Error: ${error.message}`, {
        error,
      });
      return {
        statusRule: null,
        tlsRule: null,
      };
    }
  },
});
