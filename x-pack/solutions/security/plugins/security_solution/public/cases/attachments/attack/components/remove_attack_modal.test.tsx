/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID,
  REMOVE_ATTACK_ALERTS_EXPLANATION_TEST_ID,
  REMOVE_ATTACK_MODAL_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';
import { TestProviders } from '../../../../common/mock/test_providers';
import type { RemoveAttackModalProps } from './remove_attack_modal';
import { RemoveAttackModal } from './remove_attack_modal';

describe('RemoveAttackModal', () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();

  const defaultProps: RemoveAttackModalProps = {
    attackTitle: 'Credential dumping on host-1',
    alertCount: 3,
    isResolvable: true,
    isLoading: false,
    onCancel,
    onConfirm,
  };

  beforeEach(() => jest.clearAllMocks());

  const renderModal = (overrides: Partial<RemoveAttackModalProps> = {}) =>
    render(
      <TestProviders>
        <RemoveAttackModal {...defaultProps} {...overrides} />
      </TestProviders>
    );

  it('names the attack being removed', () => {
    renderModal();

    expect(screen.getByTestId(REMOVE_ATTACK_MODAL_TEST_ID)).toBeInTheDocument();
    expect(screen.getByText('Credential dumping on host-1')).toBeInTheDocument();
  });

  it('offers a checked checkbox stating how many alerts would be removed', () => {
    renderModal();

    const checkbox = screen.getByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID);
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeEnabled();
    expect(screen.getByLabelText('Also remove 3 related alerts')).toBe(checkbox);
  });

  it('labels a single removable alert in the singular', () => {
    renderModal({ alertCount: 1 });

    expect(screen.getByLabelText('Also remove 1 related alert')).toBeInTheDocument();
  });

  it('confirms with the related alerts when the checkbox is left as it is', async () => {
    renderModal();

    await userEvent.click(screen.getByText('Remove'));

    expect(onConfirm).toHaveBeenCalledWith({ removeRelatedAlerts: true });
  });

  it('confirms without the related alerts once the checkbox is unchecked', async () => {
    renderModal();

    await userEvent.click(screen.getByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID));
    await userEvent.click(screen.getByText('Remove'));

    expect(onConfirm).toHaveBeenCalledWith({ removeRelatedAlerts: false });
  });

  it('removes nothing when cancelled', async () => {
    renderModal();

    await userEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is reachable by keyboard: tabbing reaches the checkbox and space toggles it', async () => {
    renderModal();

    const checkbox = screen.getByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID);
    // Tab until the checkbox has focus, so the assertion holds regardless of how many focusable
    // elements the modal chrome puts before it.
    for (let i = 0; i < 10 && document.activeElement !== checkbox; i++) {
      await userEvent.tab();
    }
    expect(checkbox).toHaveFocus();

    await userEvent.keyboard(' ');
    expect(checkbox).not.toBeChecked();
  });

  it('disables the checkbox and explains why when the attack cannot be resolved', () => {
    renderModal({ isResolvable: false, alertCount: 0 });

    const checkbox = screen.getByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID);
    expect(checkbox).toBeDisabled();
    // Nothing is removable, so the default tick is not shown as though something were.
    expect(checkbox).not.toBeChecked();
    expect(screen.getByTestId(REMOVE_ATTACK_ALERTS_EXPLANATION_TEST_ID)).toHaveTextContent(
      'could not be determined'
    );
  });

  it('disables the checkbox and explains why when nothing is removable', () => {
    renderModal({ isResolvable: true, alertCount: 0 });

    const checkbox = screen.getByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID);
    expect(checkbox).toBeDisabled();
    // The default tick is not shown when there is nothing for it to take.
    expect(checkbox).not.toBeChecked();
    expect(screen.getByTestId(REMOVE_ATTACK_ALERTS_EXPLANATION_TEST_ID)).toHaveTextContent(
      'None of this attack’s alerts can be removed with it'
    );
  });

  it.each([
    ['the attack cannot be resolved', { isResolvable: false, alertCount: 0 }],
    ['nothing is removable', { isResolvable: true, alertCount: 0 }],
  ])('confirms without the related alerts when %s', async (_, overrides) => {
    renderModal(overrides);

    await userEvent.click(screen.getByText('Remove'));

    expect(onConfirm).toHaveBeenCalledWith({ removeRelatedAlerts: false });
  });

  it('never confirms the related alerts when the resolution turned unresolvable after checking', async () => {
    const { rerender } = renderModal();

    rerender(
      <TestProviders>
        <RemoveAttackModal {...defaultProps} isResolvable={false} alertCount={0} />
      </TestProviders>
    );
    await userEvent.click(screen.getByText('Remove'));

    expect(onConfirm).toHaveBeenCalledWith({ removeRelatedAlerts: false });
  });

  it('shows the resolution is still running instead of the checkbox', () => {
    renderModal({ isLoading: true });

    expect(screen.queryByTestId(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID)).not.toBeInTheDocument();
    expect(screen.getByTestId(REMOVE_ATTACK_ALERTS_EXPLANATION_TEST_ID)).toHaveTextContent(
      'Checking which alerts can be removed'
    );
  });
});
