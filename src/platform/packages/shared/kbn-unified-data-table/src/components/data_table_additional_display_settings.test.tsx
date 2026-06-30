/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UnifiedDataTableAdditionalDisplaySettingsProps } from './data_table_additional_display_settings';
import lodash from 'lodash';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { RowHeightMode } from './row_height_settings';
import { UnifiedDataTableAdditionalDisplaySettings } from './data_table_additional_display_settings';

jest.spyOn(lodash, 'debounce').mockImplementation((fn: any) => fn);

const defaultDisplaySettingsProps = {
  headerLineCountInput: 5,
  headerRowHeight: RowHeightMode.custom,
  lineCountInput: 10,
  rowHeight: RowHeightMode.custom,
  sampleSize: 10,
};

const getSampleSizeNumberInput = () => screen.getByRole('spinbutton', { name: 'Sample size' });

const renderDisplaySettings = (
  props: Partial<UnifiedDataTableAdditionalDisplaySettingsProps> = {}
) => {
  return render(
    <UnifiedDataTableAdditionalDisplaySettings {...defaultDisplaySettingsProps} {...props} />
  );
};

const replaceNumberInputValue = async (input: HTMLElement, value: string) => {
  await userEvent.clear(input);
  await userEvent.click(input);
  await userEvent.paste(value);
};

