/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import React from 'react';

import { EuiThemeProvider } from '@elastic/eui';
import type { RenderResult } from '@testing-library/react';
import { act, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { getGridLayoutStateManagerMock, mockRenderPanelContents } from '../test_utils/mocks';
import { mouseDrop, mouseMoveTo, mouseStartDragging } from '../test_utils/events';
import type { GridLayoutContextType } from '../use_grid_layout_context';
import { GridLayoutContext } from '../use_grid_layout_context';
import type { GridSectionHeaderProps } from './grid_section_header';
import { GridSectionHeader } from './grid_section_header';
import type { CollapsibleSection } from './types';

describe('GridSectionHeader', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  const renderGridSectionHeader = (
    propsOverrides: Partial<GridSectionHeaderProps> = {},
    contextOverrides: Partial<GridLayoutContextType> = {}
  ) => {
    const stateManagerMock = getGridLayoutStateManagerMock();
    return {
      component: render(
        <GridLayoutContext.Provider
          value={
            {
              renderPanelContents: mockRenderPanelContents,
              gridLayoutStateManager: stateManagerMock,
              ...contextOverrides,
            } as GridLayoutContextType
          }
        >
          <GridSectionHeader sectionId={'second'} {...propsOverrides} />
        </GridLayoutContext.Provider>,
        { wrapper: EuiThemeProvider }
      ),
      gridLayoutStateManager: stateManagerMock,
    };
  };

  it('renders the panel count', async () => {
    const { component, gridLayoutStateManager } = renderGridSectionHeader();
    const initialCount = component.getByTestId('kbnGridSectionHeader-second--panelCount');
    expect(initialCount.textContent).toBe('(1 panel)');

    const currentLayout = gridLayoutStateManager.gridLayout$.getValue();
    act(() => {
      const currentRow = currentLayout.second;
      gridLayoutStateManager.gridLayout$.next({
        ...currentLayout,
        second: {
          ...currentRow,
          panels: currentLayout['main-0'].panels,
        },
      });
    });

    await waitFor(() => {
      const updatedCount = component.getByTestId('kbnGridSectionHeader-second--panelCount');
      expect(updatedCount.textContent).toBe('(8 panels)');
    });
  });

  it('clicking title toggles collapsed state`', async () => {
    const { component, gridLayoutStateManager } = renderGridSectionHeader();
    const title = component.getByTestId('kbnGridSectionTitle-second');

    expect(
      (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).isCollapsed
    ).toBe(false);
    mouseStartDragging(title);
    mouseDrop(title);
    expect(
      (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).isCollapsed
    ).toBe(true);
  });

  it('movement below threshold still toggles collapsed state', async () => {
    const { component, gridLayoutStateManager } = renderGridSectionHeader();
    const header = component.getByTestId('kbnGridSectionHeader-second');

    expect(
      (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).isCollapsed
    ).toBe(false);
    mouseStartDragging(header, { clientX: 0, clientY: 0 });
    mouseMoveTo({ clientX: 3, clientY: 0 });
    mouseDrop(header);
    expect(
      (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).isCollapsed
    ).toBe(true);
  });

  it('movement at threshold starts dragging instead of toggling', async () => {
    const { component, gridLayoutStateManager } = renderGridSectionHeader();
    const header = component.getByTestId('kbnGridSectionHeader-second');

    expect(header).not.toHaveClass('kbnGridSectionHeader--active');
    expect(
      (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).isCollapsed
    ).toBe(false);

    mouseStartDragging(header, { clientX: 0, clientY: 0 });
    mouseMoveTo({ clientX: 8, clientY: 0 });

    expect(header).toHaveClass('kbnGridSectionHeader--active');
    expect(
      (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).isCollapsed
    ).toBe(true);

    mouseDrop(header);

    expect(header).not.toHaveClass('kbnGridSectionHeader--active');
    expect(
      (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).isCollapsed
    ).toBe(true);
  });

  describe('title editor', () => {
    const setTitle = async (component: RenderResult) => {
      const input = component.getByTestId('euiInlineEditModeInput');
      expect(input.getAttribute('value')).toBe('Small section');
      await userEvent.click(input);
      await userEvent.keyboard(' 123');
      expect(input.getAttribute('value')).toBe('Small section 123');
    };

    it('clicking on edit icon triggers inline title editor and does not toggle collapsed', async () => {
      const { component, gridLayoutStateManager } = renderGridSectionHeader();
      const editIcon = component.getByTestId('kbnGridSectionTitle-second--edit');

      expect(component.queryByTestId('kbnGridSectionTitle-second--editor')).not.toBeInTheDocument();
      expect(
        (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).isCollapsed
      ).toBe(false);
      await userEvent.click(editIcon);
      expect(component.getByTestId('kbnGridSectionTitle-second--editor')).toBeInTheDocument();
      expect(
        (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).isCollapsed
      ).toBe(false);
    });

    it('can update the title', async () => {
      const { component, gridLayoutStateManager } = renderGridSectionHeader();
      expect(component.getByTestId('kbnGridSectionTitle-second').textContent).toBe('Small section');
      expect(
        (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).title
      ).toBe('Small section');

      const editIcon = component.getByTestId('kbnGridSectionTitle-second--edit');
      await userEvent.click(editIcon);
      await setTitle(component);
      const saveButton = component.getByTestId('euiInlineEditModeSaveButton');
      await userEvent.click(saveButton);

      expect(component.queryByTestId('kbnGridSectionTitle-second--editor')).not.toBeInTheDocument();
      expect(component.getByTestId('kbnGridSectionTitle-second').textContent).toBe(
        'Small section 123'
      );
      expect(
        (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).title
      ).toBe('Small section 123');
    });

    it('clicking on cancel closes the inline title editor without updating title', async () => {
      const { component, gridLayoutStateManager } = renderGridSectionHeader();
      const editIcon = component.getByTestId('kbnGridSectionTitle-second--edit');
      await userEvent.click(editIcon);

      await setTitle(component);
      const cancelButton = component.getByTestId('euiInlineEditModeCancelButton');
      await userEvent.click(cancelButton);

      expect(component.queryByTestId('kbnGridSectionTitle-second--editor')).not.toBeInTheDocument();
      expect(component.getByTestId('kbnGridSectionTitle-second').textContent).toBe('Small section');
      expect(
        (gridLayoutStateManager.gridLayout$.getValue().second as CollapsibleSection).title
      ).toBe('Small section');
    });
  });
});
