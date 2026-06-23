/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../__mocks__/kea_logic';

import React from 'react';

import { waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

const mockUseEnterpriseSearchApplicationNav = jest.fn().mockReturnValue([]);

jest.mock('../../../shared/layout', () => ({
  useEnterpriseSearchApplicationNav: (...args: any[]) =>
    mockUseEnterpriseSearchApplicationNav(...args),
  EnterpriseSearchPageTemplateWrapper: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { EnterpriseSearchApplicationsPageTemplate } from './page_template';

const mockValues = {
  getChromeStyle$: () => of('classic'),
  renderHeaderActions: jest.fn(),
  updateSideNavDefinition: jest.fn(),
};

describe('EnterpriseSearchApplicationsPageTemplate', () => {
  it('updates the side nav dynamic links', async () => {
    const updateSideNavDefinition = jest.fn();

    setMockValues({ ...mockValues, updateSideNavDefinition });

    const applicationsItems = [{ foo: 'bar' }];
    mockUseEnterpriseSearchApplicationNav.mockReturnValueOnce([
      {
        id: 'build',
        items: [
          {
            id: 'searchApplications',
            items: applicationsItems,
          },
        ],
      },
    ]);

    renderWithKibanaRenderContext(<EnterpriseSearchApplicationsPageTemplate />);

    await waitFor(() => {
      expect(updateSideNavDefinition).toHaveBeenCalledWith({
        searchApps: applicationsItems,
      });
    });
  });
});
