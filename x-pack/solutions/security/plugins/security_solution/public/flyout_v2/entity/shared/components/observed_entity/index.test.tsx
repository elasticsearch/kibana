/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { ObservedEntity } from '.';
import { TestProviders } from '../../../../../common/mock';
import { mockObservedHostData } from '../../../../../flyout/entity_details/mocks';

describe('ObservedEntity', () => {
  const mockProps = {
    observedData: mockObservedHostData,
    contextID: '',
    scopeId: '',
    observedFields: [],
  };

  it('renders the entity table', () => {
    const { getByTestId } = render(
      <TestProviders>
        <ObservedEntity {...mockProps} />
      </TestProviders>
    );

    expect(getByTestId('entity-table')).toBeInTheDocument();
  });

  it('renders table column headers', () => {
    const { getByText } = render(
      <TestProviders>
        <ObservedEntity {...mockProps} />
      </TestProviders>
    );

    expect(getByText('Field')).toBeInTheDocument();
    expect(getByText('Values')).toBeInTheDocument();
  });
});
