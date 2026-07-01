/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiProvider } from '@elastic/eui';
import { fireEvent, render } from '@testing-library/react';

import type { DataSetWithName } from '../../common';
import type { DataSource } from '../../common';
import { CreateDatasetFlyout } from './create_dataset_flyout';

const renderFlyout = ({
  initialDataSet,
  dataSources,
  existingDataSetNames,
  onSave,
}: {
  initialDataSet?: DataSetWithName;
  dataSources: DataSource[];
  existingDataSetNames: readonly string[];
  onSave: jest.Mock;
}) =>
  render(
    <EuiProvider>
      <CreateDatasetFlyout
        initialDataSet={initialDataSet}
        existingDataSetNames={existingDataSetNames}
        dataSources={dataSources}
        onClose={jest.fn()}
        onSave={onSave}
      />
    </EuiProvider>
  );

describe('CreateDatasetFlyout', () => {
  const dataSources: DataSource[] = [
    { name: 'source-1', type: 's3', description: '', settings: {} },
  ];

  it('does not render resource/settings until a data source is selected', () => {
    const { queryByTestId, getByTestId } = renderFlyout({
      dataSources,
      existingDataSetNames: [],
      onSave: jest.fn().mockResolvedValue(null),
    });

    expect(queryByTestId('createDatasetFlyoutResource')).toBeNull();
    expect(queryByTestId('createDatasetFlyoutSettingsFormat')).toBeNull();
    expect(queryByTestId('createDatasetFlyoutAdvancedSettingsToggle')).toBeNull();

    fireEvent.change(getByTestId('createDatasetFlyoutDataSource'), {
      target: { value: 'source-1' },
    });

    expect(queryByTestId('createDatasetFlyoutResource')).not.toBeNull();
    expect(queryByTestId('createDatasetFlyoutSettingsFormat')).not.toBeNull();
    expect(queryByTestId('createDatasetFlyoutAdvancedSettingsToggle')).not.toBeNull();
  });
});