describe('UnifiedDataTableAdditionalDisplaySettings', () => {
  describe('sampleSize', () => {
    it('should work correctly', async () => {
      const onChangeSampleSizeMock = jest.fn();

      renderDisplaySettings({
        sampleSize: 10,
        onChangeSampleSize: onChangeSampleSizeMock,
      });

      expect(screen.getByText('Sample size')).toBeVisible();

      const input = getSampleSizeNumberInput();
      expect(input).toHaveValue(10);
      expect(input).toHaveAttribute('step', '10');

      await replaceNumberInputValue(input, '100');

      expect(onChangeSampleSizeMock).toHaveBeenLastCalledWith(100);

      expect(getSampleSizeNumberInput()).toHaveValue(100);
    });

    it('should not execute the callback for an invalid input', async () => {
      const invalidValue = 600;
      const onChangeSampleSizeMock = jest.fn();

      renderDisplaySettings({
        maxAllowedSampleSize: 500,
        onChangeSampleSize: onChangeSampleSizeMock,
        sampleSize: 50,
      });

      const input = getSampleSizeNumberInput();
      expect(screen.getByText('Sample size')).toBeVisible();
      expect(input).toHaveValue(50);

      await replaceNumberInputValue(input, String(invalidValue));

      expect(getSampleSizeNumberInput()).toHaveValue(invalidValue);

      expect(onChangeSampleSizeMock).not.toHaveBeenCalled();
    });

    it('should render value changes correctly', async () => {
      const onChangeSampleSizeMock = jest.fn();

      const { rerender } = renderDisplaySettings({
        onChangeSampleSize: onChangeSampleSizeMock,
        sampleSize: 200,
      });

      expect(getSampleSizeNumberInput()).toHaveValue(200);

      rerender(
        <UnifiedDataTableAdditionalDisplaySettings
          {...defaultDisplaySettingsProps}
          onChangeSampleSize={onChangeSampleSizeMock}
          sampleSize={500}
        />
      );

      expect(getSampleSizeNumberInput()).toHaveValue(500);

      expect(onChangeSampleSizeMock).not.toHaveBeenCalled();
    });

    it('should only render integers when a decimal value is provided', async () => {
      const invalidDecimalValue = 6.11;
      const validIntegerValue = 6;
      const onChangeSampleSizeMock = jest.fn();

      renderDisplaySettings({
        maxAllowedSampleSize: 500,
        sampleSize: 50,
        onChangeSampleSize: onChangeSampleSizeMock,
      });

      const input = getSampleSizeNumberInput();
      expect(input).toHaveValue(50);
      expect(screen.getByText('Sample size')).toBeVisible();

      await replaceNumberInputValue(input, String(invalidDecimalValue));

      expect(getSampleSizeNumberInput()).toHaveValue(validIntegerValue);
    });

    it('should not fail if sample size is not step of 10', async () => {
      const onChangeSampleSizeMock = jest.fn();

      const customSampleSize = 9995;
      const newSampleSize = 9990;

      renderDisplaySettings({
        maxAllowedSampleSize: customSampleSize,
        onChangeSampleSize: onChangeSampleSizeMock,
        sampleSize: customSampleSize,
      });

      let input = getSampleSizeNumberInput();
      expect(input).toHaveValue(customSampleSize);
      expect(input).toHaveAttribute('step', '1');
      expect(screen.getByText('Sample size')).toBeVisible();

      await replaceNumberInputValue(input, String(newSampleSize));

      input = getSampleSizeNumberInput();
      expect(input).toHaveValue(newSampleSize);
      expect(input).toHaveAttribute('step', '1');

      expect(onChangeSampleSizeMock).toHaveBeenLastCalledWith(newSampleSize);
    });

    it('should not fail if sample size is less than 10', async () => {
      const onChangeSampleSizeMock = jest.fn();

      const customSampleSize = 5;
      const newSampleSize = 10;

      renderDisplaySettings({
        onChangeSampleSize: onChangeSampleSizeMock,
        sampleSize: customSampleSize,
      });

      let input = getSampleSizeNumberInput();
      expect(input).toHaveValue(customSampleSize);
      expect(input).toHaveAttribute('step', '1');
      expect(screen.getByText('Sample size')).toBeVisible();

      await replaceNumberInputValue(input, String(newSampleSize));

      input = getSampleSizeNumberInput();
      expect(input).toHaveValue(newSampleSize);
      expect(input).toHaveAttribute('step', '1');

      expect(onChangeSampleSizeMock).toHaveBeenLastCalledWith(newSampleSize);
    });
  });

  describe('rowHeight', () => {
    it('should render rowHeight if onChangeRowHeight and onChangeRowHeightLines are defined', () => {
      renderDisplaySettings({
        onChangeRowHeight: jest.fn(),
        onChangeRowHeightLines: jest.fn(),
      });

      expect(screen.getByTestId('unifiedDataTableRowHeightSettings')).toBeVisible();
      expect(
        screen.getByTestId('unifiedDataTableRowHeightSettings_rowHeight_custom')
      ).toBeVisible();
      expect(screen.getByTestId('unifiedDataTableRowHeightSettings_rowHeight_auto')).toBeVisible();
    });

    it('should not render rowHeight if onChangeRowHeight and onChangeRowHeightLines are undefined', () => {
      renderDisplaySettings();

      expect(screen.queryByTestId('unifiedDataTableRowHeightSettings')).not.toBeInTheDocument();
    });

    it('should call onChangeRowHeight and onChangeRowHeightLines when the rowHeight changes', async () => {
      const onChangeRowHeight = jest.fn();
      const onChangeRowHeightLines = jest.fn();

      const { rerender } = renderDisplaySettings({
        onChangeRowHeight,
        onChangeRowHeightLines,
      });

      expect(screen.getByTestId('unifiedDataTableRowHeightSettings')).toBeVisible();

      const input = screen.getByTestId('unifiedDataTableRowHeightSettings_lineCountNumber');

      await userEvent.clear(input);

      rerender(
        <UnifiedDataTableAdditionalDisplaySettings
          {...defaultDisplaySettingsProps}
          lineCountInput={0}
          onChangeRowHeight={onChangeRowHeight}
          onChangeRowHeightLines={onChangeRowHeightLines}
        />
      );

      await userEvent.click(input);
      await userEvent.paste('5');

      expect(onChangeRowHeightLines).toHaveBeenCalledWith(5, true);

      await userEvent.click(screen.getByTestId('unifiedDataTableRowHeightSettings_rowHeight_auto'));

      expect(onChangeRowHeight).toHaveBeenCalledWith('auto');
    });
  });

  describe('headerRowHeight', () => {
    it('should render headerRowHeight if onChangeHeaderRowHeight and onChangeHeaderRowHeightLines are defined', () => {
      renderDisplaySettings({
        onChangeHeaderRowHeight: jest.fn(),
        onChangeHeaderRowHeightLines: jest.fn(),
      });

      expect(screen.getByTestId('unifiedDataTableHeaderRowHeightSettings')).toBeVisible();
    });

    it('should not render headerRowHeight if onChangeHeaderRowHeight and onChangeHeaderRowHeightLines are undefined', () => {
      renderDisplaySettings();

      expect(
        screen.queryByTestId('unifiedDataTableHeaderRowHeightSettings')
      ).not.toBeInTheDocument();
    });

    it('should call onChangeHeaderRowHeight and onChangeHeaderRowHeightLines when the headerRowHeight changes', async () => {
      const onChangeHeaderRowHeight = jest.fn();
      const onChangeHeaderRowHeightLines = jest.fn();

      const { rerender } = renderDisplaySettings({
        onChangeHeaderRowHeight,
        onChangeHeaderRowHeightLines,
      });

      expect(screen.getByTestId('unifiedDataTableHeaderRowHeightSettings')).toBeVisible();

      const input = screen.getByTestId('unifiedDataTableHeaderRowHeightSettings_lineCountNumber');
      await userEvent.clear(input);

      rerender(
        <UnifiedDataTableAdditionalDisplaySettings
          {...defaultDisplaySettingsProps}
          headerLineCountInput={0}
          onChangeHeaderRowHeight={onChangeHeaderRowHeight}
          onChangeHeaderRowHeightLines={onChangeHeaderRowHeightLines}
        />
      );

      await userEvent.click(input);
      await userEvent.paste('3');

      expect(onChangeHeaderRowHeightLines).toHaveBeenCalledWith(3, true);

      await userEvent.click(
        screen.getByTestId('unifiedDataTableHeaderRowHeightSettings_rowHeight_auto')
      );

      expect(onChangeHeaderRowHeight).toHaveBeenCalledWith('auto');
    });
  });
});
