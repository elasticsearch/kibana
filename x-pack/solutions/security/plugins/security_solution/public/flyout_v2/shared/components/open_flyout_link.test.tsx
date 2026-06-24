/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { TestProviders } from '../../../common/mock';
import { OpenFlyoutLink } from './open_flyout_link';
import { OPEN_FLYOUT_LINK_TEST_ID } from './test_ids';
import { buildFlyoutContent } from '../utils/build_flyout_content';

jest.mock('../utils/build_flyout_content');
jest.mock('./flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../hooks/use_default_flyout_properties', () => ({
  useDefaultDocumentFlyoutProperties: () => ({ outsideClickCloses: true }),
}));

const mockOpenSystemFlyout = jest.fn();
jest.mock('../../../common/lib/kibana', () => {
  const kibanaActual = jest.requireActual('../../../common/lib/kibana');
  return {
    ...kibanaActual,
    useKibana: () => ({
      ...kibanaActual.useKibana(),
      services: {
        ...kibanaActual.useKibana().services,
        overlays: {
          ...kibanaActual.useKibana().services.overlays,
          openSystemFlyout: mockOpenSystemFlyout,
        },
      },
    }),
  };
});

const buildFlyoutContentMock = buildFlyoutContent as jest.Mock;

const renderOpenFlyoutLink = (props: Partial<React.ComponentProps<typeof OpenFlyoutLink>> = {}) =>
  render(
    <TestProviders>
      <OpenFlyoutLink field="source.ip" value="10.0.0.1" {...props}>
        <span data-test-subj="fallbackChild">{'fallback'}</span>
      </OpenFlyoutLink>
    </TestProviders>
  );

describe('<OpenFlyoutLink />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when the field is supported', () => {
    beforeEach(() => {
      buildFlyoutContentMock.mockReturnValue(<div data-test-subj="mockFlyoutContent" />);
    });

    it('should render a link with the value as text when no children are provided', () => {
      const { getByTestId } = render(
        <TestProviders>
          <OpenFlyoutLink field="source.ip" value="10.0.0.1" />
        </TestProviders>
      );

      const link = getByTestId(OPEN_FLYOUT_LINK_TEST_ID);
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent('10.0.0.1');
    });

    it('should render children inside the link when children are provided', () => {
      const { getByTestId } = renderOpenFlyoutLink();

      const link = getByTestId(OPEN_FLYOUT_LINK_TEST_ID);
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent('fallback');
    });

    it('should call openSystemFlyout when clicked', () => {
      const { getByTestId } = renderOpenFlyoutLink();

      getByTestId(OPEN_FLYOUT_LINK_TEST_ID).click();
      expect(mockOpenSystemFlyout).toHaveBeenCalled();
    });

    it('should open as child flyout by default', () => {
      const { getByTestId } = renderOpenFlyoutLink();

      getByTestId(OPEN_FLYOUT_LINK_TEST_ID).click();
      expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ session: 'inherit', outsideClickCloses: false })
      );
    });

    it('should open as standalone flyout when asParent is true', () => {
      const { getByTestId } = renderOpenFlyoutLink({ asParent: true });

      getByTestId(OPEN_FLYOUT_LINK_TEST_ID).click();
      expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ session: 'start', outsideClickCloses: true })
      );
    });

    it('should use a custom data-test-subj when provided', () => {
      const { getByTestId } = renderOpenFlyoutLink({ 'data-test-subj': 'customTestId' });

      expect(getByTestId('customTestId')).toBeInTheDocument();
    });
  });

  describe('when the field is not supported', () => {
    beforeEach(() => {
      buildFlyoutContentMock.mockReturnValue(null);
    });

    it('should render children as fallback', () => {
      const { getByTestId, queryByTestId } = renderOpenFlyoutLink();

      expect(getByTestId('fallbackChild')).toBeInTheDocument();
      expect(queryByTestId(OPEN_FLYOUT_LINK_TEST_ID)).not.toBeInTheDocument();
    });

    it('should not call openSystemFlyout', () => {
      renderOpenFlyoutLink();

      expect(mockOpenSystemFlyout).not.toHaveBeenCalled();
    });
  });
});
