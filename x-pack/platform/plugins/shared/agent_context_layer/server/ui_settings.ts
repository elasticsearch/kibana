/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { UiSettingsServiceSetup } from '@kbn/core-ui-settings-server';
import { i18n } from '@kbn/i18n';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';

export const registerUISettings = ({
  uiSettings,
}: {
  uiSettings: UiSettingsServiceSetup;
}): void => {
  uiSettings.register({
    [CONTEXT_ENGINE_ENABLED_SETTING_ID]: {
      name: i18n.translate('xpack.agentContextLayer.uiSettings.contextEngine.name', {
        defaultMessage: 'Context Engine',
      }),
      description: i18n.translate('xpack.agentContextLayer.uiSettings.contextEngine.description', {
        defaultMessage: 'Enables the Context Engine.',
      }),
      schema: schema.boolean(),
      value: false,
      experimental: true,
      requiresPageReload: false,
      readonly: false,
    },
  });
};
