/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, mockKibanaValues } from '../../__mocks__/kea_logic';
import { mockHistory } from '../../__mocks__/react_router';

import React from 'react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

jest.mock('./generate_breadcrumbs', () => ({
  useGenerateBreadcrumbs: jest.requireActual('./generate_breadcrumbs').useGenerateBreadcrumbs,
  useSearchBreadcrumbs: jest.fn(() => (crumbs: any) => crumbs),
}));
import { useSearchBreadcrumbs } from './generate_breadcrumbs';

jest.mock('./generate_title', () => ({
  searchTitle: jest.fn((title: any) => title),
}));
import { searchTitle } from './generate_title';

import { SetSearchChrome } from '.';

describe('Set Kibana Chrome helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({ history: mockHistory });
  });

  afterEach(() => {
    expect(mockKibanaValues.setBreadcrumbs).toHaveBeenCalled();
    expect(mockKibanaValues.setDocTitle).toHaveBeenCalled();
  });

  describe('SetSearchChrome', () => {
    it('sets breadcrumbs and document title', () => {
      renderWithKibanaRenderContext(<SetSearchChrome trail={['Hello World']} />);

      expect(searchTitle).toHaveBeenCalledWith(['Hello World']);
      expect(useSearchBreadcrumbs).toHaveBeenCalledWith([
        {
          text: 'Hello World',
          path: '/current-path',
        },
      ]);
    });

    it('handles empty trails as a root-level page', () => {
      renderWithKibanaRenderContext(<SetSearchChrome />);

      expect(searchTitle).toHaveBeenCalledWith([]);
      expect(useSearchBreadcrumbs).toHaveBeenCalledWith([]);
    });
  });
});
