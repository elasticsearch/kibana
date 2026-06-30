/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import type { RowHeightSettingsProps } from '../..';
import { RowHeightSettings } from '../..';

const renderRowHeightSettings = ({
  maxRowHeight,
  onChangeRowHeightLines,
}: {
  maxRowHeight?: number;
  onChangeRowHeightLines?: jest.Mock;
} = {}) => {
  const Wrapper = () => {
    const [rowHeight, setRowHeight] = useState<RowHeightSettingsProps['rowHeight']>();
    const [lineCount, setLineCount] = useState<number>(3);

    const onChange = (value: number) => {
      setLineCount(value);
      onChangeRowHeightLines?.(value);
    };

    return (
      <RowHeightSettings
        label="Row height"
        rowHeight={rowHeight}
        maxRowHeight={maxRowHeight}
        onChangeRowHeight={setRowHeight}
        onChangeLineCountInput={onChange}
        data-test-subj="rowHeightSettings"
        lineCountInput={lineCount}
      />
    );
  };

  return render(<Wrapper />);
};

describe('RowHeightSettings', () => {
  it('should set rowHight to Custom by default', async () => {
    renderRowHeightSettings();
    expect(screen.getByTestId('rowHeightSettings_rowHeight_auto')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByTestId('rowHeightSettings_rowHeight_custom')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('should set rowHeight when the selected button changes', async () => {
    renderRowHeightSettings();
    expect(screen.getByTestId('rowHeightSettings_rowHeight_auto')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByTestId('rowHeightSettings_rowHeight_custom')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await userEvent.click(screen.getByTestId('rowHeightSettings_rowHeight_auto'));
    expect(screen.getByTestId('rowHeightSettings_rowHeight_auto')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('rowHeightSettings_rowHeight_custom')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await userEvent.click(screen.getByTestId('rowHeightSettings_rowHeight_custom'));
    expect(screen.getByTestId('rowHeightSettings_rowHeight_auto')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByTestId('rowHeightSettings_rowHeight_custom')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('should disable FieldNumber when Auto is selected', async () => {
    renderRowHeightSettings();
    await userEvent.click(screen.getByTestId('rowHeightSettings_rowHeight_auto'));
    expect(screen.getByTestId('rowHeightSettings_lineCountNumber')).toBeDisabled();
  });

  it('field number should persevere previously selected Custom number after changing rowHight to Auto', async () => {
    renderRowHeightSettings();

    const fieldNumber = screen.getByTestId('rowHeightSettings_lineCountNumber');
    expect(fieldNumber).toHaveValue(3);
    fireEvent.change(fieldNumber, {
      target: { value: 10 },
    });
    expect(fieldNumber).toHaveValue(10);

    await userEvent.click(screen.getByTestId('rowHeightSettings_rowHeight_auto'));

    expect(fieldNumber).toHaveValue(10);
  });
});
