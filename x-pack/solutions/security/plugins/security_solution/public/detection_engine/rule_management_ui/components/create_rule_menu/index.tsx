/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { EuiTourStepProps } from '@elastic/eui';
import {
  EuiBadge,
  EuiButton,
  EuiPopover,
  EuiContextMenuItem,
  useGeneratedHtmlId,
  EuiContextMenuPanel,
  EuiText,
  EuiTourStep,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { AttachmentInput } from '@kbn/agent-builder-common/attachments';
import { SecurityPageName } from '../../../../app/types';
import { SecuritySolutionLinkAnchor } from '../../../../common/components/links';
import { useKibana } from '../../../../common/lib/kibana';
import { RuleCreationEventTypes } from '../../../../common/lib/telemetry/types';
import {
  NEW_FEATURES_TOUR_STORAGE_KEYS,
  SecurityAgentBuilderAttachments,
  SECURITY_RULE_ATTACHMENT_ID,
} from '../../../../../common/constants';

interface CreateRuleContextMenuProps {
  loading: boolean;
  isDisabled?: boolean;
}

/**
 * Alternative implementation using SecuritySolutionLinkButton components
 * for better integration with existing routing
 */
const AI_RULE_CREATION_INITIAL_MESSAGE = `Create ES|QL SIEM detection rule (name, description, data sources, detection logic, severity, risk score, schedule, tags, and MITRE ATT&CK mappings) using dedicated detection rule creation tool. Always render inline the latest version of the rule attachment.

You can review and edit everything before enabling the rule. 
Desired behavior or activity to detect:

==== YOUR DESCRIPTION HERE====
`;

const AI_RULE_CREATION_MENU_TOUR_SUBTITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.aiRuleCreationTour.subtitle',
  {
    defaultMessage: 'Security AI agent',
  }
);

const AI_RULE_CREATION_MENU_TOUR_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.aiRuleCreationTour.title',
  {
    defaultMessage: 'ES|QL detection rules',
  }
);

const AI_RULE_CREATION_MENU_TOUR_FINISH = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.aiRuleCreationTour.finishButton',
  {
    defaultMessage: 'Got it',
  }
);

const RULE_CREATION_POPOVER_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.createRule.ariaLabel',
  {
    defaultMessage:
      'Create a rule either using the agent or manually using the rule creation form ',
  }
);

const AI_RULE_CREATION_MENU_TOUR_INITIAL_STATE = {
  currentTourStep: 1,
  isTourActive: true,
  tourPopoverWidth: 400,
  tourSubtitle: '',
};

type AiRuleCreationMenuTourState = typeof AI_RULE_CREATION_MENU_TOUR_INITIAL_STATE;

