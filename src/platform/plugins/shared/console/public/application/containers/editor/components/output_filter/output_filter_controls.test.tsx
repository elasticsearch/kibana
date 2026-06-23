/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import { OutputFilterControls } from './output_filter_controls';
import { useRequestReadContext } from '../../../../contexts';
import {
  useOutputFilterReadContext,
  useOutputFilterActionContext,
} from '../../../../contexts/output_filter_context';

jest.mock('../../../../contexts', () => ({
  useRequestReadContext: jest.fn(),
}));

jest.mock('../../../../contexts/output_filter_context', () => ({
  useOutputFilterReadContext: jest.fn(),
  useOutputFilterActionContext: jest.fn(),
}));

const mockUseRequestReadContext = useRequestReadContext as jest.MockedFunction<
  typeof useRequestReadContext
>;
const mockUseOutputFilterReadContext = useOutputFilterReadContext as jest.MockedFunction<
  typeof useOutputFilterReadContext
>;
const mockUseOutputFilterActionContext = useOutputFilterActionContext as jest.MockedFunction<
  typeof useOutputFilterActionContext
>;

const mockSetIsExpanded = jest.fn();

const renderComponent = () =>
  render(
    <I18nProvider>
      <OutputFilterControls />
    </I18nProvider>
  );

const makeData = (statusCode: number) => [
  { response: { statusCode, value: '', contentType: 'application/json' } },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUseOutputFilterActionContext.mockReturnValue({
    setExpression: jest.fn(),
    setMode: jest.fn(),
    setInvertMatch: jest.fn(),
    setIsExpanded: mockSetIsExpanded,
  });
});

describe('OutputFilterControls', () => {
  describe('visibility', () => {
    it('renders nothing when data is undefined', () => {
      mockUseRequestReadContext.mockReturnValue({ lastResult: { data: undefined } } as any);
      mockUseOutputFilterReadContext.mockReturnValue({
        expression: '',
        mode: 'jq',
        invertMatch: false,
        isExpanded: false,
      });
      const { container } = renderComponent();
      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when status code is an error (4xx)', () => {
      mockUseRequestReadContext.mockReturnValue({
        lastResult: { data: makeData(404) },
      } as any);
      mockUseOutputFilterReadContext.mockReturnValue({
        expression: '',
        mode: 'jq',
        invertMatch: false,
        isExpanded: false,
      });
      const { container } = renderComponent();
      expect(container).toBeEmptyDOMElement();
    });

    it('renders the button when status code is 200', () => {
      mockUseRequestReadContext.mockReturnValue({
        lastResult: { data: makeData(200) },
      } as any);
      mockUseOutputFilterReadContext.mockReturnValue({
        expression: '',
        mode: 'jq',
        invertMatch: false,
        isExpanded: false,
      });
      renderComponent();
      expect(screen.getByTestId('consoleOutputFilterButton')).toBeInTheDocument();
    });

    it('renders the button when status code is 201', () => {
      mockUseRequestReadContext.mockReturnValue({
        lastResult: { data: makeData(201) },
      } as any);
      mockUseOutputFilterReadContext.mockReturnValue({
        expression: '',
        mode: 'jq',
        invertMatch: false,
        isExpanded: false,
      });
      renderComponent();
      expect(screen.getByTestId('consoleOutputFilterButton')).toBeInTheDocument();
    });
  });

  describe('dot indicator', () => {
    beforeEach(() => {
      mockUseRequestReadContext.mockReturnValue({
        lastResult: { data: makeData(200) },
      } as any);
    });

    it('shows dot indicator when filter is active and row is collapsed', () => {
      mockUseOutputFilterReadContext.mockReturnValue({
        expression: 'keys',
        mode: 'jq',
        invertMatch: false,
        isExpanded: false,
      });
      const { container } = renderComponent();
      // the dot is a <span> sibling inside the wrapper div
      expect(container.querySelector('span[style*="border-radius"]')).toBeInTheDocument();
    });

    it('does not show dot indicator when row is expanded', () => {
      mockUseOutputFilterReadContext.mockReturnValue({
        expression: 'keys',
        mode: 'jq',
        invertMatch: false,
        isExpanded: true,
      });
      const { container } = renderComponent();
      expect(container.querySelector('span[style*="border-radius"]')).not.toBeInTheDocument();
    });

    it('does not show dot indicator when expression is empty', () => {
      mockUseOutputFilterReadContext.mockReturnValue({
        expression: '',
        mode: 'jq',
        invertMatch: false,
        isExpanded: false,
      });
      const { container } = renderComponent();
      expect(container.querySelector('span[style*="border-radius"]')).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    beforeEach(() => {
      mockUseRequestReadContext.mockReturnValue({
        lastResult: { data: makeData(200) },
      } as any);
    });

    it('calls setIsExpanded(true) when button is clicked while collapsed', async () => {
      mockUseOutputFilterReadContext.mockReturnValue({
        expression: '',
        mode: 'jq',
        invertMatch: false,
        isExpanded: false,
      });
      renderComponent();
      await userEvent.click(screen.getByTestId('consoleOutputFilterButton'));
      expect(mockSetIsExpanded).toHaveBeenCalledWith(true);
    });

    it('calls setIsExpanded(false) when button is clicked while expanded', async () => {
      mockUseOutputFilterReadContext.mockReturnValue({
        expression: '',
        mode: 'jq',
        invertMatch: false,
        isExpanded: true,
      });
      renderComponent();
      await userEvent.click(screen.getByTestId('consoleOutputFilterButton'));
      expect(mockSetIsExpanded).toHaveBeenCalledWith(false);
    });
  });
});
