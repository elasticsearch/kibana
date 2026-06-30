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
  AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
  AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID,
  AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID,
  AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID,
  AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID,
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
    [AGENT_BUILDER_TRACING_ENABLED_SETTING_ID]: {
      name: i18n.translate('xpack.agentBuilder.uiSettings.tracing.enabled.name', {
        defaultMessage: 'Collect conversation traces',
      }),
      description: i18n.translate('xpack.agentBuilder.uiSettings.tracing.enabled.description', {
        defaultMessage:
          'Collects OpenTelemetry traces for Agent Builder conversations and ingests them into Elasticsearch.',
      }),
      schema: schema.boolean(),
      value: true,
      requiresPageReload: false,
      readonly: true,
      readonlyMode: 'ui',
    },
    [AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID]: {
      name: i18n.translate('xpack.agentBuilder.uiSettings.tracing.userPrompts.name', {
        defaultMessage: 'Include user prompts in traces',
      }),
      description: i18n.translate('xpack.agentBuilder.uiSettings.tracing.userPrompts.description', {
        defaultMessage: 'User messages are not captured by default.',
      }),
      schema: schema.boolean(),
      value: false,
      requiresPageReload: false,
      readonly: true,
      readonlyMode: 'ui',
    },
    [AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID]: {
      name: i18n.translate('xpack.agentBuilder.uiSettings.tracing.systemPrompt.name', {
        defaultMessage: 'Include system prompt in traces',
      }),
      description: i18n.translate(
        'xpack.agentBuilder.uiSettings.tracing.systemPrompt.description',
        {
          defaultMessage: 'Agent instructions are not captured by default.',
        }
      ),
      schema: schema.boolean(),
      value: false,
      requiresPageReload: false,
      readonly: true,
      readonlyMode: 'ui',
    },
    [AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID]: {
      name: i18n.translate('xpack.agentBuilder.uiSettings.tracing.llmResponses.name', {
        defaultMessage: 'Include LLM responses in traces',
      }),
      description: i18n.translate(
        'xpack.agentBuilder.uiSettings.tracing.llmResponses.description',
        {
          defaultMessage: 'Agent responses are not captured by default.',
        }
      ),
      schema: schema.boolean(),
      value: false,
      requiresPageReload: false,
      readonly: true,
      readonlyMode: 'ui',
    },
    [AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID]: {
      name: i18n.translate('xpack.agentBuilder.uiSettings.tracing.toolDetails.name', {
        defaultMessage: 'Include tool call details in traces',
      }),
      description: i18n.translate('xpack.agentBuilder.uiSettings.tracing.toolDetails.description', {
        defaultMessage: 'Tool call arguments and results are not captured by default.',
      }),
      schema: schema.boolean(),
      value: false,
      requiresPageReload: false,
      readonly: true,
      readonlyMode: 'ui',
    },

    [AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID]: {
      name: i18n.translate('xpack.agentBuilder.uiSettings.tracing.realNames.name', {
        defaultMessage: 'Include real tool and agent names in traces',
      }),
      description: i18n.translate('xpack.agentBuilder.uiSettings.tracing.realNames.description', {
        defaultMessage: 'Tool and agent names are anonymized by default.',
      }),
      schema: schema.boolean(),
      value: false,
      requiresPageReload: false,
      readonly: true,
      readonlyMode: 'ui',
    },
    [AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID]: {
      name: i18n.translate('xpack.agentBuilder.uiSettings.tracing.realIds.name', {
        defaultMessage: 'Include real conversation and workflow IDs in traces',
      }),
      description: i18n.translate('xpack.agentBuilder.uiSettings.tracing.realIds.description', {
        defaultMessage: 'Conversation and workflow IDs are anonymized by default.',
      }),
      schema: schema.boolean(),
      value: false,
      requiresPageReload: false,
      readonly: true,
      readonlyMode: 'ui',
    },
  });
};
