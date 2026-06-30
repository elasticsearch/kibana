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
import { AppMenuComponent } from './app_menu';
import type { AppMenuConfig } from '../types';
import { APP_MENU_TEST_SUBJECTS } from '../test_subjects';

// Mock useIsWithinBreakpoints to control responsive behavior
const mockUseIsWithinBreakpoints = jest.fn();
jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    useIsWithinBreakpoints: (breakpoints: string[]) => mockUseIsWithinBreakpoints(breakpoints),
  };
});

describe('AppMenu', () => {
  const defaultItems = [
    { id: 'item1', label: 'Item 1', run: jest.fn(), iconType: 'gear', order: 1 },
    { id: 'item2', label: 'Item 2', run: jest.fn(), iconType: 'magnify', order: 2 },
  ];

  const defaultConfig: AppMenuConfig = {
    items: defaultItems,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default to xl breakpoint (shows all items)
    mockUseIsWithinBreakpoints.mockImplementation((breakpoints: string[]) => {
      if (breakpoints.includes('xl')) return true;
      return false;
    });
  });

  describe('rendering', () => {
    it('should return null when config is undefined', () => {
      const { container } = render(<AppMenuComponent config={undefined} />);

      expect(container).toBeEmptyDOMElement();
    });

    it('should return null when config has no items', () => {
      const { container } = render(<AppMenuComponent config={{}} />);

      expect(container).toBeEmptyDOMElement();
    });

    it('should return null when visible is false', () => {
      const { container } = render(<AppMenuComponent config={defaultConfig} visible={false} />);

      expect(container).toBeEmptyDOMElement();
    });

    it('should render the top nav menu when config has items', () => {
      render(<AppMenuComponent config={defaultConfig} />);

      expect(screen.getByTestId(APP_MENU_TEST_SUBJECTS.root)).toBeInTheDocument();
    });

    it('should render menu items at xl breakpoint', () => {
      render(<AppMenuComponent config={defaultConfig} />);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });
  });

  describe('action items', () => {
    it('should render primary action item', () => {
      const configWithPrimary: AppMenuConfig = {
        primaryActionItem: {
          id: 'save',
          label: 'Save',
          run: jest.fn(),
          iconType: 'save',
        },
      };

      render(<AppMenuComponent config={configWithPrimary} />);

      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  describe('responsive behavior', () => {
    it('should render overflow button at m-l breakpoint', () => {
      mockUseIsWithinBreakpoints.mockImplementation((breakpoints: string[]) => {
        if (breakpoints.includes('m') && breakpoints.includes('l')) return true;
        return false;
      });

      render(<AppMenuComponent config={defaultConfig} />);

      expect(screen.getByTestId(APP_MENU_TEST_SUBJECTS.overflowButton)).toBeInTheDocument();
    });

    it('should render overflow button with all items at small breakpoint', () => {
      mockUseIsWithinBreakpoints.mockReturnValue(false);

      render(<AppMenuComponent config={defaultConfig} />);

      expect(screen.getByTestId(APP_MENU_TEST_SUBJECTS.overflowButton)).toBeInTheDocument();
    });

    it('should render individual menu items at xl breakpoint', () => {
      mockUseIsWithinBreakpoints.mockImplementation((breakpoints: string[]) => {
        if (breakpoints.includes('xl')) return true;
        return false;
      });

      render(<AppMenuComponent config={defaultConfig} />);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });

    it('should render overflow button at xl breakpoint when item is marked as overflow', () => {
      mockUseIsWithinBreakpoints.mockImplementation((breakpoints: string[]) => {
        if (breakpoints.includes('xl')) return true;
        return false;
      });

      const forcedOverflowConfig: AppMenuConfig = {
        items: [
          {
            id: 'singleOverflowItem',
            label: 'Single overflow item',
            run: jest.fn(),
            iconType: 'gear',
            order: 1,
            overflow: true,
          },
        ],
      };

      render(<AppMenuComponent config={forcedOverflowConfig} />);

      expect(screen.getByTestId(APP_MENU_TEST_SUBJECTS.overflowButton)).toBeInTheDocument();
      expect(screen.queryByText('Single overflow item')).not.toBeInTheDocument();
    });
  });

  describe('switch', () => {
    const switchConfig: AppMenuConfig['switch'] = {
      id: 'test-switch',
      label: 'Test switch',
      labelProps: {},
      checked: false,
      onChange: jest.fn(),
      'data-test-subj': 'test-switch',
    };

    it('should render the app menu with only a switch (standalone)', () => {
      render(<AppMenuComponent config={{ switch: switchConfig }} />);

      expect(screen.getByTestId(APP_MENU_TEST_SUBJECTS.root)).toBeInTheDocument();
      expect(screen.getByTestId('test-switch')).toBeInTheDocument();
    });

    it('should render the switch alongside menu items at xl breakpoint', () => {
      render(<AppMenuComponent config={{ ...defaultConfig, switch: switchConfig }} />);

      expect(screen.getByTestId('test-switch')).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });

    it('should render the switch at m-l breakpoint', () => {
      mockUseIsWithinBreakpoints.mockImplementation((breakpoints: string[]) => {
        if (breakpoints.includes('m') && breakpoints.includes('l')) return true;
        return false;
      });

      render(<AppMenuComponent config={{ ...defaultConfig, switch: switchConfig }} />);

      expect(screen.getByTestId('test-switch')).toBeInTheDocument();
    });

    it('should not render standalone switch at collapsed breakpoint (only overflow)', () => {
      mockUseIsWithinBreakpoints.mockReturnValue(false);

      render(<AppMenuComponent config={{ switch: switchConfig }} />);

      expect(screen.getByTestId(APP_MENU_TEST_SUBJECTS.overflowButton)).toBeInTheDocument();
      expect(screen.queryByTestId('test-switch')).not.toBeInTheDocument();
    });
  });
});
