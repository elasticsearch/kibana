/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { EditDeletePhaseFlyout } from './edit_delete_phase_flyout';

const DATA_TEST_SUBJ = 'streamsEditDeletePhaseFlyout';

const renderFlyout = (props: Partial<React.ComponentProps<typeof EditDeletePhaseFlyout>> = {}) => {
  const onSave = jest.fn();
  const onClose = jest.fn();
  const onChange = jest.fn();

  render(
    <I18nProvider>
      <EditDeletePhaseFlyout
        initialValue={{
          deletePhaseEnabled: true,
          dataRetention: '30d',
          isDefaultRetention: false,
        }}
        onSave={onSave}
        onClose={onClose}
        onChange={onChange}
        onChangeDebounceMs={0}
        {...props}
      />
    </I18nProvider>
  );

  return {
    onSave,
    onClose,
    onChange,
  };
};

describe('EditDeletePhaseFlyout', () => {
  it('renders the delete phase form from the initial retention period', () => {
    renderFlyout({
      initialValue: {
        deletePhaseEnabled: true,
        dataRetention: '60d',
        isDefaultRetention: true,
      },
      defaultRetentionPeriod: '60d',
    });

    expect(screen.getByTestId(DATA_TEST_SUBJ)).toBeInTheDocument();
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`)).toHaveValue(60);
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterUnit`)).toHaveValue('d');
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}RestoreDefaultButton`)).toBeInTheDocument();
  });

  it('hides the restore default button when showRestoreDefaultButton is false', () => {
    renderFlyout({
      defaultRetentionPeriod: '60d',
      showRestoreDefaultButton: false,
    });

    expect(screen.queryByTestId(`${DATA_TEST_SUBJ}RestoreDefaultButton`)).not.toBeInTheDocument();
  });

  it('falls back to a default retention when the delete phase is disabled and no default retention exists', () => {
    renderFlyout({
      initialValue: { deletePhaseEnabled: false },
      defaultRetentionPeriod: undefined,
    });

    expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`)).toHaveValue(30);
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterUnit`)).toHaveValue('d');
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`)).toBeEnabled();
    expect(screen.queryByTestId(`${DATA_TEST_SUBJ}DeleteAfterError`)).not.toBeInTheDocument();
  });

  it('disables apply until the retention changes', () => {
    const { onSave } = renderFlyout();

    expect(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`)).toBeDisabled();

    fireEvent.click(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`));
    expect(onSave).toHaveBeenCalledTimes(0);
  });

  it('shows a loading apply button while saving', () => {
    renderFlyout({ isSaving: true });

    expect(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`)).toBeDisabled();
  });

  it('applies a custom retention period', async () => {
    const { onSave } = renderFlyout();
    const valueInput = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`);
    const unitSelect = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterUnit`);

    fireEvent.change(valueInput, { target: { value: '15' } });
    fireEvent.blur(valueInput);
    fireEvent.change(unitSelect, { target: { value: 'h' } });
    fireEvent.click(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        deletePhaseEnabled: true,
        dataRetention: '15h',
        isDefaultRetention: false,
      })
    );
  });

  it('emits draft changes for preview when the retention changes', async () => {
    const { onChange } = renderFlyout();

    const valueInput = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`);
    const unitSelect = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterUnit`);

    fireEvent.change(valueInput, { target: { value: '15' } });
    fireEvent.blur(valueInput);
    fireEvent.change(unitSelect, { target: { value: 'h' } });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        {
          deletePhaseEnabled: true,
          dataRetention: '15h',
          isDefaultRetention: false,
        },
        { invalidPhases: [] }
      )
    );
  });

  it('does not emit preview changes on initial mount', async () => {
    jest.useFakeTimers();
    try {
      const { onChange } = renderFlyout({ onChangeDebounceMs: 0 });

      act(() => {
        jest.runOnlyPendingTimers();
      });

      expect(onChange).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not emit an invalid preview value when the retention field is cleared', async () => {
    const { onChange } = renderFlyout();
    onChange.mockClear();

    const valueInput = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`);

    fireEvent.change(valueInput, { target: { value: '' } });
    fireEvent.blur(valueInput);

    await waitFor(() => expect(valueInput).toHaveValue(30));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits invalid meta without emitting an invalid preview value when delete after is negative', async () => {
    const { onChange } = renderFlyout();
    onChange.mockClear();

    const valueInput = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`);

    fireEvent.change(valueInput, { target: { value: '-1' } });
    fireEvent.blur(valueInput);

    await waitFor(() =>
      expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterError`)).toBeVisible()
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        {
          deletePhaseEnabled: true,
          dataRetention: '30d',
          isDefaultRetention: false,
        },
        { invalidPhases: ['delete'] }
      )
    );
  });

  it('debounces rapid draft changes for preview', async () => {
    jest.useFakeTimers();
    try {
      const { onChange } = renderFlyout({ onChangeDebounceMs: 100 });
      onChange.mockClear();

      const valueInput = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`);

      fireEvent.change(valueInput, { target: { value: '15' } });
      fireEvent.blur(valueInput);
      fireEvent.change(valueInput, { target: { value: '20' } });
      fireEvent.blur(valueInput);

      act(() => {
        jest.advanceTimersByTime(99);
      });
      expect(onChange).toHaveBeenCalledTimes(0);

      act(() => {
        jest.advanceTimersByTime(1);
      });

      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith(
          {
            deletePhaseEnabled: true,
            dataRetention: '20d',
            isDefaultRetention: false,
          },
          { invalidPhases: [] }
        )
      );
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('restores the default retention period', async () => {
    const { onSave } = renderFlyout({
      initialValue: {
        deletePhaseEnabled: true,
        dataRetention: '14d',
        isDefaultRetention: false,
      },
      defaultRetentionPeriod: '60d',
      showRestoreDefaultButton: true,
    });

    fireEvent.click(screen.getByTestId(`${DATA_TEST_SUBJ}RestoreDefaultButton`));

    expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`)).toHaveValue(60);
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterUnit`)).toHaveValue('d');

    fireEvent.click(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        deletePhaseEnabled: true,
        dataRetention: '60d',
        isDefaultRetention: true,
      })
    );
  });

  it('commits removing the delete phase immediately', () => {
    const { onSave } = renderFlyout();

    fireEvent.click(screen.getByTestId(`${DATA_TEST_SUBJ}RemoveDeletePhaseButton`));

    expect(onSave).toHaveBeenCalledWith({
      deletePhaseEnabled: false,
    });
  });

  it('disables removing the delete phase while saving', () => {
    const { onSave } = renderFlyout({ isSaving: true });

    const removeButton = screen.getByTestId(`${DATA_TEST_SUBJ}RemoveDeletePhaseButton`);
    expect(removeButton).toBeDisabled();

    fireEvent.click(removeButton);
    expect(onSave).toHaveBeenCalledTimes(0);
  });

  it('disables removing the delete phase while submitting', async () => {
    let resolveSave!: () => void;
    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const onSave = jest.fn(() => pendingSave);

    render(
      <I18nProvider>
        <EditDeletePhaseFlyout
          initialValue={{
            deletePhaseEnabled: true,
            dataRetention: '30d',
            isDefaultRetention: false,
          }}
          onSave={onSave}
          onClose={jest.fn()}
          onChange={jest.fn()}
          onChangeDebounceMs={0}
        />
      </I18nProvider>
    );

    // Make Apply enabled so we can trigger isSubmitting via handleSubmit().
    const valueInput = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`);
    fireEvent.change(valueInput, { target: { value: '15' } });
    fireEvent.blur(valueInput);

    const applyButton = screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`);
    await waitFor(() => expect(applyButton).toBeEnabled());

    fireEvent.click(applyButton);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const removeButton = screen.getByTestId(`${DATA_TEST_SUBJ}RemoveDeletePhaseButton`);
    await waitFor(() => expect(removeButton).toBeDisabled());

    fireEvent.click(removeButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    // Cleanup: resolve the submit so React Hook Form can settle.
    act(() => resolveSave());
    await waitFor(() => expect(applyButton).toBeEnabled());
  });

  it('validates that delete after is a non-negative integer', async () => {
    const { onSave } = renderFlyout();
    const valueInput = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`);

    fireEvent.change(valueInput, { target: { value: '-1' } });
    fireEvent.blur(valueInput);

    await waitFor(() =>
      expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterError`)).toBeVisible()
    );
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterError`)).toHaveTextContent(
      'A non-negative integer is required.'
    );
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`)).toBeDisabled();

    fireEvent.click(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`));
    expect(onSave).toHaveBeenCalledTimes(0);
  });

  it('allows delete after to be set to 0', async () => {
    const { onSave } = renderFlyout();
    const valueInput = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`);

    fireEvent.change(valueInput, { target: { value: '0' } });
    fireEvent.blur(valueInput);
    fireEvent.click(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        deletePhaseEnabled: true,
        dataRetention: '0d',
        isDefaultRetention: false,
      })
    );
  });

  it('shows and validates against a maximum retention period', async () => {
    const { onSave } = renderFlyout({
      maximumRetentionPeriod: '365d',
    });

    expect(
      screen.queryByTestId(`${DATA_TEST_SUBJ}RemoveDeletePhaseButton`)
    ).not.toBeInTheDocument();

    const valueInput = screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterValue`);
    fireEvent.change(valueInput, { target: { value: '366' } });
    fireEvent.blur(valueInput);

    await waitFor(() =>
      expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterError`)).toBeVisible()
    );
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterError`)).toHaveTextContent('365d');
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`)).toBeDisabled();

    fireEvent.click(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`));
    expect(onSave).toHaveBeenCalledTimes(0);
  });

  it('revalidates maximum retention when the unit changes', async () => {
    renderFlyout({
      initialValue: {
        deletePhaseEnabled: true,
        dataRetention: '1h',
        isDefaultRetention: false,
      },
      maximumRetentionPeriod: '23h',
    });

    fireEvent.change(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterUnit`), {
      target: { value: 'd' },
    });

    await waitFor(() => expect(screen.getByTestId(`${DATA_TEST_SUBJ}ApplyButton`)).toBeDisabled());
    expect(screen.getByTestId(`${DATA_TEST_SUBJ}DeleteAfterError`)).toHaveTextContent('23h');
  });

  it('calls onClose when cancelling', () => {
    const { onClose } = renderFlyout();

    fireEvent.click(screen.getByTestId(`${DATA_TEST_SUBJ}CancelButton`));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
