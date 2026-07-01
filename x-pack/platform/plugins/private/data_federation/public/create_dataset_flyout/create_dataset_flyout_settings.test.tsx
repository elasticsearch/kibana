/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiProvider } from '@elastic/eui';
import { fireEvent, render } from '@testing-library/react';
import { useForm, useWatch } from 'react-hook-form';

import { CreateDatasetFlyoutSettings } from './create_dataset_flyout_settings';
import type { CreateDatasetFormValues } from './create_dataset_flyout_form_state';
import { emptyCreateDatasetSettingsFormValues } from './create_dataset_flyout_form_state';

const renderSettings = () => {
  const Wrapper = () => {
    const { control } = useForm<CreateDatasetFormValues>({
      defaultValues: {
        name: '',
        description: '',
        data_source: '',
        resource: '',
        settings: emptyCreateDatasetSettingsFormValues(),
      },
    });

    const settings = useWatch({ control, name: 'settings' });

    return (
      <EuiProvider>
        <CreateDatasetFlyoutSettings control={control} />
        <div data-test-subj="settingsValue">{JSON.stringify(settings)}</div>
      </EuiProvider>
    );
  };

  return render(<Wrapper />);
};

const getSettingsValue = (getByTestId: ReturnType<typeof render>['getByTestId']) =>
  JSON.parse(getByTestId('settingsValue').textContent ?? '{}');

const openAdvanced = (getByTestId: ReturnType<typeof render>['getByTestId']) =>
  fireEvent.click(getByTestId('createDatasetFlyoutAdvancedSettingsToggle'));

describe('CreateDatasetFlyoutSettings', () => {
  it('shows the format select at the top level without opening anything', () => {
    const { getByTestId } = renderSettings();
    expect(getByTestId('createDatasetFlyoutSettingsFormat')).toBeVisible();
  });

  it('hides the advanced section by default and shows it when toggled', () => {
    const { getByTestId } = renderSettings();

    const toggle = getByTestId('createDatasetFlyoutAdvancedSettingsToggle');
    const partitionDetection = getByTestId('createDatasetFlyoutSettingsPartitionDetection');

    expect(partitionDetection).not.toBeVisible();
    fireEvent.click(toggle);
    expect(partitionDetection).toBeVisible();
  });

  it('updates format in form state', () => {
    const { getByTestId } = renderSettings();

    fireEvent.change(getByTestId('createDatasetFlyoutSettingsFormat'), {
      target: { value: 'parquet' },
    });

    expect(getSettingsValue(getByTestId)).toMatchObject({ format: 'parquet' });
  });

  it('updates partition_detection in form state', () => {
    const { getByTestId } = renderSettings();

    openAdvanced(getByTestId);
    fireEvent.change(getByTestId('createDatasetFlyoutSettingsPartitionDetection'), {
      target: { value: 'hive' },
    });

    expect(getSettingsValue(getByTestId)).toMatchObject({ partition_detection: 'hive' });
  });

  it('shows no format-specific fields when no format is selected', () => {
    const { queryByTestId } = renderSettings();
    // format-specific fields are not in the DOM until a format is chosen
    expect(queryByTestId('createDatasetFlyoutSettingsDelimiter')).toBeNull();
    expect(queryByTestId('createDatasetFlyoutSettingsSchemaSampleSize')).toBeNull();
    expect(queryByTestId('createDatasetFlyoutSettingsOptimizedReader')).toBeNull();
  });

  describe('CSV format', () => {
    it('shows CSV fields inside the advanced section', () => {
      const { getByTestId } = renderSettings();

      fireEvent.change(getByTestId('createDatasetFlyoutSettingsFormat'), {
        target: { value: 'csv' },
      });
      openAdvanced(getByTestId);

      expect(getByTestId('createDatasetFlyoutSettingsDelimiter')).toBeVisible();
      expect(getByTestId('createDatasetFlyoutSettingsMode')).toBeVisible();
      expect(getByTestId('createDatasetFlyoutSettingsHeaderRow')).toBeVisible();
      expect(getByTestId('createDatasetFlyoutSettingsSchemaSampleSize')).toBeVisible();
      expect(getByTestId('createDatasetFlyoutSettingsMaxErrors')).toBeVisible();
    });

    it('updates a CSV field in form state', () => {
      const { getByTestId } = renderSettings();

      fireEvent.change(getByTestId('createDatasetFlyoutSettingsFormat'), {
        target: { value: 'csv' },
      });
      openAdvanced(getByTestId);
      fireEvent.change(getByTestId('createDatasetFlyoutSettingsDelimiter'), {
        target: { value: '|' },
      });

      expect(getSettingsValue(getByTestId)).toMatchObject({ delimiter: '|' });
    });
  });

  describe('NDJSON format', () => {
    it('shows schema_sample_size and segment_size inside the advanced section', () => {
      const { getByTestId } = renderSettings();

      fireEvent.change(getByTestId('createDatasetFlyoutSettingsFormat'), {
        target: { value: 'ndjson' },
      });
      openAdvanced(getByTestId);

      expect(getByTestId('createDatasetFlyoutSettingsSchemaSampleSize')).toBeVisible();
      expect(getByTestId('createDatasetFlyoutSettingsSegmentSize')).toBeVisible();
    });
  });

  describe('Parquet format', () => {
    it('shows optimized_reader and late_materialization inside the advanced section', () => {
      const { getByTestId } = renderSettings();

      fireEvent.change(getByTestId('createDatasetFlyoutSettingsFormat'), {
        target: { value: 'parquet' },
      });
      openAdvanced(getByTestId);

      expect(getByTestId('createDatasetFlyoutSettingsOptimizedReader')).toBeVisible();
      expect(getByTestId('createDatasetFlyoutSettingsLateMaterialization')).toBeVisible();
    });
  });
});
