/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, waitFor, within } from '@testing-library/react';
import React from 'react';
import { RuleActionsOverflow } from '.';
import { ManualRuleRunEventTypes } from '../../../../../common/lib/telemetry';
import { TestProviders } from '../../../../../common/mock';
import { useBulkExport } from '../../../../rule_management/logic/bulk_actions/use_bulk_export';
import { useExecuteBulkAction } from '../../../../rule_management/logic/bulk_actions/use_execute_bulk_action';
import { mockRule } from '../../../../rule_management_ui/components/rules_table/__mocks__/mock';
import type { ExternalRuleSource } from '../../../../../../common/api/detection_engine';
import { useRuleCustomizationsContext } from '../../../../rule_management/components/rule_details/rule_customizations_diff/rule_customizations_context';
import { initialUserPrivilegesState } from '../../../../../common/components/user_privileges/user_privileges_context';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';

const showBulkDuplicateExceptionsConfirmation = () => Promise.resolve(null);
const showManualRuleRunConfirmation = () => Promise.resolve(null);

jest.mock('../../../../../common/hooks/use_experimental_features');
jest.mock('../../../../rule_management/logic/bulk_actions/use_execute_bulk_action');
jest.mock('../../../../rule_management/logic/bulk_actions/use_bulk_export');
jest.mock(
  '../../../../rule_management/components/rule_details/rule_customizations_diff/rule_customizations_context'
);
jest.mock('../../../../../common/components/user_privileges');

const mockReportEvent = jest.fn();
jest.mock('../../../../../common/lib/kibana', () => {
  const actual = jest.requireActual('../../../../../common/lib/kibana');
  return {
    ...actual,
    useKibana: jest.fn().mockImplementation(() => {
      const useKibana = actual.useKibana();
      return {
        ...useKibana,
        services: {
          ...useKibana.services,
          telemetry: {
            reportEvent: (
              eventType: ManualRuleRunEventTypes,
              params: { type: 'single' | 'bulk' }
            ) => mockReportEvent(eventType, params),
          },
        },
      };
    }),
  };
});

const useExecuteBulkActionMock = useExecuteBulkAction as jest.Mock;
const useBulkExportMock = useBulkExport as jest.Mock;
const useRuleCustomizationsContextMock = useRuleCustomizationsContext as jest.Mock;

