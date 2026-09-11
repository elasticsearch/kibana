/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import type { RuleResponse } from '../../../../../../common/api/detection_engine';
import { ThreeWayDiffConflict } from '../../../../../../common/api/detection_engine';
import type { RuleUpgradeState } from '../../../../rule_management/model/prebuilt_rule_upgrade';
import { UpgradePrebuiltRulesTableButtons } from './upgrade_prebuilt_rules_table_buttons';
import { useUpgradePrebuiltRulesTableContext } from './upgrade_prebuilt_rules_table_context';
import { usePrebuiltRulesCustomizationStatus } from '../../../../rule_management/logic/prebuilt_rules/use_prebuilt_rules_customization_status';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { initialUserPrivilegesState } from '../../../../../common/components/user_privileges/user_privileges_context';

jest.mock('./upgrade_prebuilt_rules_table_context');
jest.mock(
  '../../../../rule_management/logic/prebuilt_rules/use_prebuilt_rules_customization_status'
);
jest.mock('../../../../../common/components/user_privileges');

const mockUseUpgradePrebuiltRulesTableContext = useUpgradePrebuiltRulesTableContext as jest.Mock;
const mockUsePrebuiltRulesCustomizationStatus = usePrebuiltRulesCustomizationStatus as jest.Mock;
const mockUseUserPrivileges = useUserPrivileges as jest.Mock;

