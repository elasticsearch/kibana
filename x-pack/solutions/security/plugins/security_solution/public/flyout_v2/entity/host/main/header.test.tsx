/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../../common/mock';
import { Header } from './header';
import { RiskSeverity } from '../../../../../common/search_strategy';

const defaultLastSeen = {
  date: '2023-02-23T20:03:17.489Z',
  isLoading: false,
};

const mockProps = {
  hostName: 'test',
  scopeId: 'test-scope-id',
  lastSeen: defaultLastSeen,
};

jest.mock('../../../../common/components/visualization_actions/visualization_embeddable');

describe('Header', () => {
  it('renders', () => {
    const { getByTestId } = render(
      <TestProviders>
        <Header {...mockProps} />
      </TestProviders>
    );

    expect(getByTestId('host-panel-header')).toBeInTheDocument();
  });

  it('renders observed date', () => {
    const futureDay = '2989-03-07T20:00:00.000Z';
    const { getByTestId } = render(
      <TestProviders>
        <Header {...mockProps} lastSeen={{ date: futureDay, isLoading: false }} />
      </TestProviders>
    );

    expect(getByTestId('host-panel-header-lastSeen').textContent).toContain('Mar 7, 2989');
  });

  it('renders observed badge when lastSeen is defined', () => {
    const { getByTestId } = render(
      <TestProviders>
        <Header {...mockProps} />
      </TestProviders>
    );

    expect(getByTestId('host-panel-header-observed-badge')).toBeInTheDocument();
  });

  it('does not render observed badge when lastSeen date is undefined', () => {
    const { queryByTestId } = render(
      <TestProviders>
        <Header {...mockProps} lastSeen={{ date: undefined, isLoading: false }} />
      </TestProviders>
    );

    expect(queryByTestId('host-panel-header-observed-badge')).not.toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    const { getByTestId, queryByTestId } = render(
      <TestProviders>
        <Header {...mockProps} lastSeen={{ date: undefined, isLoading: true }} />
      </TestProviders>
    );

    expect(getByTestId('host-panel-header-lastSeen-loading')).toBeInTheDocument();
    expect(getByTestId('host-panel-header-observed-badge-loading')).toBeInTheDocument();
    expect(queryByTestId('host-panel-header-observed-badge')).not.toBeInTheDocument();
  });

  it('does not render lastSeen element when isEntityInStore is true', () => {
    const { queryByTestId } = render(
      <TestProviders>
        <Header {...mockProps} isEntityInStore />
      </TestProviders>
    );

    expect(queryByTestId('host-panel-header-lastSeen')).not.toBeInTheDocument();
  });

  it('renders entity store badge when isEntityInStore is true', () => {
    const { getByTestId } = render(
      <TestProviders>
        <Header {...mockProps} isEntityInStore />
      </TestProviders>
    );

    expect(getByTestId('host-panel-header-observed-badge')).toHaveTextContent('Entity Store');
  });

  it('renders observed badge text when isEntityInStore is false', () => {
    const { getByTestId } = render(
      <TestProviders>
        <Header {...mockProps} />
      </TestProviders>
    );

    expect(getByTestId('host-panel-header-observed-badge')).toHaveTextContent('Observed');
  });

  it('renders risk level badge when isEntityInStore and riskLevel are provided', () => {
    const { getByText } = render(
      <TestProviders>
        <Header {...mockProps} isEntityInStore riskLevel={RiskSeverity.High} />
      </TestProviders>
    );

    expect(getByText('Risk: High')).toBeInTheDocument();
  });

  it('does not render risk level badge when isEntityInStore is false', () => {
    const { queryByText } = render(
      <TestProviders>
        <Header {...mockProps} riskLevel={RiskSeverity.High} />
      </TestProviders>
    );

    expect(queryByText('Risk: High')).not.toBeInTheDocument();
  });

  it('renders the host name as a link to the details page when isEntityInStore is false', () => {
    const { getByTestId } = render(
      <TestProviders>
        <Header {...mockProps} isEntityInStore={false} />
      </TestProviders>
    );

    expect(getByTestId('flyoutTitleLinkIcon')).toBeInTheDocument();
  });

  it('renders the host name without a link when isEntityInStore is true', () => {
    const { queryByTestId } = render(
      <TestProviders>
        <Header {...mockProps} isEntityInStore />
      </TestProviders>
    );

    expect(queryByTestId('flyoutTitleLinkIcon')).not.toBeInTheDocument();
  });
});