describe('RuleActionsOverflow', () => {
  beforeEach(() => {
    useRuleCustomizationsContextMock.mockReturnValue({
      actions: { openCustomizationsRevertFlyout: jest.fn() },
      state: { doesBaseVersionExist: true },
    });
    (useUserPrivileges as jest.Mock).mockReturnValue({
      ...initialUserPrivilegesState(),
      rulesPrivileges: {
        rules: { read: true, edit: true },
        manualRun: { read: true, edit: true },
        exceptions: { read: true, edit: true },
      },
    });
  });
  describe('rules details menu panel', () => {
    test('menu items rendered when a rule is passed to the component', () => {
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      expect(getByTestId('rules-details-menu-panel')).toHaveTextContent('Duplicate rule');
      expect(getByTestId('rules-details-menu-panel')).toHaveTextContent('Export rule');
      expect(getByTestId('rules-details-menu-panel')).toHaveTextContent('Delete rule');
      expect(getByTestId('rules-details-menu-panel')).toHaveTextContent('Manual run');
      expect(getByTestId('rules-details-menu-panel')).not.toHaveTextContent('Revert rule'); // Don't show revert rule action when rule is custom
    });

    test('rule-specific items are not rendered when no rule is passed to the component', () => {
      const { getByTestId, queryByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={null}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      expect(queryByTestId('rules-details-duplicate-rule')).not.toBeInTheDocument();
      expect(queryByTestId('rules-details-export-rule')).not.toBeInTheDocument();
      expect(queryByTestId('rules-details-manual-rule-run')).not.toBeInTheDocument();
      expect(queryByTestId('rules-details-delete-rule')).not.toBeInTheDocument();
    });
  });

  describe('rules details pop over button icon', () => {
    test('it does not open the popover when rules-details-popover-button-icon is clicked when the disabled flag is passed', () => {
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={true}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));

      expect(getByTestId('rules-details-popover')).not.toHaveTextContent(/.+/);
    });
  });

  describe('rules details duplicate rule', () => {
    test('it closes the popover when rules-details-duplicate-rule is clicked', () => {
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      fireEvent.click(getByTestId('rules-details-duplicate-rule'));

      expect(getByTestId('rules-details-popover')).not.toHaveTextContent(/.+/);
    });
  });

  describe('rules details export rule', () => {
    test('should call export actions and display toast when export option is clicked', async () => {
      const bulkExport = jest.fn();
      useBulkExportMock.mockReturnValue({ bulkExport });

      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      fireEvent.click(getByTestId('rules-details-export-rule'));

      expect(bulkExport).toHaveBeenCalled();
    });

    test('it closes the popover when rules-details-export-rule is clicked', () => {
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      fireEvent.click(getByTestId('rules-details-export-rule'));

      // Popover is not shown
      expect(getByTestId('rules-details-popover')).not.toHaveTextContent(/.+/);
    });

    test('should be enabled when user only has rule read permissions', async () => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        ...initialUserPrivilegesState(),
        rulesPrivileges: {
          rules: { read: true, edit: false },
          manualRun: { read: false, edit: false },
          exceptions: { read: true, edit: false },
        },
      });

      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      expect(getByTestId('rules-details-export-rule')).not.toBeDisabled();
    });
  });

  describe('rules details delete rule', () => {
    test('it closes the popover when rules-details-delete-rule is clicked', () => {
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      fireEvent.click(getByTestId('rules-details-delete-rule'));

      // Popover is not shown
      expect(getByTestId('rules-details-popover')).not.toHaveTextContent(/.+/);
    });

    test('it calls deleteRulesAction when rules-details-delete-rule is clicked', async () => {
      const executeBulkAction = jest.fn();
      useExecuteBulkActionMock.mockReturnValue({ executeBulkAction });

      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      fireEvent.click(getByTestId('rules-details-delete-rule'));

      await waitFor(() => {
        expect(executeBulkAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'delete' }));
      });
    });

    test('it calls deleteRulesAction with the rule.id when rules-details-delete-rule is clicked', async () => {
      const executeBulkAction = jest.fn();
      useExecuteBulkActionMock.mockReturnValue({ executeBulkAction });

      const rule = mockRule('id');
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={rule}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );

      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      fireEvent.click(getByTestId('rules-details-delete-rule'));

      await waitFor(() => {
        expect(executeBulkAction).toHaveBeenCalledWith({ type: 'delete', ids: ['id'] });
      });
    });
  });

  describe('rules details manual rule run', () => {
    test('it closes the popover when rules-details-manual-rule-run is clicked', () => {
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      fireEvent.click(getByTestId('rules-details-manual-rule-run'));

      // Popover is not shown
      expect(getByTestId('rules-details-popover')).not.toHaveTextContent(/.+/);
    });

    test('it calls telemetry.reportEvent when rules-details-manual-rule-run is clicked', async () => {
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      fireEvent.click(getByTestId('rules-details-manual-rule-run'));

      await waitFor(() => {
        expect(mockReportEvent).toHaveBeenCalledWith(
          ManualRuleRunEventTypes.ManualRuleRunOpenModal,
          {
            type: 'single',
          }
        );
      });
    });

    it('should be disabled when the user does not have permissions for the subfeature', async () => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        ...initialUserPrivilegesState(),
        rulesPrivileges: {
          rules: { read: true, edit: true }, // all rule permissions
          manualRun: { read: false, edit: false }, // but no manual rule run permissions
          exceptions: { read: true, edit: false },
        },
      });

      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={mockRule('id')}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      expect(getByTestId('rules-details-manual-rule-run')).toBeDisabled();
    });
  });

  describe('rule revert to base version flyout', () => {
    const customizedMockRule = {
      ...mockRule('id'),
      rule_source: { type: 'external', is_customized: true } as ExternalRuleSource,
    };
    test('it shows the revert action when rule is prebuilt and customized', () => {
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={customizedMockRule}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      const revertRuleButton = within(getByTestId('rules-details-menu-panel')).getByText(
        'Revert to Elastic version'
      );

      fireEvent.click(revertRuleButton);
      // Popover is not shown
      expect(getByTestId('rules-details-popover')).not.toHaveTextContent(/.+/);
    });

    test('it disabled the revert action when isRevertBaseVersionDisabled is true', async () => {
      useRuleCustomizationsContextMock.mockReturnValue({
        actions: { openCustomizationsRevertFlyout: jest.fn() },
        state: { doesBaseVersionExist: false },
      });
      const { getByTestId } = render(
        <RuleActionsOverflow
          showBulkDuplicateExceptionsConfirmation={showBulkDuplicateExceptionsConfirmation}
          showManualRuleRunConfirmation={showManualRuleRunConfirmation}
          ruleId="id"
          rule={customizedMockRule}
          isDisabled={false}
          canDuplicateRuleWithActions={true}
          confirmDeletion={() => Promise.resolve(true)}
        />,
        { wrapper: TestProviders }
      );
      fireEvent.click(getByTestId('rules-details-popover-button-icon'));
      expect(getByTestId('rules-details-revert-rule')).toBeDisabled();
    });
  });
});