describe('UpgradePrebuiltRulesTableButtons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePrebuiltRulesCustomizationStatus.mockReturnValue({ isRulesCustomizationEnabled: true });
    mockUseUserPrivileges.mockReturnValue({
      ...initialUserPrivilegesState(),
      rulesPrivileges: {
        ...initialUserPrivilegesState().rulesPrivileges,
        rules: { read: true, edit: true },
      },
    });
  });

  describe('Selected scope force-upgrade-to-Elastic-version', () => {
    it('Test 1: happy path end to end — sends every selected rule to upgradeRulesToTarget after confirming the danger modal', async () => {
      const user = userEvent.setup();
      const upgradeRulesToTarget = jest.fn();
      const getSelectedRulesCustomizationCounts = jest
        .fn()
        .mockReturnValue({ total: 2, customizedCount: 1 });
      const selectedRules = [
        createRuleUpgradeStateMock({ ruleId: 'rule-customized', isCustomized: true }),
        createRuleUpgradeStateMock({ ruleId: 'rule-plain', isCustomized: false }),
      ];

      mockContext({ upgradeRulesToTarget, getSelectedRulesCustomizationCounts });
      renderButtons(selectedRules);

      await openSelectedRulesToTargetAction(user);
      await screen.findByTestId('forceUpgradeSelectedRulesToTargetConfirmModal');
      await user.click(screen.getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(upgradeRulesToTarget).toHaveBeenCalledWith(['rule-customized', 'rule-plain']);
    });

    it('Test 2 (CONF-07 uniformity): includes the non-customized rule id alongside the customized one, no filtering to the customized subset', async () => {
      const user = userEvent.setup();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [
        createRuleUpgradeStateMock({ ruleId: 'rule-customized', isCustomized: true }),
        createRuleUpgradeStateMock({ ruleId: 'rule-plain', isCustomized: false }),
      ];

      mockContext({
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 2, customizedCount: 1 }),
      });
      renderButtons(selectedRules);

      await openSelectedRulesToTargetAction(user);
      await screen.findByTestId('forceUpgradeSelectedRulesToTargetConfirmModal');
      await user.click(screen.getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        const [ruleIds] = upgradeRulesToTarget.mock.calls[0];
        expect(ruleIds).toEqual(expect.arrayContaining(['rule-customized', 'rule-plain']));
        expect(ruleIds).toHaveLength(2);
      });
    });

    it('Test 3 (CONF-04 counts): the modal body renders both counts and no rule name', async () => {
      const user = userEvent.setup();
      const selectedRules = [
        createRuleUpgradeStateMock({ ruleId: 'rule-customized', isCustomized: true }),
        createRuleUpgradeStateMock({ ruleId: 'rule-plain', isCustomized: false }),
      ];

      mockContext({
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 2, customizedCount: 1 }),
      });
      renderButtons(selectedRules);

      await openSelectedRulesToTargetAction(user);

      const modal = await screen.findByTestId('forceUpgradeSelectedRulesToTargetConfirmModal');
      expect(modal).toHaveTextContent('permanently discard');
      expect(modal).toHaveTextContent('2');
      expect(modal).toHaveTextContent('1');
      expect(modal).not.toHaveTextContent('rule-customized');
      expect(modal).not.toHaveTextContent('rule-plain');
    });

    it('Test 4: does not display the modal before the dropdown action is confirmed', () => {
      const selectedRules = [createRuleUpgradeStateMock({ ruleId: 'rule-plain' })];

      mockContext({
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 1, customizedCount: 0 }),
      });

      renderButtons(selectedRules);

      expect(
        screen.queryByTestId('forceUpgradeSelectedRulesToTargetConfirmModal')
      ).not.toBeInTheDocument();
    });

    it('CONF-05: a zero-customized target set upgrades immediately with no modal', async () => {
      const user = userEvent.setup();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [
        createRuleUpgradeStateMock({ ruleId: 'rule-1' }),
        createRuleUpgradeStateMock({ ruleId: 'rule-2' }),
        createRuleUpgradeStateMock({ ruleId: 'rule-3' }),
      ];

      mockContext({
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 3, customizedCount: 0 }),
      });
      renderButtons(selectedRules);

      await openSelectedRulesToTargetAction(user);

      await waitFor(() => {
        expect(upgradeRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(upgradeRulesToTarget).toHaveBeenCalledWith(['rule-1', 'rule-2', 'rule-3']);
      expect(
        screen.queryByTestId('forceUpgradeSelectedRulesToTargetConfirmModal')
      ).not.toBeInTheDocument();
    });

    it('CONF-04 cancel: cancelling the modal removes it and leaves upgradeRulesToTarget uncalled', async () => {
      const user = userEvent.setup();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [
        createRuleUpgradeStateMock({ ruleId: 'rule-1', isCustomized: true }),
        createRuleUpgradeStateMock({ ruleId: 'rule-2', isCustomized: true }),
      ];

      mockContext({
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 2, customizedCount: 2 }),
      });
      renderButtons(selectedRules);

      await openSelectedRulesToTargetAction(user);
      await screen.findByTestId('forceUpgradeSelectedRulesToTargetConfirmModal');
      await user.click(screen.getByTestId('confirmModalCancelButton'));

      await waitFor(() => {
        expect(
          screen.queryByTestId('forceUpgradeSelectedRulesToTargetConfirmModal')
        ).not.toBeInTheDocument();
      });
      expect(upgradeRulesToTarget).not.toHaveBeenCalled();
    });

    it('CONF-03: the secondary segment stays enabled when the primary is disabled by non-solvable conflicts, and still reaches upgradeRulesToTarget', async () => {
      const user = userEvent.setup();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [
        createRuleUpgradeStateMock({
          ruleId: 'rule-1',
          isCustomized: true,
          hasNonSolvableUnresolvedConflicts: true,
        }),
        createRuleUpgradeStateMock({
          ruleId: 'rule-2',
          isCustomized: true,
          hasNonSolvableUnresolvedConflicts: true,
        }),
      ];

      mockContext({
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 2, customizedCount: 2 }),
      });
      renderButtons(selectedRules);

      expect(screen.getByTestId('upgradeSelectedRulesButton')).toBeDisabled();
      expect(screen.getByTestId('upgradeSelectedRulesButton-secondary')).toBeEnabled();

      await openSelectedRulesToTargetAction(user);
      await screen.findByTestId('forceUpgradeSelectedRulesToTargetConfirmModal');
      await user.click(screen.getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeRulesToTarget).toHaveBeenCalledTimes(1);
      });
    });

    it('CONF-01: clicking the primary segment calls upgradeRules with the selected ids and never calls upgradeRulesToTarget', async () => {
      const user = userEvent.setup();
      const upgradeRules = jest.fn();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [createRuleUpgradeStateMock({ ruleId: 'rule-1' })];

      mockContext({ upgradeRules, upgradeRulesToTarget });
      renderButtons(selectedRules);

      await user.click(screen.getByTestId('upgradeSelectedRulesButton'));

      expect(upgradeRules).toHaveBeenCalledWith(['rule-1']);
      expect(upgradeRulesToTarget).not.toHaveBeenCalled();
    });

    it('disables both Selected segments while a request is in flight', () => {
      const selectedRules = [createRuleUpgradeStateMock({ ruleId: 'rule-1' })];

      mockContext({ loadingRules: ['rule-1'] });
      renderButtons(selectedRules);

      expect(screen.getByTestId('upgradeSelectedRulesButton')).toBeDisabled();
      expect(screen.getByTestId('upgradeSelectedRulesButton-secondary')).toBeDisabled();
    });

    it('disables both Selected segments when the user lacks edit privileges', () => {
      mockUseUserPrivileges.mockReturnValue({
        ...initialUserPrivilegesState(),
        rulesPrivileges: {
          ...initialUserPrivilegesState().rulesPrivileges,
          rules: { read: true, edit: false },
        },
      });
      const selectedRules = [createRuleUpgradeStateMock({ ruleId: 'rule-1' })];

      mockContext();
      renderButtons(selectedRules);

      expect(screen.getByTestId('upgradeSelectedRulesButton')).toBeDisabled();
      expect(screen.getByTestId('upgradeSelectedRulesButton-secondary')).toBeDisabled();
    });

    it('keeps the conflicts tooltip off the secondary segment when all selected rules have non-solvable conflicts', () => {
      const allConflictsRules = [
        createRuleUpgradeStateMock({
          ruleId: 'rule-1',
          isCustomized: true,
          hasNonSolvableUnresolvedConflicts: true,
        }),
      ];

      mockContext();
      renderButtons(allConflictsRules);

      fireEvent.mouseOver(screen.getByTestId('upgradeSelectedRulesButton-secondary'));
      expect(
        screen.queryByText(/have conflicts that must be manually resolved/)
      ).not.toBeInTheDocument();
    });

    it('shows the no-permissions tooltip independently on the secondary segment (not borrowed from the primary)', async () => {
      mockUseUserPrivileges.mockReturnValue({
        ...initialUserPrivilegesState(),
        rulesPrivileges: {
          ...initialUserPrivilegesState().rulesPrivileges,
          rules: { read: true, edit: false },
        },
      });
      mockContext();
      renderButtons([createRuleUpgradeStateMock({ ruleId: 'rule-1' })]);

      expect(
        screen.queryByText("You don't have permissions to update rules")
      ).not.toBeInTheDocument();

      fireEvent.mouseOver(screen.getByTestId('upgradeSelectedRulesButton-secondary'));

      expect(
        await screen.findByText("You don't have permissions to update rules")
      ).toBeInTheDocument();
    });

    it('shows the no-permissions tooltip independently on the primary segment', async () => {
      mockUseUserPrivileges.mockReturnValue({
        ...initialUserPrivilegesState(),
        rulesPrivileges: {
          ...initialUserPrivilegesState().rulesPrivileges,
          rules: { read: true, edit: false },
        },
      });
      mockContext();
      renderButtons([createRuleUpgradeStateMock({ ruleId: 'rule-1' })]);

      fireEvent.mouseOver(screen.getByTestId('upgradeSelectedRulesButton'));

      expect(
        await screen.findByText("You don't have permissions to update rules")
      ).toBeInTheDocument();
    });
  });

  describe('All scope force-upgrade-to-Elastic-version', () => {
    it('CONF-02 happy path: confirming the All modal upgrades the whole filtered set with no arguments', async () => {
      const user = userEvent.setup();
      const upgradeAllRulesToTarget = jest.fn();
      const upgradeRulesToTarget = jest.fn();

      mockContext({
        upgradeAllRulesToTarget,
        upgradeRulesToTarget,
        allRulesCustomizationCounts: { total: 12, customizedCount: 4 },
      });
      renderButtons([]);

      await openAllRulesToTargetAction(user);
      const modal = await screen.findByTestId('forceUpgradeAllRulesToTargetConfirmModal');
      expect(modal).toHaveTextContent('12');
      expect(modal).toHaveTextContent('4');
      expect(modal).toHaveTextContent('permanently discard');
      await user.click(within(modal).getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeAllRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(upgradeAllRulesToTarget).toHaveBeenCalledWith();
      expect(upgradeRulesToTarget).not.toHaveBeenCalled();
    });

    it('CONF-05 for the All scope: a zero-customized target set upgrades immediately with no modal', async () => {
      const user = userEvent.setup();
      const upgradeAllRulesToTarget = jest.fn();

      mockContext({
        upgradeAllRulesToTarget,
        allRulesCustomizationCounts: { total: 9, customizedCount: 0 },
      });
      renderButtons([]);

      await openAllRulesToTargetAction(user);

      await waitFor(() => {
        expect(upgradeAllRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(upgradeAllRulesToTarget).toHaveBeenCalledWith();
      expect(
        screen.queryByTestId('forceUpgradeAllRulesToTargetConfirmModal')
      ).not.toBeInTheDocument();
    });

    it('CONF-04 cancel for the All scope: cancelling leaves upgradeAllRulesToTarget uncalled and removes the modal', async () => {
      const user = userEvent.setup();
      const upgradeAllRulesToTarget = jest.fn();

      mockContext({
        upgradeAllRulesToTarget,
        allRulesCustomizationCounts: { total: 5, customizedCount: 5 },
      });
      renderButtons([]);

      await openAllRulesToTargetAction(user);
      const modal = await screen.findByTestId('forceUpgradeAllRulesToTargetConfirmModal');
      await user.click(within(modal).getByTestId('confirmModalCancelButton'));

      await waitFor(() => {
        expect(
          screen.queryByTestId('forceUpgradeAllRulesToTargetConfirmModal')
        ).not.toBeInTheDocument();
      });
      expect(upgradeAllRulesToTarget).not.toHaveBeenCalled();
    });

    it('CONF-02 primary unchanged: clicking the primary All segment calls upgradeAllRules and never upgradeAllRulesToTarget', async () => {
      const user = userEvent.setup();
      const upgradeAllRules = jest.fn();
      const upgradeAllRulesToTarget = jest.fn();

      mockContext({ upgradeAllRules, upgradeAllRulesToTarget });
      renderButtons([]);

      await user.click(screen.getByTestId('upgradeAllRulesButton'));

      expect(upgradeAllRules).toHaveBeenCalledTimes(1);
      expect(upgradeAllRulesToTarget).not.toHaveBeenCalled();
    });

    it('disables both All segments when hasRulesToUpgrade is false', () => {
      mockContext({ hasRulesToUpgrade: false });
      renderButtons([]);

      expect(screen.getByTestId('upgradeAllRulesButton')).toBeDisabled();
      expect(screen.getByTestId('upgradeAllRulesButton-secondary')).toBeDisabled();
    });

    it('disables both All segments while a request is in flight', () => {
      mockContext({ loadingRules: ['rule-1'] });
      renderButtons([]);

      expect(screen.getByTestId('upgradeAllRulesButton')).toBeDisabled();
      expect(screen.getByTestId('upgradeAllRulesButton-secondary')).toBeDisabled();
    });

    it('disables both All segments when the user lacks edit privileges', () => {
      mockUseUserPrivileges.mockReturnValue({
        ...initialUserPrivilegesState(),
        rulesPrivileges: {
          ...initialUserPrivilegesState().rulesPrivileges,
          rules: { read: true, edit: false },
        },
      });
      mockContext();
      renderButtons([]);

      expect(screen.getByTestId('upgradeAllRulesButton')).toBeDisabled();
      expect(screen.getByTestId('upgradeAllRulesButton-secondary')).toBeDisabled();
    });
  });

  describe('confirmation-gate independence (CONF-06)', () => {
    it('confirming the All modal while the Selected modal is open only calls upgradeAllRulesToTarget, and the Selected modal is unaffected', async () => {
      const user = userEvent.setup();
      const upgradeAllRulesToTarget = jest.fn();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [createRuleUpgradeStateMock({ ruleId: 'rule-1', isCustomized: true })];

      mockContext({
        upgradeAllRulesToTarget,
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 1, customizedCount: 1 }),
        allRulesCustomizationCounts: { total: 12, customizedCount: 4 },
      });
      renderButtons(selectedRules);

      await openSelectedRulesToTargetAction(user);
      await screen.findByTestId('forceUpgradeSelectedRulesToTargetConfirmModal');

      await openAllRulesToTargetAction(user);
      const allModal = await screen.findByTestId('forceUpgradeAllRulesToTargetConfirmModal');
      await user.click(within(allModal).getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeAllRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(upgradeRulesToTarget).not.toHaveBeenCalled();
      expect(
        screen.getByTestId('forceUpgradeSelectedRulesToTargetConfirmModal')
      ).toBeInTheDocument();
    });

    it('cancelling the Selected modal while the All modal is open leaves both upgrade functions uncalled, and confirming the All modal afterwards only fires the All action', async () => {
      const user = userEvent.setup();
      const upgradeAllRulesToTarget = jest.fn();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [createRuleUpgradeStateMock({ ruleId: 'rule-1', isCustomized: true })];

      mockContext({
        upgradeAllRulesToTarget,
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 1, customizedCount: 1 }),
        allRulesCustomizationCounts: { total: 12, customizedCount: 4 },
      });
      renderButtons(selectedRules);

      await openAllRulesToTargetAction(user);
      await screen.findByTestId('forceUpgradeAllRulesToTargetConfirmModal');

      await openSelectedRulesToTargetAction(user);
      const selectedModal = await screen.findByTestId(
        'forceUpgradeSelectedRulesToTargetConfirmModal'
      );
      await user.click(within(selectedModal).getByTestId('confirmModalCancelButton'));

      await waitFor(() => {
        expect(
          screen.queryByTestId('forceUpgradeSelectedRulesToTargetConfirmModal')
        ).not.toBeInTheDocument();
      });
      expect(upgradeAllRulesToTarget).not.toHaveBeenCalled();
      expect(upgradeRulesToTarget).not.toHaveBeenCalled();

      const allModal = screen.getByTestId('forceUpgradeAllRulesToTargetConfirmModal');
      await user.click(within(allModal).getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeAllRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(upgradeRulesToTarget).not.toHaveBeenCalled();
    });

    it('does not suppress a repeat invocation of the same scope: the Selected modal reappears on the second invocation', async () => {
      const user = userEvent.setup();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [createRuleUpgradeStateMock({ ruleId: 'rule-1', isCustomized: true })];

      mockContext({
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 1, customizedCount: 1 }),
      });
      renderButtons(selectedRules);

      await openSelectedRulesToTargetAction(user);
      const firstModal = await screen.findByTestId('forceUpgradeSelectedRulesToTargetConfirmModal');
      await user.click(within(firstModal).getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.queryByTestId('forceUpgradeSelectedRulesToTargetConfirmModal')
      ).not.toBeInTheDocument();

      await openSelectedRulesToTargetAction(user);
      const secondModal = await screen.findByTestId(
        'forceUpgradeSelectedRulesToTargetConfirmModal'
      );
      expect(upgradeRulesToTarget).toHaveBeenCalledTimes(1);
      await user.click(within(secondModal).getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeRulesToTarget).toHaveBeenCalledTimes(2);
      });
    });

    it('order independence: running the All flow before the Selected flow produces the same per-scope outcomes as the forward order', async () => {
      const user = userEvent.setup();
      const upgradeAllRulesToTarget = jest.fn();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [createRuleUpgradeStateMock({ ruleId: 'rule-1', isCustomized: true })];

      mockContext({
        upgradeAllRulesToTarget,
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 1, customizedCount: 1 }),
        allRulesCustomizationCounts: { total: 12, customizedCount: 4 },
      });
      renderButtons(selectedRules);

      await openAllRulesToTargetAction(user);
      const allModal = await screen.findByTestId('forceUpgradeAllRulesToTargetConfirmModal');
      await user.click(within(allModal).getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeAllRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(upgradeRulesToTarget).not.toHaveBeenCalled();

      await openSelectedRulesToTargetAction(user);
      const selectedModal = await screen.findByTestId(
        'forceUpgradeSelectedRulesToTargetConfirmModal'
      );
      await user.click(within(selectedModal).getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(upgradeAllRulesToTarget).toHaveBeenCalledTimes(1);
    });

    it('CONF-07 uniformity, both scopes: the Selected call receives every selected id and the All call receives no arguments at all', async () => {
      const user = userEvent.setup();
      const upgradeAllRulesToTarget = jest.fn();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [
        createRuleUpgradeStateMock({ ruleId: 'rule-customized', isCustomized: true }),
        createRuleUpgradeStateMock({ ruleId: 'rule-plain', isCustomized: false }),
      ];

      mockContext({
        upgradeAllRulesToTarget,
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 2, customizedCount: 1 }),
        allRulesCustomizationCounts: { total: 12, customizedCount: 4 },
      });
      renderButtons(selectedRules);

      await openSelectedRulesToTargetAction(user);
      const selectedModal = await screen.findByTestId(
        'forceUpgradeSelectedRulesToTargetConfirmModal'
      );
      await user.click(within(selectedModal).getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeRulesToTarget).toHaveBeenCalledWith(['rule-customized', 'rule-plain']);
      });

      await openAllRulesToTargetAction(user);
      const allModal = await screen.findByTestId('forceUpgradeAllRulesToTargetConfirmModal');
      await user.click(within(allModal).getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(upgradeAllRulesToTarget).toHaveBeenCalledWith();
      });
    });

    it('zero-customized independence: the Selected flow shows no modal while the All flow still shows one in the same render', async () => {
      const user = userEvent.setup();
      const upgradeAllRulesToTarget = jest.fn();
      const upgradeRulesToTarget = jest.fn();
      const selectedRules = [createRuleUpgradeStateMock({ ruleId: 'rule-1', isCustomized: false })];

      mockContext({
        upgradeAllRulesToTarget,
        upgradeRulesToTarget,
        getSelectedRulesCustomizationCounts: jest
          .fn()
          .mockReturnValue({ total: 1, customizedCount: 0 }),
        allRulesCustomizationCounts: { total: 3, customizedCount: 3 },
      });
      renderButtons(selectedRules);

      await openSelectedRulesToTargetAction(user);

      await waitFor(() => {
        expect(upgradeRulesToTarget).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.queryByTestId('forceUpgradeSelectedRulesToTargetConfirmModal')
      ).not.toBeInTheDocument();

      await openAllRulesToTargetAction(user);

      expect(
        await screen.findByTestId('forceUpgradeAllRulesToTargetConfirmModal')
      ).toBeInTheDocument();
      expect(upgradeAllRulesToTarget).not.toHaveBeenCalled();
    });
  });
});

