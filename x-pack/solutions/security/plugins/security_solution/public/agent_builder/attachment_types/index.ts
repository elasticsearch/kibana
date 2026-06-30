/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import type {
  AttachmentServiceStartContract,
  AgentBuilderPluginStart,
} from '@kbn/agent-builder-browser';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { DataPublicPluginStart, ISessionService } from '@kbn/data-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { Subscription } from 'rxjs';
import type { StartServices } from '../../types';
import type { SecurityAppStore } from '../../common/store/types';
import { SecurityAgentBuilderAttachments } from '../../../common/constants';
import type { ExperimentalFeatures } from '../../../common/experimental_features';
import type { SecurityCanvasEmbeddedBundle } from '../components/security_redux_embedded_provider';
import type { SecurityAgentBuilderChrome } from './entity_explore_navigation';
import type { AiRuleCreationService } from '../../detection_engine/common/ai_rule_creation_store';

/**
 * Extension of UnknownAttachment that includes an optional attachmentLabel field in the data property
 */
type UnknownAttachmentWithLabel = Attachment<
  string,
  { attachmentLabel?: string } & Record<string, unknown>
>;

interface AttachmentTypeConfig {
  type: SecurityAgentBuilderAttachments;
  label: string;
  icon: string;
}

const ALERT_ATTACHMENT_CONFIG: AttachmentTypeConfig = {
  type: SecurityAgentBuilderAttachments.alert,
  label: i18n.translate('xpack.securitySolution.agentBuilder.attachments.alert.label', {
    defaultMessage: 'Security Alert',
  }),
  icon: 'bell',
};

const ALERTS_DEFAULT_LABEL = i18n.translate(
  'xpack.securitySolution.agentBuilder.attachments.alerts.label',
  { defaultMessage: 'Security alerts' }
);

const createAttachmentTypeConfig = (defaultLabel: string, icon: string) => ({
  getLabel: (attachment: UnknownAttachmentWithLabel) => {
    const attachmentLabel = attachment?.data?.attachmentLabel;
    return attachmentLabel ?? defaultLabel;
  },
  getIcon: () => icon,
});

/**
 * Registers the baseline attachment UI definitions that do not require Security Solution runtime
 * context:
 *   - `security.alert` — label + icon only (no rich renderer yet).
 *
 * The rich `security.entity` renderer (card/table + Canvas) is installed via the separate
 * {@link registerEntityAttachment} entry point so the plugin's `start()` can supply
 * `application`, `chrome`, `agentBuilder`, and the lazy Redux/services bundle.
 */
export const registerAttachmentUiDefinitions = (attachments: AttachmentServiceStartContract) => {
  attachments.addAttachmentType<UnknownAttachmentWithLabel>(
    ALERT_ATTACHMENT_CONFIG.type,
    createAttachmentTypeConfig(ALERT_ATTACHMENT_CONFIG.label, ALERT_ATTACHMENT_CONFIG.icon)
  );

  attachments.addAttachmentType<Attachment<string, { alertIds?: unknown[] }>>(
    SecurityAgentBuilderAttachments.alerts,
    {
      getLabel: (attachment) => {
        const count = attachment.data?.alertIds?.length ?? 0;
        return count > 0
          ? i18n.translate('xpack.securitySolution.agentBuilder.attachments.alerts.countLabel', {
              defaultMessage: '{count} {count, plural, one {alert} other {alerts}}',
              values: { count },
            })
          : ALERTS_DEFAULT_LABEL;
      },
      getIcon: () => 'bell',
    }
  );
};

/**
 * Registers the rich `security.entity` attachment renderer (entity card for a single entity,
 * entity table with per-row Explore links for multiple, Canvas preview for single host/user/
 * service). Callable from `plugin.tsx#start()` alongside `registerRuleAttachment` /
 * `registerEntityAnalyticsDashboardAttachment` once the Security sub-plugins and services are
 * available.
 *
 * The lazy `security_entity_attachment_rich` chunk keeps bundle impact at zero until the first
 * `security.entity` attachment is rendered. The `security.entity` attachment itself is only
 * ever emitted by the Entity Store V2 tools (`security.get_entity` /
 * `security.search_entities`), which are gated on `entityAnalyticsEntityStoreV2`, so non-V2
 * environments never exercise this renderer even though it's registered unconditionally.
 */
export const registerEntityAttachment = ({
  attachments,
  application,
  agentBuilder,
  chrome,
  experimentalFeatures,
  resolveSecurityCanvasContext,
  searchSession,
}: {
  attachments: AttachmentServiceStartContract;
  application: ApplicationStart;
  agentBuilder?: AgentBuilderPluginStart;
  chrome?: SecurityAgentBuilderChrome;
  experimentalFeatures: ExperimentalFeatures;
  resolveSecurityCanvasContext: () => Promise<SecurityCanvasEmbeddedBundle>;
  searchSession?: ISessionService;
}): void => {
  void import(
    /* webpackChunkName: "security_entity_attachment_rich" */
    './entity_attachment'
  ).then(({ createEntityAttachmentDefinition }) => {
    attachments.addAttachmentType(
      SecurityAgentBuilderAttachments.entity,
      createEntityAttachmentDefinition({
        experimentalFeatures,
        application,
        agentBuilder,
        chrome,
        resolveSecurityCanvasContext,
        searchSession,
      })
    );
  });
};

