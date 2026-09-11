/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { EuiTableTestHarness } from '@kbn/test-eui-helpers';

/**
 * Actions for interacting with the enrich policies tab.
 */
export const createEnrichPoliciesActions = () => {
  const goToEnrichPoliciesTab = () => {
    fireEvent.click(screen.getByTestId('enrich_policiesTab'));
  };

  const clickReloadPoliciesButton = () => {
    fireEvent.click(screen.getByTestId('reloadPoliciesButton'));
  };

  const clickDeletePolicyAt = async (index: number) => {
    const rows = new EuiTableTestHarness('enrichPoliciesTable').getRows();
    const dataRow = rows[index] ?? null;
    const deleteButton = within(dataRow).getByTestId('deletePolicyButton');
    fireEvent.click(deleteButton);
    await screen.findByTestId('deletePolicyModal');
  };

  const clickConfirmDeletePolicyButton = async () => {
    const modal = screen.getByTestId('deletePolicyModal');
    const confirmButton = within(modal).getByTestId('confirmModalConfirmButton');
    fireEvent.click(confirmButton);
    // Wait for modal to close
    await waitFor(() => {
      expect(screen.queryByTestId('deletePolicyModal')).not.toBeInTheDocument();
    });
  };

  const clickExecutePolicyAt = async (index: number) => {
    const rows = new EuiTableTestHarness('enrichPoliciesTable').getRows();
    const dataRow = rows[index] ?? null;
    const executeButton = within(dataRow).getByTestId('executePolicyButton');
    fireEvent.click(executeButton);
    await screen.findByTestId('executePolicyModal');
  };

  const clickConfirmExecutePolicyButton = async () => {
    const modal = screen.getByTestId('executePolicyModal');
    const confirmButton = within(modal).getByTestId('confirmModalConfirmButton');
    fireEvent.click(confirmButton);
    // Wait for modal to close
    await waitFor(() => {
      expect(screen.queryByTestId('executePolicyModal')).not.toBeInTheDocument();
    });
  };

  const clickEnrichPolicyAt = async (index: number) => {
    const rows = new EuiTableTestHarness('enrichPoliciesTable').getRows();
    const dataRow = rows[index] ?? null;
    const policyLink = within(dataRow).getByTestId('enrichPolicyDetailsLink');
    fireEvent.click(policyLink);
    await screen.findByTestId('policyDetailsFlyout');
  };

  return {
    goToEnrichPoliciesTab,
    clickReloadPoliciesButton,
    clickDeletePolicyAt,
    clickConfirmDeletePolicyButton,
    clickExecutePolicyAt,
    clickConfirmExecutePolicyButton,
    clickEnrichPolicyAt,
  };
};

/**
 * Helper to get the number of rows in the enrich policies table.
 */
export const getEnrichPoliciesTableRowCount = (): number => {
  return screen.getAllByTestId('enrichPolicyDetailsLink').length;
};