async function openSelectedRulesToTargetAction(user: UserEvent) {
  await user.click(screen.getByTestId('upgradeSelectedRulesButton-secondary'));
  await waitForEuiPopoverOpen();
  await user.click(screen.getByTestId('upgradeSelectedRulesToTargetAction'));
}

async function openAllRulesToTargetAction(user: UserEvent) {
  await user.click(screen.getByTestId('upgradeAllRulesButton-secondary'));
  await waitForEuiPopoverOpen();
  await user.click(screen.getByTestId('upgradeAllRulesToTargetAction'));
}

function renderButtons(selectedRules: RuleUpgradeState[]) {
  return render(
    <I18nProvider>
      <UpgradePrebuiltRulesTableButtons selectedRules={selectedRules} />
    </I18nProvider>
  );
}

function mockContext({
  hasRulesToUpgrade = true,
  loadingRules = [],
  isRefetching = false,
  isInitializingPrebuiltRulesPackage = false,
  allRulesCustomizationCounts = { total: 0, customizedCount: 0 },
  upgradeRules = jest.fn(),
  upgradeAllRules = jest.fn(),
  upgradeRulesToTarget = jest.fn(),
  upgradeAllRulesToTarget = jest.fn(),
  getSelectedRulesCustomizationCounts = jest.fn().mockReturnValue({ total: 0, customizedCount: 0 }),
}: {
  hasRulesToUpgrade?: boolean;
  loadingRules?: string[];
  isRefetching?: boolean;
  isInitializingPrebuiltRulesPackage?: boolean;
  allRulesCustomizationCounts?: { total: number; customizedCount: number };
  upgradeRules?: jest.Mock;
  upgradeAllRules?: jest.Mock;
  upgradeRulesToTarget?: jest.Mock;
  upgradeAllRulesToTarget?: jest.Mock;
  getSelectedRulesCustomizationCounts?: jest.Mock;
} = {}) {
  mockUseUpgradePrebuiltRulesTableContext.mockReturnValue({
    state: {
      hasRulesToUpgrade,
      loadingRules,
      isRefetching,
      isInitializingPrebuiltRulesPackage,
      allRulesCustomizationCounts,
    },
    actions: {
      upgradeRules,
      upgradeAllRules,
      upgradeRulesToTarget,
      upgradeAllRulesToTarget,
      getSelectedRulesCustomizationCounts,
    },
  });
}

