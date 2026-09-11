/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import { I18nProvider } from '@kbn/i18n-react';

import { TypeFilter, TYPE_FILTER_SCHEDULED, TYPE_FILTER_MANUALLY_GENERATED } from './type_filter';
import { useKibana } from '../../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../../common/lib/telemetry';

jest.mock('../../../../common/lib/kibana');

const TestProviders: FC<PropsWithChildren> = ({ children }) => (
  <I18nProvider>
    <EuiProvider highContrastMode={false}>{children}</EuiProvider>
  </I18nProvider>
);

const defaultProps = {
  selectedTypes: [],
  setSelectedTypes: jest.fn(),
};

const openTypeFilter = () => fireEvent.click(screen.getByTestId('typeFilterButton'));

describe('TypeFilter', () => {
  const reportEvent = jest.fn();

  beforeEach(() => {
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        telemetry: {
          reportEvent,
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    render(
      <TestProviders>
        <TypeFilter {...defaultProps} />
      </TestProviders>
    );

    expect(screen.getByTestId('typeFilterButton')).toBeInTheDocument();
  });

  it('opens popover on button click', async () => {
    render(
      <TestProviders>
        <TypeFilter {...defaultProps} />
      </TestProviders>
    );

    openTypeFilter();

    await waitFor(() => {
      expect(screen.getByTestId('typeFilterSelectable')).toBeInTheDocument();
    });
  });

  it('renders options correctly', async () => {
    render(
      <TestProviders>
        <TypeFilter {...defaultProps} />
      </TestProviders>
    );

    openTypeFilter();

    await waitFor(() => {
      expect(screen.getByTestId(`typeFilterOption-${TYPE_FILTER_SCHEDULED}`)).toBeInTheDocument();
      expect(
        screen.getByTestId(`typeFilterOption-${TYPE_FILTER_MANUALLY_GENERATED}`)
      ).toBeInTheDocument();
    });
  });

  it('calls setSelectedTypes and reports telemetry when an option is selected', async () => {
    render(
      <TestProviders>
        <TypeFilter {...defaultProps} />
      </TestProviders>
    );

    openTypeFilter();

    await waitFor(() => {
      expect(screen.getByTestId(`typeFilterOption-${TYPE_FILTER_SCHEDULED}`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`typeFilterOption-${TYPE_FILTER_SCHEDULED}`));

    expect(defaultProps.setSelectedTypes).toHaveBeenCalledWith([TYPE_FILTER_SCHEDULED]);
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.TypeFilterChanged, {
      types: [TYPE_FILTER_SCHEDULED],
    });
  });

  it('shows active filters count on button', () => {
    render(
      <TestProviders>
        <TypeFilter {...defaultProps} selectedTypes={[TYPE_FILTER_SCHEDULED]} />
      </TestProviders>
    );

    expect(screen.getByTestId('typeFilterButton')).toHaveTextContent('Type1');
  });
});