export const CreateRuleMenu: React.FC<CreateRuleContextMenuProps> = ({ loading, isDisabled }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const contextMenuPopoverId = useGeneratedHtmlId({
    prefix: 'createRuleContextMenuLinks',
  });
  const { services } = useKibana();
  const { agentBuilder, storage, notifications, telemetry, aiRuleCreation, http, application } =
    services;
  const isTourEnabled = notifications.tours.isEnabled();

  const [aiRuleCreationMenuTourState, setAiRuleCreationMenuTourState] =
    useState<AiRuleCreationMenuTourState>(() => {
      const stored = storage.get(NEW_FEATURES_TOUR_STORAGE_KEYS.AI_RULE_CREATION_MENU) as
        | Partial<AiRuleCreationMenuTourState>
        | undefined;
      return stored
        ? { ...AI_RULE_CREATION_MENU_TOUR_INITIAL_STATE, ...stored }
        : AI_RULE_CREATION_MENU_TOUR_INITIAL_STATE;
    });

  useEffect(() => {
    storage.set(NEW_FEATURES_TOUR_STORAGE_KEYS.AI_RULE_CREATION_MENU, aiRuleCreationMenuTourState);
  }, [storage, aiRuleCreationMenuTourState]);

  const dismissAiRuleCreationMenuTour = useCallback(() => {
    setAiRuleCreationMenuTourState((prev: AiRuleCreationMenuTourState) => ({
      ...prev,
      isTourActive: false,
    }));
  }, []);

  const shouldShowAiRuleCreationMenuTour =
    isTourEnabled && aiRuleCreationMenuTourState.isTourActive && !isDisabled && !loading;

  const onButtonClick = useCallback(() => {
    setIsPopoverOpen(!isPopoverOpen);
  }, [isPopoverOpen]);

  const closePopover = useCallback(() => {
    setIsPopoverOpen(false);
  }, []);

  const handleV2RuleCreation = useCallback(() => {
    closePopover();
    const url = http.basePath.prepend('/app/security/rules_v2/create?returnTo=rules');
    application.navigateToUrl(url);
  }, [closePopover, http.basePath, application]);

  const handleAiRuleCreation = useCallback(() => {
    closePopover();

    const session = aiRuleCreation.startSession();
    telemetry.reportEvent(RuleCreationEventTypes.CreationInitialized, {
      creationSource: 'ai',
      sessionId: session.sessionId,
    });

    const emptyRuleAttachment: AttachmentInput = {
      id: SECURITY_RULE_ATTACHMENT_ID,
      type: SecurityAgentBuilderAttachments.rule,
      data: {
        text: JSON.stringify({}),
        attachmentLabel: 'New Rule',
      },
    };

    if (agentBuilder?.openChat) {
      agentBuilder.openChat({
        newConversation: true,
        initialMessage: AI_RULE_CREATION_INITIAL_MESSAGE,
        autoSendInitialMessage: false,
        sessionTag: 'security',
        attachments: [emptyRuleAttachment],
      });
    }
  }, [closePopover, agentBuilder, aiRuleCreation, telemetry]);

  const createRuleButton = (
    <EuiButton
      iconType="chevronSingleDown"
      iconSide="right"
      onClick={onButtonClick}
      fill
      isDisabled={isDisabled}
      isLoading={loading}
      data-test-subj={`create-rule-button`}
    >
      <FormattedMessage
        id="xpack.securitySolution.detectionEngine.createRule.contextMenu.buttonLabel"
        defaultMessage="Create a rule"
      />
    </EuiButton>
  );

  return (
    <>
      {shouldShowAiRuleCreationMenuTour ? (
        <EuiTourStep
          anchor={`[data-test-subj=create-rule-button]`}
          anchorPosition={'downCenter' as EuiTourStepProps['anchorPosition']}
          content={
            <EuiText size="s">
              <p>
                <FormattedMessage
                  id="xpack.securitySolution.detectionEngine.createRule.aiRuleCreationTour.description"
                  defaultMessage="Use {createRule} here to open the menu, then choose {aiRuleCreation} to start the security AI agent. A dedicated skill helps you create and edit ES|QL SIEM detection rules—including query logic, severity, risk score, schedule, tags, and MITRE ATT&CK mappings—and review everything before you enable the rule."
                  values={{
                    createRule: (
                      <strong>
                        <FormattedMessage
                          id="xpack.securitySolution.detectionEngine.createRule.aiRuleCreationTour.createRuleLabel"
                          defaultMessage="Create a rule"
                        />
                      </strong>
                    ),
                    aiRuleCreation: (
                      <strong>
                        <FormattedMessage
                          id="xpack.securitySolution.detectionEngine.createRule.aiRuleCreationTour.aiRuleCreationLabel"
                          defaultMessage="AI rule creation"
                        />
                      </strong>
                    ),
                  }}
                />
              </p>
            </EuiText>
          }
          data-test-subj="ai-rule-creation-menu-tour"
          isStepOpen={
            aiRuleCreationMenuTourState.isTourActive &&
            aiRuleCreationMenuTourState.currentTourStep === 1
          }
          minWidth={aiRuleCreationMenuTourState.tourPopoverWidth}
          onFinish={dismissAiRuleCreationMenuTour}
          step={1}
          stepsTotal={1}
          subtitle={AI_RULE_CREATION_MENU_TOUR_SUBTITLE}
          title={AI_RULE_CREATION_MENU_TOUR_TITLE}
          footerAction={
            <EuiButton color="success" size="s" onClick={dismissAiRuleCreationMenuTour}>
              {AI_RULE_CREATION_MENU_TOUR_FINISH}
            </EuiButton>
          }
        />
      ) : null}
      <EuiPopover
        id={contextMenuPopoverId}
        aria-label={RULE_CREATION_POPOVER_ARIA_LABEL}
        button={createRuleButton}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        anchorPosition="downLeft"
        data-test-subj={'create-rule-context-menu-popover'}
      >
        <EuiContextMenuPanel>
          <EuiContextMenuItem
            key="ai-rule-creation"
            onClick={handleAiRuleCreation}
            data-test-subj="ai-rule-creation"
            icon="productAgent"
          >
            <FormattedMessage
              id="xpack.securitySolution.detectionEngine.createRule.contextMenu.aiRuleCreation"
              defaultMessage="AI rule creation"
            />
          </EuiContextMenuItem>
          <EuiContextMenuItem key="manual-rule-creation">
            <SecuritySolutionLinkAnchor
              deepLinkId={SecurityPageName.rulesCreate}
              data-test-subj="manual-rule-creation"
              color="text"
            >
              <FormattedMessage
                id="xpack.securitySolution.detectionEngine.createRule.contextMenu.manual"
                defaultMessage="Manual rule creation"
              />
            </SecuritySolutionLinkAnchor>
          </EuiContextMenuItem>
          <EuiContextMenuItem
            key="v2-rule-creation"
            onClick={handleV2RuleCreation}
            data-test-subj="v2-rule-creation"
            icon="beaker"
          >
            <FormattedMessage
              id="xpack.securitySolution.detectionEngine.createRule.contextMenu.v2RuleCreation"
              defaultMessage="Create v2 rule"
            />{' '}
            <EuiBadge color="primary">{'New'}</EuiBadge>
          </EuiContextMenuItem>
        </EuiContextMenuPanel>
      </EuiPopover>
    </>
  );
};