function createRuleUpgradeStateMock({
  ruleId,
  isCustomized = false,
  hasNonSolvableUnresolvedConflicts = false,
}: {
  ruleId: string;
  isCustomized?: boolean;
  hasNonSolvableUnresolvedConflicts?: boolean;
}): RuleUpgradeState {
  return {
    id: `${ruleId}-so-id`,
    rule_id: ruleId,
    version: 2,
    revision: 1,
    has_base_version: true,
    current_rule: createRuleResponseMock({
      rule_id: ruleId,
      rule_source: isCustomized
        ? { type: 'external', is_customized: true, has_base_version: true, customized_fields: [] }
        : {
            type: 'external',
            is_customized: false,
            has_base_version: true,
            customized_fields: [],
          },
    }),
    target_rule: createRuleResponseMock({ rule_id: ruleId }),
    diff: {
      num_fields_with_updates: 0,
      num_fields_with_conflicts: 0,
      num_fields_with_non_solvable_conflicts: 0,
      fields: {},
    },
    conflict: ThreeWayDiffConflict.NONE,
    fieldsUpgradeState: {},
    hasUnresolvedConflicts: hasNonSolvableUnresolvedConflicts,
    hasNonSolvableUnresolvedConflicts,
  } as RuleUpgradeState;
}

function createRuleResponseMock(rewrites?: Partial<RuleResponse>): RuleResponse {
  return {
    version: 2,
    revision: 1,
    rule_source: {
      type: 'external',
      is_customized: false,
      has_base_version: true,
      customized_fields: [],
    },
    ...rewrites,
  } as RuleResponse;
}
