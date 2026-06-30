/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ActionTypeRegistryContract } from '@kbn/triggers-actions-ui-plugin/public';
import { AddRuleAttachmentToChatButton } from './add_rule_attachment_to_chat_button';
import type { NewAgentBuilderAttachmentProps } from '../../../../agent_builder/components/new_agent_builder_attachment';
import type { UseAgentBuilderAttachmentParams } from '../../../../agent_builder/hooks/use_agent_builder_attachment';
import {
  SecurityAgentBuilderAttachments,
  SECURITY_RULE_ATTACHMENT_ID,
} from '../../../../../common/constants';
import type {
  AboutStepRule,
  ActionsStepRule,
  DefineStepRule,
  ScheduleStepRule,
} from '../../../common/types';
import type { RuleResponse } from '../../../../../common/api/detection_engine';
import { useKibana } from '../../../../common/lib/kibana';

const mockOpenAgentBuilderFlyout = jest.fn();
const mockUseAgentBuilderAttachment = jest.fn();
const mockFormatRule = jest.fn();
const mockNewAgentBuilderAttachment = jest.fn();
const mockActivateFormSync = jest.fn();
const mockReleaseBind = jest.fn();

const getCapturedAttachment = (): UseAgentBuilderAttachmentParams => {
  const [attachment] = mockUseAgentBuilderAttachment.mock.calls[0] as [
    UseAgentBuilderAttachmentParams
  ];
  return attachment;
};

const ruleResponseMock = { id: 'rule-123', name: 'My Rule' } as RuleResponse;
const defineStepDataMock = {} as DefineStepRule;
const aboutStepDataMock = {} as AboutStepRule;
const scheduleStepDataMock = {} as ScheduleStepRule;
const actionsStepDataMock = {} as ActionsStepRule;
const actionTypeRegistryMock = {} as ActionTypeRegistryContract;

jest.mock('../../../../common/lib/kibana');

const mockKibanaServices = () => ({
  services: {
    aiRuleCreation: {
      activateFormSync: mockActivateFormSync,
      releaseBind: mockReleaseBind,
    },
    agentBuilder: undefined,
  },
});

jest.mock('../../../../agent_builder/hooks/use_agent_builder_attachment', () => ({
  useAgentBuilderAttachment: (attachment: unknown) => {
    mockUseAgentBuilderAttachment(attachment);
    return { openAgentBuilderFlyout: mockOpenAgentBuilderFlyout };
  },
}));

jest.mock('../../../../agent_builder/components/new_agent_builder_attachment', () => ({
  NewAgentBuilderAttachment: (props: NewAgentBuilderAttachmentProps) => {
    mockNewAgentBuilderAttachment(props);
    return (
      <button type="button" data-test-subj="newAgentBuilderAttachmentMock" onClick={props.onClick}>
        {props.telemetry?.pathway ?? 'no-pathway'}
      </button>
    );
  },
}));

jest.mock('../../pages/rule_creation/helpers', () => ({
  formatRule: (...args: unknown[]) => mockFormatRule(...args),
}));

describe('AddRuleAttachmentToChatButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useKibana as jest.Mock).mockReturnValue(mockKibanaServices());
  });

  it('attaches a saved rule with data and origin so the card renders and shows Update', () => {
    render(<AddRuleAttachmentToChatButton rule={ruleResponseMock} pathway="rule_details" />);

    const attachment = getCapturedAttachment();
    expect(attachment.attachmentType).toBe(SecurityAgentBuilderAttachments.rule);
    // origin set → card shows "Update Rule"
    expect(attachment.origin).toBe(ruleResponseMock.id);
    // data included → card renders immediately without waiting for server resolve
    expect(attachment.attachmentData?.text).toBe(JSON.stringify(ruleResponseMock));
    expect(attachment.attachmentData?.attachmentLabel).toBe('My Rule');
    expect(attachment.attachmentDescription).toBe('My Rule');
    const newAttachmentProps = mockNewAgentBuilderAttachment.mock.calls[0][0];
    expect(newAttachmentProps.telemetry?.pathway).toBe('rule_details');
    expect(newAttachmentProps.telemetry?.attachments).toEqual(['rule']);
  });

  it('formats rule from form state when form props are provided', async () => {
    const user = userEvent.setup();

    mockFormatRule.mockReturnValue({ name: 'Formatted Rule' });

    render(
      <AddRuleAttachmentToChatButton
        defineStepData={defineStepDataMock}
        aboutStepData={aboutStepDataMock}
        scheduleStepData={scheduleStepDataMock}
        actionsStepData={actionsStepDataMock}
        actionTypeRegistry={actionTypeRegistryMock}
        pathway="rule_editing"
      />
    );

    expect(mockUseAgentBuilderAttachment).toHaveBeenCalledTimes(1);
    expect(getCapturedAttachment()).toEqual<UseAgentBuilderAttachmentParams>({
      attachmentId: SECURITY_RULE_ATTACHMENT_ID,
      attachmentType: SecurityAgentBuilderAttachments.rule,
      attachmentData: {
        text: JSON.stringify({ name: 'Formatted Rule' }),
        attachmentLabel: 'Formatted Rule',
      },
      attachmentDescription: 'Formatted Rule',
    });

    await user.click(screen.getByTestId('newAgentBuilderAttachmentMock'));
    expect(mockOpenAgentBuilderFlyout).toHaveBeenCalledTimes(1);
  });
});
