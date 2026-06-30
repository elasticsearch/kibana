/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { faker } from '@faker-js/faker';
import {
  SNAPSHOT_CUSTOM_AGGREGATIONS,
  type SnapshotCustomMetricInput,
} from '../../../../../../../common/http_api';
import { SNAPSHOT_API_MAX_METRICS } from '../../../../../../../common/constants';
import { WaffleMetricControls } from '.';
import userEvent from '@testing-library/user-event';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';

const renderWithProviders = (children: React.ReactNode) =>
  render(<IntlProvider>{children}</IntlProvider>);

const createMockMetric = () => ({
  text: faker.string.alpha(15),
  value: faker.string.alpha(15),
});

const createMockCustomMetric = (): SnapshotCustomMetricInput => ({
  type: 'custom',
  field: faker.string.alpha(15),
  aggregation: faker.helpers.arrayElement(SNAPSHOT_CUSTOM_AGGREGATIONS),
  label: faker.string.alpha(15),
  id: faker.string.uuid(),
});

describe('WaffleMetricControls', () => {
  it(`doesn't allow adding more metrics when there are already ${SNAPSHOT_API_MAX_METRICS} metrics`, async () => {
    const user = userEvent.setup();

    const options = Array.from(
      { length: Math.floor(SNAPSHOT_API_MAX_METRICS / 2) },
      createMockMetric
    );
    const customMetrics = Array.from(
      { length: Math.ceil(SNAPSHOT_API_MAX_METRICS / 2) },
      createMockCustomMetric
    );

    renderWithProviders(
      <WaffleMetricControls
        options={options}
        metric={customMetrics[0]}
        onChange={jest.fn()}
        onChangeCustomMetrics={jest.fn()}
        customMetrics={customMetrics}
      />
    );

    const dropdownButton = screen.getByTestId('infraInventoryMetricDropdown');
    await user.click(dropdownButton);

    const modeSwitcher = screen.getByTestId('infraModeSwitcherAddMetricButton');
    expect(modeSwitcher).toBeDisabled();
  });
});