/**
 * Registers the `security.rule` attachment renderer (rule preview card with
 * "Apply to creation" / "Update rule" action buttons). Dynamically imports
 * [./rule_attachment](./rule_attachment.tsx) so the rule-schema helpers and the
 * EUI `EuiCodeBlock`/`EuiCallOut` surface stay off the main `securitySolution`
 * page-load bundle.
 *
 * Race-window: until the chunk resolves, `security.rule` attachments are not
 * registered yet and the Agent Builder attachments service falls back to its
 * default handling. In practice the chunk resolves well before the user can
 * post a message and get a rule attachment back from the LLM.
 */
export const registerRuleAttachment = ({
  attachments,
  application,
  aiRuleCreation,
  uiSettings,
}: {
  attachments: AttachmentServiceStartContract;
  application: ApplicationStart;
  aiRuleCreation: AiRuleCreationService;
  uiSettings: IUiSettingsClient;
}): void => {
  void import(
    /* webpackChunkName: "security_rule_attachment" */
    './rule'
  ).then(({ registerRuleAttachment: register }) => {
    register({ attachments, application, aiRuleCreation, uiSettings });
  });
};

/**
 * Wires save subscriptions for AI rule creation. Dynamically imports
 * {@link createAiRuleCreationHandler} so Detection Engine API clients, transforms, and Zod
 * schemas stay off the main `securitySolution` page-load bundle.
 *
 * Race-window: same semantics as {@link registerRuleAttachment} — resolves during plugin
 * start well before a user can save from chat.
 */
export const registerAiRuleCreationHandler = ({
  aiRuleCreation,
  notifications,
  agentBuilder,
  register,
}: {
  aiRuleCreation: AiRuleCreationService;
  notifications: NotificationsStart;
  agentBuilder?: AgentBuilderPluginStart;
  register: (subscription: Subscription) => void;
}): void => {
  void import(
    /* webpackChunkName: "security_ai_rule_creation_handler" */
    '../../detection_engine/common/ai_rule_creation_handler'
  ).then(({ createAiRuleCreationHandler }) => {
    register(createAiRuleCreationHandler({ aiRuleCreation, notifications, agentBuilder }));
  });
};

/**
 * Registers the `security.entity_analytics_dashboard` attachment renderer
 * (inline summary pill + Canvas dashboard with risk breakdown, donut chart,
 * and entity list). Dynamically imports
 * [./entity_analytics_dashboard_attachment](./entity_analytics_dashboard_attachment.tsx)
 * so the heavy transitive deps (`RiskLevelBreakdownTable`,
 * `RiskScoreDonutChart`, `EntityListTable`, plus the Security
 * entity-analytics translations/Redux wiring) stay off the main bundle.
 *
 * Race-window: same semantics as {@link registerRuleAttachment} — the chunk
 * resolves during plugin start well before the user can receive a dashboard
 * attachment from the LLM.
 */
export const registerEntityAnalyticsDashboardAttachment = ({
  attachments,
  application,
  agentBuilder,
  chrome,
  searchSession,
}: {
  attachments: AttachmentServiceStartContract;
  application: ApplicationStart;
  agentBuilder?: AgentBuilderPluginStart;
  chrome?: SecurityAgentBuilderChrome;
  searchSession?: ISessionService;
}): void => {
  void import(
    /* webpackChunkName: "security_entity_analytics_dashboard_attachment" */
    './entity_analytics_dashboard_attachment'
  ).then(({ registerEntityAnalyticsDashboardAttachment: register }) => {
    register({ attachments, application, agentBuilder, chrome, searchSession });
  });
};

/**
 * Registers the `security.rulePreview` attachment renderer (inline alert table showing
 * preview results). Dynamically imports {@link ./rule_preview_attachment} so the heavy
 * transitive deps (SecuritySolutionFlyout, RulePreviewAlertsTable, sourcerer, etc.)
 * stay off the main `securitySolution` page-load bundle.
 */
export const registerRulePreviewAttachment = ({
  attachments,
  data,
  spaces,
  getServices,
  getStore,
}: {
  attachments: AttachmentServiceStartContract;
  data: DataPublicPluginStart;
  spaces: SpacesPluginStart;
  getServices: () => Promise<StartServices>;
  getStore: () => Promise<SecurityAppStore>;
}): void => {
  void import(
    /* webpackChunkName: "security_rule_preview_attachment" */
    './rule_preview'
  ).then(({ registerRulePreviewAttachment: register }) => {
    register({ attachments, data, spaces, getServices, getStore });
  });
};
