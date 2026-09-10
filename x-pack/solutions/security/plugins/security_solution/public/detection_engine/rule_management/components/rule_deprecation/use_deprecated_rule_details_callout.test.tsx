/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import type { RuleResponse } from '../../../../../common/api/detection_engine';
import { BulkActionTypeEnum } from '../../../../../common/api/detection_engine/rule_management';
import { DuplicateOptions } from '../../../../../common/detection_engine/rule_management/constants';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useExecuteBulkAction } from '../../logic/bulk_actions/use_execute_bulk_action';
import { usePrebuiltRulesDeprecationReview } from '../../logic/prebuilt_rules/use_prebuilt_rules_deprecation_review';
import { useBulkDuplicateExceptionsConfirmation } from '../../../rule_management_ui/components/rules_table/bulk_actions/use_bulk_duplicate_confirmation';
import { useKibana } from '../../../../common/lib/kibana';
import { savedRuleMock } from '../../logic/mock';
import { useDeprecatedRuleDetailsCallout } from './use_deprecated_rule_details_callout';
import { createDefaultExternalRuleSource } from '../../../../../server/lib/detection_engine/rule_management/logic/detection_rules_client/mergers/rule_source/create_default_external_rule_source';

jest.mock('../../../../common/components/user_privileges');
jest.mock('../../logic/bulk_actions/use_execute_bulk_action');
jest.mock('../../logic/prebuilt_rules/use_prebuilt_rules_deprecation_review');
jest.mock(
  '../../../rule_management_ui/components/rules_table/bulk_actions/use_bulk_duplicate_confirmation'
);
jest.mock('../../../../common/lib/kibana');

const mockUseUserPrivileges = useUserPrivileges as jest.Mock;
const mockUseExecuteBulkAction = useExecuteBulkAction as jest.Mock;
const mockUsePrebuiltRulesDeprecationReview = usePrebuiltRulesDeprecationReview as jest.Mock;
const mockUseBulkDuplicateExceptionsConfirmation =
  useBulkDuplicateExceptionsConfirmation as jest.Mock;
const mockUseKibana = useKibana as jest.Mock;

const RULE_ID = savedRuleMock.id;
const RULE_RULE_ID = savedRuleMock.rule_id;

// A prebuilt rule (external rule_source) for tests
const mockPrebuiltRule: RuleResponse = {
  ...savedRuleMock,
  rule_source: createDefaultExternalRuleSource(),
};

const mockExecuteBulkAction = jest.fn();
const mockNavigateToApp = jest.fn();
const mockConfirmDeletion = jest.fn();
const mockShowBulkDuplicateConfirmation = jest.fn();
const mockCancelRuleDuplication = jest.fn();
const mockConfirmRuleDuplication = jest.fn();

/**
 * Renders a wrapper component that calls the hook and renders the returned callout.
 */
function TestComponentInner({
  rule = mockPrebuiltRule,
  confirmDeletion = mockConfirmDeletion,
}: Partial<{
  rule: RuleResponse | null;
  confirmDeletion: () => Promise<boolean>;
}>) {
  const callout = useDeprecatedRuleDetailsCallout({
    rule,
    confirmDeletion,
  });

  return <>{callout}</>;
}

function TestComponent(
  props: Partial<{
    rule: RuleResponse | null;
    confirmDeletion: () => Promise<boolean>;
  }>
) {
  return (
    <I18nProvider>
      <TestComponentInner {...props} />
    </I18nProvider>
  );
}

