/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_INITIAL_APP_DATA } from '../../../common/__mocks__';
import { setMockValues } from '../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { MemoryRouter } from '@kbn/shared-ux-router';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

jest.mock('./components/connectors/connectors_router', () => ({
  ConnectorsRouter: () => <div data-test-subj="connectorsRouter">Connectors</div>,
}));

import { EnterpriseSearchContent, EnterpriseSearchContentConfigured } from '.';

// MemoryRouter is required because EnterpriseSearchContent / EnterpriseSearchContentConfigured
// render <Routes> / <Route> from @kbn/shared-ux-router, which need a router context.
describe('EnterpriseSearchContent', () => {
  it('renders EnterpriseSearchContentConfigured', () => {
    setMockValues({
      config: { host: 'some.url' },
      errorConnectingMessage: '',
    });

    renderWithKibanaRenderContext(
      <MemoryRouter>
        <EnterpriseSearchContent />
      </MemoryRouter>
    );

    expect(screen.getByTestId('connectorsRouter')).toBeInTheDocument();
  });
});

describe('EnterpriseSearchContentConfigured', () => {
  it('renders engine routes', () => {
    renderWithKibanaRenderContext(
      <MemoryRouter>
        <EnterpriseSearchContentConfigured {...DEFAULT_INITIAL_APP_DATA} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('connectorsRouter')).toBeInTheDocument();
  });
});
