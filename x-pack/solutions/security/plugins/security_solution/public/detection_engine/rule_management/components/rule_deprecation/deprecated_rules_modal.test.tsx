/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useExecuteBulkAction } from '../../logic/bulk_actions/use_execute_bulk_action';
import { useKibana } from '../../../../common/lib/kibana';
import { DeprecatedRulesModal } from './deprecated_rules_modal';
import type { DeprecatedRuleForReview } from '../../../../../common/api/detection_engine/prebuilt_rules';

jest.mock('../../../../common/components/user_privileges');
jest.mock('../../logic/bulk_actions/use_execute_bulk_action');
jest.mock('../../../../common/lib/kibana');

const mockUseUserPrivileges = useUserPrivileges as jest.Mock;
const mockUseExecuteBulkAction = useExecuteBulkAction as jest.Mock;

// Simplified RuleLink component for testing.
jest.mock('../../../rule_management_ui/components/rules_table/use_columns', () => ({
  RuleLink: ({ name, id }: { name: string; id: string }) => (
    <a href={`/rules/id/${id}`} data-test-subj="ruleName">
      {name}
    </a>
  ),
}));

const mockUseKibana = useKibana as jest.Mock;
const mockExecuteBulkAction = jest.fn();
const mockOnClose = jest.fn();

const MOCK_RULES: DeprecatedRuleForReview[] = [
  { id: 'rule-so-id-1', rule_id: 'rule-rule-id-1', name: 'Deprecated Rule A' },
  { id: 'rule-so-id-2', rule_id: 'rule-rule-id-2', name: 'Deprecated Rule B' },
];

describe('DeprecatedRulesModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseUserPrivileges.mockReturnValue({
      rulesPrivileges: {
        rules: { edit: true },
        exceptions: { edit: true },
      },
    });

    mockUseExecuteBulkAction.mockReturnValue({ executeBulkAction: mockExecuteBulkAction });

    mockUseKibana.mockReturnValue({
      services: { telemetry: { reportEvent: jest.fn() } },
    });
  });

  describe('Delete all button is disabled for read-only users', () => {
    it('disables the delete-all button when user cannot edit rules', () => {
      mockUseUserPrivileges.mockReturnValue({
        rulesPrivileges: {
          rules: { edit: false },
          exceptions: { edit: false },
        },
      });

      render(<DeprecatedRulesModal rules={MOCK_RULES} isLoading={false} onClose={mockOnClose} />);

      expect(screen.getByTestId('deprecated-rules-modal-delete-all')).toBeDisabled();
    });

    it('enables the delete-all button when user can edit rules', () => {
      render(<DeprecatedRulesModal rules={MOCK_RULES} isLoading={false} onClose={mockOnClose} />);

      expect(screen.getByTestId('deprecated-rules-modal-delete-all')).not.toBeDisabled();
    });
  });

  describe('Cancel bulk delete confirmation modal', () => {
    it('does not delete rules when the confirmation is cancelled', async () => {
      const user = userEvent.setup();
      render(<DeprecatedRulesModal rules={MOCK_RULES} isLoading={false} onClose={mockOnClose} />);

      // Open the confirm modal
      await user.click(screen.getByTestId('deprecated-rules-modal-delete-all'));

      expect(screen.getByTestId('deprecated-rules-delete-confirm-modal')).toBeInTheDocument();

      // Click the cancel button inside the confirmation modal
      await user.click(screen.getByTestId('confirmModalCancelButton'));

      // The confirm modal should be dismissed and no deletion should have been triggered
      expect(screen.queryByTestId('deprecated-rules-delete-confirm-modal')).not.toBeInTheDocument();
      expect(mockExecuteBulkAction).not.toHaveBeenCalled();
    });
  });
});
