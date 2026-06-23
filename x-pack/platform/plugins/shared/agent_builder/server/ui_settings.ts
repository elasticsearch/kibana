/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { UiSettingsServiceSetup } from '@kbn/core-ui-settings-server';
import { i18n } from '@kbn/i18n';
import {
  AGENT_BUILDER_NAV_ENABLED_SETTING_ID,
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  AGENT_BUILDER_BASH_SUPPORT_SETTING_ID,
  AGENT_BUILDER_UIAM_OAUTH_CLIENT_MANAGEMENT_SETTING_ID,
} from '@kbn/management-settings-ids';

export const registerUISettings = ({ uiSettings }: { uiSettings: UiSettingsServiceSetup }) => {
  uiSettings.register({
    [AGENT_BUILDER_NAV_ENABLED_SETTING_ID]: {
      description: i18n.translate('xpack.agentBuilder.uiSettings.nav.description', {
        defaultMessage: 'Enables the Elastic Agent Builder icon in the global navigation bar.',
      }),
      name: i18n.translate('xpack.agentBuilder.uiSettings.nav.name', {
        defaultMessage: 'Elastic Agent Builder Navigation Icon',
      }),
      schema: schema.boolean(),
      value: false,
      technicalPreview: true,
      requiresPageReload: true,
      readonly: true,
      readonlyMode: 'ui',
    },
    [AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID]: {
      description: i18n.translate(
        'xpack.agentBuilder.uiSettings.experimentalFeatures.description',
        {
          defaultMessage: 'Enables experimental features for Elastic Agent Builder.',
        }
      ),
      name: i18n.translate('xpack.agentBuilder.uiSettings.experimentalFeatures.name', {
        defaultMessage: 'Elastic Agent Builder: Experimental Features',
      }),
      schema: schema.boolean(),
      value: false,
      experimental: true,
      requiresPageReload: false,
      readonly: false,
    },
    [AGENT_BUILDER_BASH_SUPPORT_SETTING_ID]: {
      description: i18n.translate('xpack.agentBuilder.uiSettings.bashSupport.description', {
        defaultMessage:
          'Enables the experimental bash tool for Elastic Agent Builder. Disabled by default; intended for controlled experimentation.',
      }),
      name: i18n.translate('xpack.agentBuilder.uiSettings.bashSupport.name', {
        defaultMessage: 'Elastic Agent Builder: Bash Tool',
      }),
      schema: schema.boolean(),
      value: false,
      experimental: true,
      requiresPageReload: false,
      readonly: false,
    },
    [AGENT_BUILDER_UIAM_OAUTH_CLIENT_MANAGEMENT_SETTING_ID]: {
      description: i18n.translate(
        'xpack.agentBuilder.uiSettings.uiamOAuthClientManagement.description',
        {
          defaultMessage:
            'Internal gate for UIAM OAuth client management endpoints and the Agent Builder MCP Clients UI. Not intended for end-user use.',
        }
      ),
      name: i18n.translate('xpack.agentBuilder.uiSettings.uiamOAuthClientManagement.name', {
        defaultMessage: 'UIAM OAuth client management',
      }),
      schema: schema.boolean(),
      value: false,
      technicalPreview: true,
      requiresPageReload: true,
      readonly: true,
      readonlyMode: 'strict',
    },
  });
};
