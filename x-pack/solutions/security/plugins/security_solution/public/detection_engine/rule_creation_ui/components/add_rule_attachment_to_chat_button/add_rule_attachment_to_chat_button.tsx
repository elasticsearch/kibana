/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { ActionTypeRegistryContract } from '@kbn/triggers-actions-ui-plugin/public';
import type { RuleCreateProps } from '../../../../../common/api/detection_engine/model/rule_schema';
import type { RuleResponse } from '../../../../../common/api/detection_engine';
import type {
  AboutStepRule,
  ActionsStepRule,
  DefineStepRule,
  ScheduleStepRule,
} from '../../../common/types';
import { useAgentBuilderAttachment } from '../../../../agent_builder/hooks/use_agent_builder_attachment';
import {
  SecurityAgentBuilderAttachments,
  SECURITY_RULE_ATTACHMENT_ID,
} from '../../../../../common/constants';
import { NewAgentBuilderAttachment } from '../../../../agent_builder/components/new_agent_builder_attachment';
import type { AgentBuilderAddToChatTelemetry } from '../../../../agent_builder/hooks/use_report_add_to_chat';
import { formatRule } from '../../pages/rule_creation/helpers';
import { useKibana } from '../../../../common/lib/kibana';

interface AddRuleAttachmentFromFormProps {
  defineStepData: DefineStepRule;
  aboutStepData: AboutStepRule;
  scheduleStepData: ScheduleStepRule;
  actionsStepData: ActionsStepRule;
  actionTypeRegistry: ActionTypeRegistryContract;
  /** Existing rule id — marks the attachment as an 'update' linked to this rule so chat shows "Update rule". */
  existingRuleId?: string;
  rule?: never;
}

interface AddRuleAttachmentFromRuleResponseProps {
  rule: RuleResponse;
  defineStepData?: never;
  aboutStepData?: never;
  scheduleStepData?: never;
  actionsStepData?: never;
  actionTypeRegistry?: never;
  existingRuleId?: never;
}

export type AddRuleAttachmentToChatButtonProps = (
  | AddRuleAttachmentFromFormProps
  | AddRuleAttachmentFromRuleResponseProps
) & {
  pathway: AgentBuilderAddToChatTelemetry['pathway'];
  /** When true the button is rendered but non-interactive (e.g. non-ES|QL rule type selected). */
  disabled?: boolean;
  /** Tooltip shown when the button is disabled. */
  disabledTooltip?: string;
};

export const AddRuleAttachmentToChatButton: React.FC<AddRuleAttachmentToChatButtonProps> = ({
  pathway,
  disabled,
  disabledTooltip,
  ...props
}) => {
  const { services } = useKibana();
  const { aiRuleCreation } = services;
  const {
    defineStepData,
    aboutStepData,
    scheduleStepData,
    actionsStepData,
    actionTypeRegistry,
    existingRuleId,
    rule,
  } = props;

  const isFormBased =
    defineStepData != null &&
    aboutStepData != null &&
    scheduleStepData != null &&
    actionsStepData != null &&
    actionTypeRegistry != null;

  const ruleAttachment = useMemo(() => {
    let formattedRule: RuleCreateProps | RuleResponse | null | undefined;
    if (isFormBased) {
      const fromForm = formatRule<RuleCreateProps>(
        defineStepData,
        aboutStepData,
        scheduleStepData,
        actionsStepData,
        actionTypeRegistry
      );
      formattedRule = existingRuleId ? { ...fromForm, id: existingRuleId } : fromForm;
    } else {
      formattedRule = rule;
    }
    const attachmentLabel =
      formattedRule?.name ||
      (isFormBased && !existingRuleId
        ? i18n.translate(
            'xpack.securitySolution.detectionEngine.createRule.aiRuleCreationAttachmentLabel',
            { defaultMessage: 'New Rule' }
          )
        : undefined);
    const linkedRuleId = rule?.id ?? existingRuleId;

    // Rule-details / flyout pathway (a saved RuleResponse, no live form): include data so the card
    // renders immediately, and set `origin` so the card reads "Update" and save targets the live rule.
    if (!isFormBased && linkedRuleId) {
      return {
        attachmentId: SECURITY_RULE_ATTACHMENT_ID,
        attachmentType: SecurityAgentBuilderAttachments.rule,
        attachmentData: {
          text: JSON.stringify(formattedRule),
          attachmentLabel,
        },
        origin: linkedRuleId,
        attachmentDescription: attachmentLabel,
      };
    }

    // Form pathway: attach the on-screen rule by value so unsaved form edits are reflected and
    // form sync keeps pushing into the same card. When editing a saved rule, also set `origin`
    // (the saved id) so the card reads "Update"; a brand-new rule has no origin ⇒ "Create".
    return {
      attachmentId: SECURITY_RULE_ATTACHMENT_ID,
      attachmentType: SecurityAgentBuilderAttachments.rule,
      attachmentData: {
        text: JSON.stringify(formattedRule),
        attachmentLabel,
      },
      ...(linkedRuleId ? { origin: linkedRuleId } : {}),
      attachmentDescription: attachmentLabel,
    };
  }, [
    isFormBased,
    defineStepData,
    aboutStepData,
    scheduleStepData,
    actionsStepData,
    actionTypeRegistry,
    existingRuleId,
    rule,
  ]);

  const { openAgentBuilderFlyout } = useAgentBuilderAttachment(ruleAttachment);

  const handleClick = useCallback(() => {
    if (isFormBased) {
      aiRuleCreation.activateFormSync();
    }
    aiRuleCreation.releaseBind();
    openAgentBuilderFlyout();
  }, [isFormBased, aiRuleCreation, openAgentBuilderFlyout]);

  return (
    <NewAgentBuilderAttachment
      onClick={handleClick}
      disabled={disabled}
      disabledTooltip={disabledTooltip}
      telemetry={{
        pathway,
        attachments: ['rule'],
      }}
      size="s"
    />
  );
};
