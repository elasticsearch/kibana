/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { EuiThemeProvider } from '@elastic/eui';
import { BehaviorSubject } from 'rxjs';
import { PresentationPanelTitle } from './presentation_panel_title';
import type { DefaultPresentationPanelApi } from '../types';
import { isApiCompatibleWithCustomizePanelAction } from '../../../ui_actions/customize_panel_action';
import { openCustomizePanelFlyout } from '../../../ui_actions/customize_panel_action/open_customize_panel';

jest.mock('../../../ui_actions/customize_panel_action', () => ({
  isApiCompatibleWithCustomizePanelAction: jest.fn(() => false),
}));

jest.mock('../../../ui_actions/customize_panel_action/open_customize_panel', () => ({
  openCustomizePanelFlyout: jest.fn(),
}));

describe('PresentationPanelTitle', () => {
  const mockApi: DefaultPresentationPanelApi = {
    uuid: 'test',
    title$: new BehaviorSubject<string | undefined>('CPU Usage'),
  };

  const defaultProps = {
    api: mockApi,
    headerId: 'test-header-id',
  };

  const renderWithTheme = (component: React.ReactElement) => {
    return render(<EuiThemeProvider>{component}</EuiThemeProvider>);
  };

  describe('titleHighlight functionality', () => {
    it('renders plain text when titleHighlight is not provided', () => {
      const { container } = renderWithTheme(
        <PresentationPanelTitle {...defaultProps} panelTitle="CPU Usage" />
      );
      const titleElement = screen.getByTestId('embeddablePanelTitle');
      expect(titleElement).toHaveTextContent('CPU Usage');
      expect(container.querySelector('mark')).not.toBeInTheDocument();
    });

    it('renders EuiHighlight component when titleHighlight is provided', () => {
      const { container } = renderWithTheme(
        <PresentationPanelTitle {...defaultProps} panelTitle="CPU Usage" titleHighlight="cpu" />
      );
      const mark = container.querySelector('mark');
      expect(mark).toBeInTheDocument();
      expect(mark?.textContent?.toLowerCase()).toBe('cpu');
    });
  });

  describe('title tooltip (no description)', () => {
    it('wraps the title in a tooltip anchor when no panel description is provided', () => {
      renderWithTheme(<PresentationPanelTitle {...defaultProps} panelTitle="CPU Usage" />);

      expect(screen.getByTestId('embeddablePanelTitleTooltipAnchor')).toBeInTheDocument();
      expect(screen.queryByTestId('embeddablePanelTitleDescriptionIcon')).not.toBeInTheDocument();
    });

    it('does not render a tooltip when panelTitle is empty', () => {
      renderWithTheme(<PresentationPanelTitle {...defaultProps} panelTitle="" />);

      expect(screen.queryByTestId('embeddablePanelTitleTooltipAnchor')).not.toBeInTheDocument();
    });
  });

  describe('keyboard accessibility in edit mode', () => {
    beforeEach(() => {
      (isApiCompatibleWithCustomizePanelAction as jest.Mock).mockReturnValue(true);
      (openCustomizePanelFlyout as jest.Mock).mockClear();
    });

    afterEach(() => {
      (isApiCompatibleWithCustomizePanelAction as jest.Mock).mockReturnValue(false);
    });

    it('opens the customize panel flyout when Enter is pressed on the editable title', () => {
      renderWithTheme(
        <PresentationPanelTitle {...defaultProps} panelTitle="CPU Usage" viewMode="edit" />
      );

      const titleLink = screen.getByTestId('embeddablePanelTitle');
      fireEvent.keyDown(titleLink, { key: 'Enter', code: 'Enter' });

      expect(openCustomizePanelFlyout).toHaveBeenCalledWith({
        api: mockApi,
        focusOnTitle: true,
      });
    });

    it('does not open the flyout for non-Enter key presses on the editable title', () => {
      renderWithTheme(
        <PresentationPanelTitle {...defaultProps} panelTitle="CPU Usage" viewMode="edit" />
      );

      const titleLink = screen.getByTestId('embeddablePanelTitle');
      fireEvent.keyDown(titleLink, { key: 'Space', code: 'Space' });
      fireEvent.keyDown(titleLink, { key: 'Tab', code: 'Tab' });

      expect(openCustomizePanelFlyout).not.toHaveBeenCalled();
    });
  });
});
