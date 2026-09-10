/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import {
  AccessControlIndexSelector,
  type AccessControlSelectorOption,
} from './access_control_index_selector';

const syncJobSelectorOptions: AccessControlSelectorOption[] = [
  {
    description: 'Browse content sync history',
    title: 'Content syncs',
    value: 'content-index',
  },
  {
    description: 'Browse access control sync history',
    title: 'Access control syncs',
    value: 'access-control-index',
  },
];

describe('AccessControlIndexSelector', () => {
  it('includes the selected default index type in the button accessible name', () => {
    renderWithKibanaRenderContext(
      <AccessControlIndexSelector onChange={jest.fn()} valueOfSelected="content-index" />
    );

    expect(screen.getByRole('button', { name: 'Index type, Content index' })).toBeInTheDocument();
  });

  it('includes the selected custom index type in the button accessible name', () => {
    renderWithKibanaRenderContext(
      <AccessControlIndexSelector
        indexSelectorOptions={syncJobSelectorOptions}
        onChange={jest.fn()}
        valueOfSelected="content-index"
      />
    );

    expect(screen.getByRole('button', { name: 'Index type, Content syncs' })).toBeInTheDocument();
  });
});