describe('useDeprecatedRuleDetailsCallout', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseUserPrivileges.mockReturnValue({
      rulesPrivileges: {
        rules: { edit: true },
        exceptions: { edit: true },
      },
    });

    mockUseExecuteBulkAction.mockReturnValue({ executeBulkAction: mockExecuteBulkAction });

    // We utilize the enabled flag in the react query call, this mimics that behavior
    mockUsePrebuiltRulesDeprecationReview.mockImplementation((_request, options) => {
      if (options?.enabled === false) {
        return { data: undefined, isLoading: false };
      }
      return {
        data: {
          rules: [{ id: RULE_ID, rule_id: RULE_RULE_ID, name: savedRuleMock.name }],
        },
        isLoading: false,
      };
    });

    mockUseBulkDuplicateExceptionsConfirmation.mockReturnValue({
      isBulkDuplicateConfirmationVisible: false,
      showBulkDuplicateConfirmation: mockShowBulkDuplicateConfirmation,
      cancelRuleDuplication: mockCancelRuleDuplication,
      confirmRuleDuplication: mockConfirmRuleDuplication,
    });

    mockUseKibana.mockReturnValue({
      services: {
        application: { navigateToApp: mockNavigateToApp },
        telemetry: { reportEvent: jest.fn() },
        docLinks: {
          links: {
            securitySolution: {
              manageDetectionRules: 'https://www.elastic.co/docs/manage-detection-rules',
            },
          },
        },
      },
    });
  });

  describe('Original rule is not deleted if duplication fails', () => {
    it('does not call delete when duplicate bulk action returns no created rules', async () => {
      mockExecuteBulkAction.mockResolvedValue({
        attributes: { results: { created: [] } },
      });
      mockShowBulkDuplicateConfirmation.mockResolvedValue(DuplicateOptions.withoutExceptions);

      render(<TestComponent />);

      const duplicateButton = screen.getByTestId('deprecated-rule-duplicate-and-delete-button');
      await act(async () => {
        await userEvent.click(duplicateButton);
      });

      expect(mockExecuteBulkAction).toHaveBeenCalledTimes(1);
      expect(mockExecuteBulkAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: BulkActionTypeEnum.duplicate })
      );
      expect(mockExecuteBulkAction).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: BulkActionTypeEnum.delete })
      );
    });

    it('does not call delete when duplicate bulk action returns undefined', async () => {
      mockExecuteBulkAction.mockResolvedValue(undefined);
      mockShowBulkDuplicateConfirmation.mockResolvedValue(DuplicateOptions.withoutExceptions);

      render(<TestComponent />);

      const duplicateButton = screen.getByTestId('deprecated-rule-duplicate-and-delete-button');
      await act(async () => {
        await userEvent.click(duplicateButton);
      });

      expect(mockExecuteBulkAction).toHaveBeenCalledTimes(1);
      expect(mockExecuteBulkAction).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: BulkActionTypeEnum.delete })
      );
    });
  });

  describe('Action buttons are disabled for read-only users', () => {
    beforeEach(() => {
      mockUseUserPrivileges.mockReturnValue({
        rulesPrivileges: {
          rules: { edit: false },
          exceptions: { edit: false },
        },
      });
    });

    it('disables both delete and duplicate-and-delete buttons when user cannot edit rules', () => {
      render(<TestComponent />);

      expect(screen.getByTestId('deprecated-rule-delete-button')).toBeDisabled();
      expect(screen.getByTestId('deprecated-rule-duplicate-and-delete-button')).toBeDisabled();
    });
  });

  describe('Cancel duplicate-and-delete flow', () => {
    it('does not duplicate or delete when exceptions confirmation is cancelled', async () => {
      mockShowBulkDuplicateConfirmation.mockResolvedValue(null);

      render(<TestComponent />);

      const duplicateButton = screen.getByTestId('deprecated-rule-duplicate-and-delete-button');
      await act(async () => {
        await userEvent.click(duplicateButton);
      });

      expect(mockExecuteBulkAction).not.toHaveBeenCalled();
    });
  });

  describe('Cancel delete flow', () => {
    it('does not delete when deletion confirmation returns false', async () => {
      mockConfirmDeletion.mockResolvedValue(false);

      render(<TestComponent />);

      const deleteButton = screen.getByTestId('deprecated-rule-delete-button');
      await act(async () => {
        await userEvent.click(deleteButton);
      });

      expect(mockExecuteBulkAction).not.toHaveBeenCalled();
    });
  });

  describe('Returns null when callout should not show', () => {
    it('returns null when rule is null', () => {
      const { container } = render(<TestComponent rule={null} />);

      expect(container).toBeEmptyDOMElement();
    });

    it('returns null when rule is a custom rule (not external)', () => {
      const customRule: RuleResponse = { ...savedRuleMock };

      const { container } = render(<TestComponent rule={customRule} />);

      expect(container).toBeEmptyDOMElement();
    });

    it('returns null while deprecation data is loading', () => {
      mockUsePrebuiltRulesDeprecationReview.mockReturnValue({ data: undefined, isLoading: true });

      const { container } = render(<TestComponent />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('Duplicate confirmation modal', () => {
    it('renders the duplicate confirmation modal when visible', () => {
      mockUseBulkDuplicateExceptionsConfirmation.mockReturnValue({
        isBulkDuplicateConfirmationVisible: true,
        showBulkDuplicateConfirmation: mockShowBulkDuplicateConfirmation,
        cancelRuleDuplication: mockCancelRuleDuplication,
        confirmRuleDuplication: mockConfirmRuleDuplication,
      });

      render(<TestComponent />);

      expect(
        screen.getByTestId('deprecated-rule-duplicate-delete-confirm-modal')
      ).toBeInTheDocument();
    });

    it('does not render the duplicate confirmation modal when hidden', () => {
      render(<TestComponent />);

      expect(
        screen.queryByTestId('deprecated-rule-duplicate-delete-confirm-modal')
      ).not.toBeInTheDocument();
    });
  });
});
