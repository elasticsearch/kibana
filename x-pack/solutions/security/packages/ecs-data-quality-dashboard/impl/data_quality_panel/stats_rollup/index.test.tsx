/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  TestDataQualityProviders,
  TestExternalProviders,
} from '../mock/test_providers/test_providers';
import { StatsRollup } from '.';

describe('StatsRollup', () => {
  it('should render properly formatted stats rollup', () => {
    render(
      <TestExternalProviders>
        <TestDataQualityProviders>
          <StatsRollup
            docsCount={1111111}
            incompatible={2222222}
            indices={3333333}
            indicesChecked={4444444}
            sizeInBytes={5555555}
          />
        </TestDataQualityProviders>
      </TestExternalProviders>
    );

    const container = screen.getByTestId('statsRollup');

    expect(container).toHaveTextContent('Incompatible fields2,222,222');
    expect(container).toHaveTextContent('Indices checked4,444,444');
    expect(container).toHaveTextContent('Indices3,333,333');
    expect(container).toHaveTextContent('Size5.3MB');
    expect(container).toHaveTextContent('Docs1,111,111');
  });

  describe.each([
    ['Docs', '--'],
    ['Incompatible fields', '--'],
    ['Indices', '0'],
    ['Indices checked', '--'],
  ])('when %s count is not provided', (statLabel, emptyText) => {
    it(`should render empty ${statLabel} stat`, () => {
      render(
        <TestExternalProviders>
          <TestDataQualityProviders>
            <StatsRollup />
          </TestDataQualityProviders>
        </TestExternalProviders>
      );

      const container = screen.getByTestId('statsRollup');

      expect(container).toHaveTextContent(`${statLabel}${emptyText}`);
    });
  });

  describe('when size count is not provided', () => {
    it('should not render size stat', () => {
      render(
        <TestExternalProviders>
          <TestDataQualityProviders>
            <StatsRollup
              docsCount={1111111}
              incompatible={2222222}
              indices={3333333}
              indicesChecked={4444444}
            />
          </TestDataQualityProviders>
        </TestExternalProviders>
      );

      const container = screen.getByTestId('statsRollup');

      expect(container).not.toHaveTextContent('Size');
    });
  });

  describe.each([
    [
      'Docs',
      'Total number of docs in indices matching this index pattern',
      'Total number of docs in all indices',
    ],
    [
      'Incompatible fields',
      'Total number of checked fields incompatible with ECS in indices matching this index pattern',
      'Total number of checked fields incompatible with ECS',
    ],
    ['Indices', 'Total number of indices matching this index pattern', 'Total number of indices'],
    [
      'Indices checked',
      'Total number of checked indices matching this index pattern',
      'Total number of checked indices',
    ],
    [
      'Size',
      'Total size of indices (excluding replicas) matching this index pattern',
      'Total size of indices (excluding replicas)',
    ],
  ])('%s count tooltips', (statLabelText, patternTooltipText, noPatternTooltipText) => {
    describe('when pattern is provided', () => {
      it('should render pattern specific tooltip', async () => {
        render(
          <TestExternalProviders>
            <TestDataQualityProviders>
              <StatsRollup
                docsCount={1111111}
                incompatible={2222222}
                indices={3333333}
                indicesChecked={4444444}
                pattern="my-pattern"
                sizeInBytes={5555555}
              />
            </TestDataQualityProviders>
          </TestExternalProviders>
        );

        await userEvent.hover(screen.getByText(statLabelText));

        await waitFor(() =>
          expect(
            screen
              .getByText(patternTooltipText.replace('{pattern}', 'my-pattern'))
              .closest('[role="tooltip"]')
          ).toBeInTheDocument()
        );
      });
    });

    describe('when pattern is not provided', () => {
      it('should render default tooltip', async () => {
        render(
          <TestExternalProviders>
            <TestDataQualityProviders>
              <StatsRollup
                docsCount={1111111}
                incompatible={2222222}
                indices={3333333}
                indicesChecked={4444444}
                sizeInBytes={5555555}
              />
            </TestDataQualityProviders>
          </TestExternalProviders>
        );

        await userEvent.hover(screen.getByText(statLabelText));

        await waitFor(() =>
          expect(
            screen.getByText(noPatternTooltipText).closest('[role="tooltip"]')
          ).toBeInTheDocument()
        );
      });
    });
  });
});
