/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { waitForEuiPopoverOpen, screen } from '@elastic/eui/lib/test/rtl';
import { waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/testing/rtl_helpers';
import { ToggleAlertFlyoutButton } from './toggle_alert_flyout_button';
import { makeSyntheticsPermissionsCore } from '../../utils/testing/rtl_helpers';

jest.mock('./hooks/use_synthetics_rules', () => ({
  useSyntheticsRules: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const useSyntheticsRulesModule = require('./hooks/use_synthetics_rules');
const mockUseSyntheticsRules = useSyntheticsRulesModule.useSyntheticsRules as jest.MockedFunction<
  typeof useSyntheticsRulesModule.useSyntheticsRules
>;

describe('ToggleAlertFlyoutButton', () => {
  const baseMockState = {
    defaultAlerting: {
      data: {
        statusRule: { id: 'status-rule-1', name: 'Status Rule' },
        tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
      },
      loading: false,
      success: true,
    },
    ui: {
      ruleFlyoutVisible: null,
      isNewRuleFlyout: false,
    },
    monitorList: {
      loaded: true,
      data: {
        absoluteTotal: 5,
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSyntheticsRules.mockReturnValue({
      loading: false,
      EditAlertFlyout: null,
      NewRuleFlyout: null,
      defaultRules: {
        statusRule: { id: 'status-rule-1', name: 'Status Rule' },
        tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
      },
    });
  });

  it('disables edit status rule button when status rule does not exist', async () => {
    mockUseSyntheticsRules.mockReturnValue({
      loading: false,
      EditAlertFlyout: null,
      NewRuleFlyout: null,
      defaultRules: {
        statusRule: null,
        tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
      },
    });

    const user = userEvent.setup();
    render(<ToggleAlertFlyoutButton />, {
      state: baseMockState,
      core: makeSyntheticsPermissionsCore({ save: true }),
    });

    // Open the popover
    const button = screen.getByTestId('syntheticsAlertsRulesButton');
    await user.click(button);
    await waitForEuiPopoverOpen();

    // Navigate to status rule panel
    const statusRuleMenuItem = screen.getByTestId('manageStatusRuleName');
    await user.click(statusRuleMenuItem);

    // Wait for the panel to navigate and check that edit status rule button is disabled
    const editStatusRuleButton = await waitFor(() => screen.getByTestId('editDefaultStatusRule'));
    expect(editStatusRuleButton).toHaveAttribute('disabled');
  });

  it('disables edit TLS rule button when TLS rule does not exist', async () => {
    mockUseSyntheticsRules.mockReturnValue({
      loading: false,
      EditAlertFlyout: null,
      NewRuleFlyout: null,
      defaultRules: {
        statusRule: { id: 'status-rule-1', name: 'Status Rule' },
        tlsRule: null,
      },
    });

    const user = userEvent.setup();
    render(<ToggleAlertFlyoutButton />, {
      state: baseMockState,
      core: makeSyntheticsPermissionsCore({ save: true }),
    });

    // Open the popover
    const button = screen.getByTestId('syntheticsAlertsRulesButton');
    await user.click(button);
    await waitForEuiPopoverOpen();

    // Navigate to TLS rule panel
    const tlsRuleMenuItem = screen.getByTestId('manageTlsRuleName');
    await user.click(tlsRuleMenuItem);

    // Wait for the panel to navigate and check that edit TLS rule button is disabled
    const editTlsRuleButton = await waitFor(() => screen.getByTestId('editDefaultTlsRule'));
    expect(editTlsRuleButton).toHaveAttribute('disabled');
  });

  it('disables edit status rule button when both rules do not exist', async () => {
    mockUseSyntheticsRules.mockReturnValue({
      loading: false,
      EditAlertFlyout: null,
      NewRuleFlyout: null,
      defaultRules: {
        statusRule: null,
        tlsRule: null,
      },
    });

    const user = userEvent.setup();
    render(<ToggleAlertFlyoutButton />, {
      state: baseMockState,
      core: makeSyntheticsPermissionsCore({ save: true }),
    });

    // Open the popover and check status rule panel
    const button = screen.getByTestId('syntheticsAlertsRulesButton');
    await user.click(button);
    await waitForEuiPopoverOpen();

    const statusRuleMenuItem = screen.getByTestId('manageStatusRuleName');
    await user.click(statusRuleMenuItem);
    const editStatusRuleButton = await waitFor(() => screen.getByTestId('editDefaultStatusRule'));
    expect(editStatusRuleButton).toHaveAttribute('disabled');
  });

  it('disables edit TLS rule button when both rules do not exist', async () => {
    mockUseSyntheticsRules.mockReturnValue({
      loading: false,
      EditAlertFlyout: null,
      NewRuleFlyout: null,
      defaultRules: {
        statusRule: null,
        tlsRule: null,
      },
    });

    const user = userEvent.setup();
    render(<ToggleAlertFlyoutButton />, {
      state: baseMockState,
      core: makeSyntheticsPermissionsCore({ save: true }),
    });

    // Open the popover and check TLS rule panel
    const button = screen.getByTestId('syntheticsAlertsRulesButton');
    await user.click(button);
    await waitForEuiPopoverOpen();

    const tlsRuleMenuItem = screen.getByTestId('manageTlsRuleName');
    await user.click(tlsRuleMenuItem);
    const editTlsRuleButton = await waitFor(() => screen.getByTestId('editDefaultTlsRule'));
    expect(editTlsRuleButton).toHaveAttribute('disabled');
  });

  it('enables edit status rule button when status rule exists and user has write permissions', async () => {
    mockUseSyntheticsRules.mockReturnValue({
      loading: false,
      EditAlertFlyout: null,
      NewRuleFlyout: null,
      defaultRules: {
        statusRule: { id: 'status-rule-1', name: 'Status Rule' },
        tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
      },
    });

    const user = userEvent.setup();
    render(<ToggleAlertFlyoutButton />, {
      state: baseMockState,
      core: makeSyntheticsPermissionsCore({ save: true }),
    });

    // Open the popover
    const button = screen.getByTestId('syntheticsAlertsRulesButton');
    await user.click(button);
    await waitForEuiPopoverOpen();

    // Check status rule panel
    const statusRuleMenuItem = screen.getByTestId('manageStatusRuleName');
    await user.click(statusRuleMenuItem);
    const editStatusRuleButton = await waitFor(() => screen.getByTestId('editDefaultStatusRule'));
    expect(editStatusRuleButton).not.toHaveAttribute('disabled');
  });

  it('enables edit TLS rule button when TLS rule exists and user has write permissions', async () => {
    mockUseSyntheticsRules.mockReturnValue({
      loading: false,
      EditAlertFlyout: null,
      NewRuleFlyout: null,
      defaultRules: {
        statusRule: { id: 'status-rule-1', name: 'Status Rule' },
        tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
      },
    });

    const user = userEvent.setup();
    render(<ToggleAlertFlyoutButton />, {
      state: baseMockState,
      core: makeSyntheticsPermissionsCore({ save: true }),
    });

    // Open the popover
    const button = screen.getByTestId('syntheticsAlertsRulesButton');
    await user.click(button);
    await waitForEuiPopoverOpen();

    // Check TLS rule panel
    const tlsRuleMenuItem = screen.getByTestId('manageTlsRuleName');
    await user.click(tlsRuleMenuItem);
    const editTlsRuleButton = await waitFor(() => screen.getByTestId('editDefaultTlsRule'));
    expect(editTlsRuleButton).not.toHaveAttribute('disabled');
  });

  it('enables edit status rule when the user has canManageRules but not save', async () => {
    const user = userEvent.setup();
    render(<ToggleAlertFlyoutButton />, {
      state: baseMockState,
      core: makeSyntheticsPermissionsCore({ save: false, canManageRules: true }),
    });

    const button = screen.getByTestId('syntheticsAlertsRulesButton');
    await user.click(button);
    await waitForEuiPopoverOpen();

    const statusRuleMenuItem = screen.getByTestId('manageStatusRuleName');
    await user.click(statusRuleMenuItem);
    const editStatusRuleButton = await waitFor(() => screen.getByTestId('editDefaultStatusRule'));
    expect(editStatusRuleButton).not.toHaveAttribute('disabled');
  });

  describe('tooltip content', () => {
    it('shows no permissions tooltip for status rule when user does not have write permissions', async () => {
      mockUseSyntheticsRules.mockReturnValue({
        loading: false,
        EditAlertFlyout: null,
        NewRuleFlyout: null,
        defaultRules: {
          statusRule: { id: 'status-rule-1', name: 'Status Rule' },
          tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
        },
      });

      const user = userEvent.setup();
      render(<ToggleAlertFlyoutButton />, {
        state: baseMockState,
        core: makeSyntheticsPermissionsCore({ save: false }),
      });

      // Open the popover
      const button = screen.getByTestId('syntheticsAlertsRulesButton');
      await user.click(button);
      await waitForEuiPopoverOpen();

      // Navigate to status rule panel
      const statusRuleMenuItem = screen.getByTestId('manageStatusRuleName');
      await user.click(statusRuleMenuItem);

      // Wait for the panel and hover over the disabled button
      const editStatusRuleButton = await waitFor(() => screen.getByTestId('editDefaultStatusRule'));
      fireEvent.mouseOver(editStatusRuleButton);

      // Wait for tooltip to appear and check content
      await waitFor(() => {
        expect(
          screen.getByText('You do not have sufficient permissions to perform this action.')
        ).toBeInTheDocument();
      });
    });

    it('shows no permissions tooltip for TLS rule when user does not have write permissions', async () => {
      mockUseSyntheticsRules.mockReturnValue({
        loading: false,
        EditAlertFlyout: null,
        NewRuleFlyout: null,
        defaultRules: {
          statusRule: { id: 'status-rule-1', name: 'Status Rule' },
          tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
        },
      });

      const user = userEvent.setup();
      render(<ToggleAlertFlyoutButton />, {
        state: baseMockState,
        core: makeSyntheticsPermissionsCore({ save: false }),
      });

      // Open the popover
      const button = screen.getByTestId('syntheticsAlertsRulesButton');
      await user.click(button);
      await waitForEuiPopoverOpen();

      // Navigate to TLS rule panel
      const tlsRuleMenuItem = screen.getByTestId('manageTlsRuleName');
      await user.click(tlsRuleMenuItem);

      // Wait for the panel and hover over the disabled button
      const editTlsRuleButton = await waitFor(() => screen.getByTestId('editDefaultTlsRule'));
      fireEvent.mouseOver(editTlsRuleButton);

      // Wait for tooltip to appear and check content
      await waitFor(() => {
        expect(
          screen.getByText('You do not have sufficient permissions to perform this action.')
        ).toBeInTheDocument();
      });
    });

    it('shows status rule not available tooltip when user has permissions but status rule does not exist', async () => {
      mockUseSyntheticsRules.mockReturnValue({
        loading: false,
        EditAlertFlyout: null,
        NewRuleFlyout: null,
        defaultRules: {
          statusRule: null,
          tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
        },
      });

      const user = userEvent.setup();
      render(<ToggleAlertFlyoutButton />, {
        state: baseMockState,
        core: makeSyntheticsPermissionsCore({ save: true }),
      });

      // Open the popover
      const button = screen.getByTestId('syntheticsAlertsRulesButton');
      await user.click(button);
      await waitForEuiPopoverOpen();

      // Navigate to status rule panel
      const statusRuleMenuItem = screen.getByTestId('manageStatusRuleName');
      await user.click(statusRuleMenuItem);

      // Wait for the panel and hover over the disabled button
      const editStatusRuleButton = await waitFor(() => screen.getByTestId('editDefaultStatusRule'));
      fireEvent.mouseOver(editStatusRuleButton);

      // Wait for tooltip to appear and check content
      await waitFor(() => {
        expect(
          screen.getByText('Status rule does not exist. Create the rule before editing.')
        ).toBeInTheDocument();
      });
    });

    it('shows TLS rule not available tooltip when user has permissions but TLS rule does not exist', async () => {
      mockUseSyntheticsRules.mockReturnValue({
        loading: false,
        EditAlertFlyout: null,
        NewRuleFlyout: null,
        defaultRules: {
          statusRule: { id: 'status-rule-1', name: 'Status Rule' },
          tlsRule: null,
        },
      });

      const user = userEvent.setup();
      render(<ToggleAlertFlyoutButton />, {
        state: baseMockState,
        core: makeSyntheticsPermissionsCore({ save: true }),
      });

      // Open the popover
      const button = screen.getByTestId('syntheticsAlertsRulesButton');
      await user.click(button);
      await waitForEuiPopoverOpen();

      // Navigate to TLS rule panel
      const tlsRuleMenuItem = screen.getByTestId('manageTlsRuleName');
      await user.click(tlsRuleMenuItem);

      // Wait for the panel and hover over the disabled button
      const editTlsRuleButton = await waitFor(() => screen.getByTestId('editDefaultTlsRule'));
      fireEvent.mouseOver(editTlsRuleButton);

      // Wait for tooltip to appear and check content
      await waitFor(() => {
        expect(
          screen.getByText('TLS rule does not exist. Create the rule before editing.')
        ).toBeInTheDocument();
      });
    });

    it('does not show tooltip for TLS rule when user has permissions and TLS rule exists', async () => {
      mockUseSyntheticsRules.mockReturnValue({
        loading: false,
        EditAlertFlyout: null,
        NewRuleFlyout: null,
        defaultRules: {
          statusRule: { id: 'status-rule-1', name: 'Status Rule' },
          tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
        },
      });

      const user = userEvent.setup();
      render(<ToggleAlertFlyoutButton />, {
        state: baseMockState,
        core: makeSyntheticsPermissionsCore({ save: true }),
      });

      // Open the popover
      const button = screen.getByTestId('syntheticsAlertsRulesButton');
      await user.click(button);
      await waitForEuiPopoverOpen();

      // Navigate to TLS rule panel
      const tlsRuleMenuItem = screen.getByTestId('manageTlsRuleName');
      await user.click(tlsRuleMenuItem);

      // Wait for the panel and hover over the enabled button
      const editTlsRuleButton = await waitFor(() => screen.getByTestId('editDefaultTlsRule'));
      fireEvent.mouseOver(editTlsRuleButton);

      // Wait a bit to ensure tooltip doesn't appear
      await waitFor(
        () => {
          expect(
            screen.queryByText('TLS rule does not exist. Create the rule before editing.')
          ).not.toBeInTheDocument();
          expect(
            screen.queryByText('You do not have sufficient permissions to perform this action.')
          ).not.toBeInTheDocument();
        },
        { timeout: 500 }
      );
    });

    it('does not show tooltip for status rule when user has permissions and status rule exists', async () => {
      mockUseSyntheticsRules.mockReturnValue({
        loading: false,
        EditAlertFlyout: null,
        NewRuleFlyout: null,
        defaultRules: {
          statusRule: { id: 'status-rule-1', name: 'Status Rule' },
          tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
        },
      });

      const user = userEvent.setup();
      render(<ToggleAlertFlyoutButton />, {
        state: baseMockState,
        core: makeSyntheticsPermissionsCore({ save: true }),
      });

      // Open the popover
      const button = screen.getByTestId('syntheticsAlertsRulesButton');
      await user.click(button);
      await waitForEuiPopoverOpen();

      // Navigate to status rule panel
      const statusRuleMenuItem = screen.getByTestId('manageStatusRuleName');
      await user.click(statusRuleMenuItem);

      // Wait for the panel and hover over the enabled button
      const editStatusRuleButton = await waitFor(() => screen.getByTestId('editDefaultStatusRule'));
      fireEvent.mouseOver(editStatusRuleButton);

      // Wait a bit to ensure tooltip doesn't appear
      await waitFor(
        () => {
          expect(
            screen.queryByText('Status rule does not exist. Create the rule before editing.')
          ).not.toBeInTheDocument();
          expect(
            screen.queryByText('You do not have sufficient permissions to perform this action.')
          ).not.toBeInTheDocument();
        },
        { timeout: 500 }
      );
    });

    it('shows status rule not available tooltip when user has permissions and status rule does not exist', async () => {
      mockUseSyntheticsRules.mockReturnValue({
        loading: false,
        EditAlertFlyout: null,
        NewRuleFlyout: null,
        defaultRules: {
          statusRule: null,
          tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
        },
      });

      const user = userEvent.setup();
      render(<ToggleAlertFlyoutButton />, {
        state: baseMockState,
        core: makeSyntheticsPermissionsCore({ save: true }),
      });

      // Open the popover
      const button = screen.getByTestId('syntheticsAlertsRulesButton');
      await user.click(button);
      await waitForEuiPopoverOpen();

      // Navigate to status rule panel
      const statusRuleMenuItem = screen.getByTestId('manageStatusRuleName');
      await user.click(statusRuleMenuItem);

      // Wait for the panel and hover over the disabled button
      const editStatusRuleButton = await waitFor(() => screen.getByTestId('editDefaultStatusRule'));
      fireEvent.mouseOver(editStatusRuleButton);

      // Wait for tooltip to appear and check content
      await waitFor(() => {
        expect(
          screen.getByText('Status rule does not exist. Create the rule before editing.')
        ).toBeInTheDocument();
      });
    });
  });
});
