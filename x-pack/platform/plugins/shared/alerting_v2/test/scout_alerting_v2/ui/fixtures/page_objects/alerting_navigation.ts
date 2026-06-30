/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout';

export type AlertingApp = 'rules' | 'alerts' | 'actionPolicies' | 'executionHistory';

interface AlertingAppMeta {
  /** Management deep-link path passed to `page.gotoApp`. */
  readonly path: string;
  /** Kibana feature id backing the page (used in the interstitial list). */
  readonly featureId: string;
  /** Accessible name of the page header shown when access is granted. */
  readonly heading: RegExp;
}

export const ALERTING_APP_META: Record<AlertingApp, AlertingAppMeta> = {
  rules: {
    path: 'management/alertingV2/rules',
    featureId: 'alerting_v2_rules',
    heading: /^Rules/i,
  },
  alerts: {
    path: 'management/alertingV2/episodes',
    featureId: 'alerting_v2_alerts',
    heading: /alert episodes/i,
  },
  actionPolicies: {
    path: 'management/alertingV2/action_policies',
    featureId: 'alerting_v2_action_policies',
    heading: /action policies/i,
  },
  executionHistory: {
    path: 'management/alertingV2/execution_history',
    featureId: 'alerting_v2_execution_history',
    heading: /execution history/i,
  },
};

/**
 * Drives navigation to the four alerting_v2 management apps and exposes the
 * "Privileges required" interstitial locators, so specs can assert which pages
 * a given role can view.
 */
export class AlertingNavigation {
  public readonly requiredPrivilegesPrompt: Locator;

  constructor(private readonly page: ScoutPage) {
    this.requiredPrivilegesPrompt = this.page.testSubj.locator('alertingRequiredPrivilegesPrompt');
  }

  async goto(app: AlertingApp) {
    await this.page.gotoApp(ALERTING_APP_META[app].path);
  }

  pageHeading(app: AlertingApp): Locator {
    return this.page.getByRole('heading', { name: ALERTING_APP_META[app].heading, level: 1 });
  }

  requiredPrivilegeItem(app: AlertingApp): Locator {
    return this.page.testSubj.locator(
      `alertingRequiredPrivilege-${ALERTING_APP_META[app].featureId}`
    );
  }
}
