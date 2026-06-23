/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core-lifecycle-browser';
import type { NodeDefinition } from '@kbn/core-chrome-browser';
import { i18n } from '@kbn/i18n';
import { ALERTING_V2_ENABLED_SETTING_ID } from '@kbn/alerting-v2-constants';

const PANEL_ID = 'alerting_v2_panel';

/**
 * Returns the management-section navigation entries that solution side-nav
 * trees should append to their "Stack / Project Settings" footer for the
 * Alerting v2 management apps.
 *
 * Returns an empty array when `alerting:v2:enabled` is `false`, so callers
 * can spread the result unconditionally:
 *
 * ```ts
 * children: [
 *   ...existingChildren,
 *   ...getAlertingV2ManagementNavPanel(core),
 * ]
 * ```
 *
 * The full `CoreStart` is intentionally accepted (rather than a narrower
 * `Pick<CoreStart, 'settings'>`) so that future gating concerns
 * (capability-based RBAC via `core.application.capabilities`, license
 * checks, etc.) can be added inside this helper without changing its
 * signature or touching any of the consumer files again.
 */
export const getAlertingV2ManagementNavPanel = (core: CoreStart): NodeDefinition[] => {
  const enabled = core.settings.globalClient.get<boolean>(ALERTING_V2_ENABLED_SETTING_ID, false);

  if (!enabled) {
    return [];
  }

  return [
    {
      id: PANEL_ID,
      title: i18n.translate('xpack.alertingV2.nav.title', {
        defaultMessage: 'Alerting V2 Preview',
      }),
      renderAs: 'panelOpener',
      children: [
        { link: 'management:rules' },
        { link: 'management:episodes' },
        { link: 'management:action_policies' },
        { link: 'management:execution_history' },
      ],
    },
  ];
};
