/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { type ActionButton, ActionButtonType } from '@kbn/agent-builder-browser/attachments';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import { RULES_UI_EDIT_PRIVILEGE } from '@kbn/security-solution-features/constants';
import type { AiRuleCreationService } from '../../../detection_engine/common/ai_rule_creation_store';
import { hasCapabilities } from '../../../common/lib/capabilities';
import { RULES_PATH, RULES_CREATE_PATH } from '../../../../common/constants';
import {
  getEditRuleUrl,
  getRuleDetailsUrl,
} from '../../../common/components/link_to/redirect_to_detection_engine';
import { type RuleAttachmentIntent, getRuleTypeLabel } from './helpers';
import type { RuleResponse } from '../../../../common/api/detection_engine/model/rule_schema';
import { getNonEsqlRuleActionDisabledReason } from '../../components/translations';

interface BuildRuleActionButtonsParams {
  rule: RuleResponse | null;
  aiRuleCreation: AiRuleCreationService;
  application: ApplicationStart;
  uiSettings: IUiSettingsClient;
  /** Drives the primary button label: 'create' stays "Create rule", 'update' becomes "Update rule". */
  intent: RuleAttachmentIntent;
  /** Saved-rule id — PATCH target for update-intent saves and "View rule" link. */
  ruleId: string | undefined;
  /** The attachment card id — threaded into save requests and "Open in form" for per-card targeting. */
  attachmentId: string;
  /** Whether to show a "View rule" link — true when the rule is saved and not already being viewed. */
  showViewRule: boolean;
  /**
   * Framework callback that links the attachment to its saved rule via `origin` and invalidates
   * the conversation so the card reflects the saved state in-session. Threaded into the save
   * request and called once the rule is persisted.
   */
  updateOrigin: (origin: string) => Promise<unknown>;
}

/** Builds action buttons for a rule attachment. Called from `getActionButtons` (not a hook). */
export const buildRuleActionButtons = ({
  rule,
  aiRuleCreation,
  application,
  uiSettings,
  intent,
  ruleId,
  attachmentId,
  showViewRule,
  updateOrigin,
}: BuildRuleActionButtonsParams): ActionButton[] => {
  const canEditRules = hasCapabilities(application.capabilities, RULES_UI_EDIT_PRIVILEGE);
  if (!rule || !canEditRules || (rule.type === 'esql' && !uiSettings.get(ENABLE_ESQL))) {
    return [];
  }

  const isUpdate = intent === 'update';
  const isEsql = rule.type === 'esql';
  const disabledReason = isEsql
    ? undefined
    : getNonEsqlRuleActionDisabledReason(getRuleTypeLabel(rule.type));

  const buttons: ActionButton[] = [
    {
      label: i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.openInForm', {
        defaultMessage: 'Preview before saving',
      }),
      icon: 'pencil',
      type: ActionButtonType.SECONDARY,
      handler: () => {
        aiRuleCreation.setAiCreatedRule(rule, attachmentId);
        application.navigateToApp('securitySolutionUI', {
          path: isUpdate && ruleId ? `${RULES_PATH}${getEditRuleUrl(ruleId)}` : RULES_CREATE_PATH,
        });
      },
    },
    ...(showViewRule && ruleId
      ? [
          {
            label: i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.viewRule', {
              defaultMessage: 'View rule',
            }),
            icon: 'popout' as const,
            type: ActionButtonType.SECONDARY,
            handler: () => {
              application.navigateToApp('securitySolutionUI', {
                path: `${RULES_PATH}${getRuleDetailsUrl(ruleId)}`,
              });
            },
          },
        ]
      : []),
    isUpdate
      ? {
          label: i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.updateRule', {
            defaultMessage: 'Update rule',
          }),
          icon: 'save',
          type: ActionButtonType.PRIMARY,
          disabled: !isEsql,
          disabledReason,
          handler: () => {
            // getActionButtons is not reactive to saving$, so guard against double-submit here.
            if (aiRuleCreation.getIsSaving(attachmentId)) {
              return;
            }
            aiRuleCreation.requestSaveRule(
              { ...rule, id: ruleId ?? rule.id },
              { attachmentId, updateOrigin }
            );
          },
        }
      : {
          label: i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.createRule', {
            defaultMessage: 'Create rule',
          }),
          icon: 'plusInCircle',
          type: ActionButtonType.PRIMARY,
          disabled: !isEsql,
          disabledReason,
          handler: () => {
            if (aiRuleCreation.getIsSaving(attachmentId)) {
              return;
            }
            const { id: _id, ...ruleWithoutId } = rule as RuleResponse & { id?: string };
            aiRuleCreation.requestSaveRule(ruleWithoutId as RuleResponse, {
              attachmentId,
              updateOrigin,
            });
          },
        },
  ];
  return buttons;
};
