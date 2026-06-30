/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { IlmPhaseFilter } from '.';
import {
  TestDataQualityProviders,
  TestExternalProviders,
} from '../../mock/test_providers/test_providers';
import {
  COLD_DESCRIPTION,
  FROZEN_DESCRIPTION,
  HOT_DESCRIPTION,
  INDEX_LIFECYCLE_MANAGEMENT_PHASES,
  UNMANAGED_DESCRIPTION,
  WARM_DESCRIPTION,
} from '../../translations';

describe('IlmPhaseFilter', () => {
  it('renders combobox with ilmPhase label and preselected hot, warm, unmanaged options', () => {
    render(
      <TestExternalProviders>
        <TestDataQualityProviders>
          <IlmPhaseFilter />
        </TestDataQualityProviders>
      </TestExternalProviders>
    );
    expect(screen.getByTestId('selectIlmPhases')).toBeInTheDocument();
    expect(screen.getByTestId('comboBoxSearchInput')).toBeInTheDocument();
    expect(screen.getByText('hot')).toBeInTheDocument();
    expect(screen.getByText('warm')).toBeInTheDocument();
    expect(screen.getByText('unmanaged')).toBeInTheDocument();
  });

  it('does not preselect disabled cold, frozen options', () => {
    render(
      <TestExternalProviders>
        <TestDataQualityProviders>
          <IlmPhaseFilter />
        </TestDataQualityProviders>
      </TestExternalProviders>
    );
    expect(screen.queryByText('cold')).not.toBeInTheDocument();
    expect(screen.queryByText('frozen')).not.toBeInTheDocument();
  });

  describe('when dropdown opened', () => {
    it('shows remaining disabled options', async () => {
      render(
        <TestExternalProviders>
          <TestDataQualityProviders>
            <IlmPhaseFilter />
          </TestDataQualityProviders>
        </TestExternalProviders>
      );
      const searchInput = screen.getByTestId('comboBoxSearchInput');

      await userEvent.click(searchInput);

      expect(screen.getByTitle('frozen')).toHaveAttribute('role', 'option');
      expect(screen.getByTitle('frozen')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTitle('cold')).toHaveAttribute('role', 'option');
      expect(screen.getByTitle('cold')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('when hovering over search input', () => {
    it('shows a tooltip with the ilm check description', async () => {
      render(
        <TestExternalProviders>
          <TestDataQualityProviders>
            <IlmPhaseFilter />
          </TestDataQualityProviders>
        </TestExternalProviders>
      );

      fireEvent.mouseOver(screen.getByTestId('comboBoxSearchInput'));

      await waitFor(() =>
        expect(
          screen.getByText(INDEX_LIFECYCLE_MANAGEMENT_PHASES).closest('[role="tooltip"]')
        ).toBeInTheDocument()
      );
    });
  });

  describe('when hovering over options in dropdown', () => {
    describe.each([
      { option: 'hot', tooltipDescription: HOT_DESCRIPTION },
      { option: 'warm', tooltipDescription: WARM_DESCRIPTION },
      { option: 'unmanaged', tooltipDescription: UNMANAGED_DESCRIPTION },
      {
        option: 'cold',
        tooltipDescription: COLD_DESCRIPTION,
      },
      {
        option: 'frozen',
        tooltipDescription: FROZEN_DESCRIPTION,
      },
    ])('when hovering over $option option', ({ option, tooltipDescription }) => {
      it(`shows a tooltip with the ${option} description`, async () => {
        render(
          <TestExternalProviders>
            <TestDataQualityProviders
              dataQualityContextProps={{
                selectedIlmPhaseOptions: [],
              }}
            >
              <IlmPhaseFilter />
            </TestDataQualityProviders>
          </TestExternalProviders>
        );

        expect(screen.getByPlaceholderText('Select one or more ILM phases')).toBeInTheDocument();

        const searchInput = screen.getByTestId('comboBoxSearchInput');
        await userEvent.click(searchInput);

        expect(screen.getByText(tooltipDescription)).toBeInTheDocument();
      });
    });
  });
});
