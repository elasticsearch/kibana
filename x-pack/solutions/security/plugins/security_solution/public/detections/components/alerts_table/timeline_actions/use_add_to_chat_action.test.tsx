/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useAddToChatAction } from './use_add_to_chat_action';
import { TestProviders } from '../../../../common/mock';
import { useAgentBuilderAvailability } from '../../../../agent_builder/hooks/use_agent_builder_availability';
import { useAgentBuilderAttachment } from '../../../../agent_builder/hooks/use_agent_builder_attachment';
import { useReportAddToChat } from '../../../../agent_builder/hooks/use_report_add_to_chat';

jest.mock('../../../../agent_builder/hooks/use_agent_builder_availability');
jest.mock('../../../../agent_builder/hooks/use_agent_builder_attachment');
jest.mock('../../../../agent_builder/hooks/use_report_add_to_chat');

const mockOpenAgentBuilderFlyout = jest.fn();
const mockReportAddToChat = jest.fn();

const defaultAvailability = {
  isAgentBuilderEnabled: true,
  hasAgentBuilderPrivilege: true,
  isAgentChatExperienceEnabled: true,
  hasValidAgentBuilderLicense: true,
};

const defaultProps = {
  ecsData: [
    { field: 'kibana.alert.rule.name', value: ['Test Rule'] },
    { field: 'kibana.alert.rule.uuid', value: ['rule-id-1'] },
  ],
  onMenuItemClick: jest.fn(),
  alertId: 'alert-id-1',
};

describe('useAddToChatAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAgentBuilderAvailability as jest.Mock).mockReturnValue(defaultAvailability);
    (useAgentBuilderAttachment as jest.Mock).mockReturnValue({
      openAgentBuilderFlyout: mockOpenAgentBuilderFlyout,
    });
    (useReportAddToChat as jest.Mock).mockReturnValue(mockReportAddToChat);
  });

  it('returns an "Add to chat" menu item when agent builder is enabled', () => {
    const { result } = renderHook(() => useAddToChatAction(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.addToChatActionItems).toHaveLength(1);
    expect(result.current.addToChatActionItems[0]['data-test-subj']).toBe('add-to-chat-action');
  });

  it('returns an empty array when agent builder is disabled', () => {
    (useAgentBuilderAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailability,
      isAgentBuilderEnabled: false,
    });

    const { result } = renderHook(() => useAddToChatAction(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.addToChatActionItems).toHaveLength(0);
  });

  it('disables the menu item when the user lacks a valid license', () => {
    (useAgentBuilderAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailability,
      hasValidAgentBuilderLicense: false,
    });

    const { result } = renderHook(() => useAddToChatAction(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.addToChatActionItems[0].disabled).toBe(true);
  });

  it('calls openAgentBuilderFlyout, reportAddToChat, and onMenuItemClick when the item is clicked', () => {
    const onMenuItemClick = jest.fn();
    const { result } = renderHook(() => useAddToChatAction({ ...defaultProps, onMenuItemClick }), {
      wrapper: TestProviders,
    });

    const item = result.current.addToChatActionItems[0];
    (item.onClick as () => void)();

    expect(mockReportAddToChat).toHaveBeenCalledWith({
      pathway: 'alerts_flyout',
      attachments: ['alert'],
    });
    expect(mockOpenAgentBuilderFlyout).toHaveBeenCalled();
    expect(onMenuItemClick).toHaveBeenCalled();
  });
});
