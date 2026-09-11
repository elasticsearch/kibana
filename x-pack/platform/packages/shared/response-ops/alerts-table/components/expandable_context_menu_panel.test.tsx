/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  EXPANDABLE_CONTEXT_MENU_PANEL_MIN_WIDTH,
  ExpandableContextMenuPanel,
} from './expandable_context_menu_panel';
import { useExpandableContextMenuPanel } from '../contexts/expandable_context_menu_panel_context';

const InlinePanel = () => {
  const { closePanel } = useExpandableContextMenuPanel() ?? {};
  return (
    <div data-test-subj="inlinePanel">
      <button data-test-subj="inlineBack" onClick={() => closePanel?.()}>
        Back
      </button>
    </div>
  );
};

const OpenPanelItem = () => {
  const { openPanel } = useExpandableContextMenuPanel() ?? {};
  return (
    <button data-test-subj="openPanelItem" onClick={() => openPanel?.(<InlinePanel />)}>
      Open
    </button>
  );
};

describe('ExpandableContextMenuPanel', () => {
  it('renders the menu items by default', () => {
    render(<ExpandableContextMenuPanel items={[<OpenPanelItem key="open" />]} />);

    expect(screen.getByTestId('alertsTableActionsMenu')).toBeInTheDocument();
    expect(screen.getByTestId('openPanelItem')).toBeInTheDocument();
    expect(screen.queryByTestId('inlinePanel')).not.toBeInTheDocument();
    expect(screen.getByTestId('alertsTableActionsMenu')).toHaveStyle({
      minWidth: `${EXPANDABLE_CONTEXT_MENU_PANEL_MIN_WIDTH}px`,
    });
  });

  it('swaps the menu for the inline panel and moves focus into it', async () => {
    render(<ExpandableContextMenuPanel items={[<OpenPanelItem key="open" />]} />);

    fireEvent.click(screen.getByTestId('openPanelItem'));

    expect(screen.getByTestId('inlinePanel')).toBeInTheDocument();
    expect(screen.queryByTestId('alertsTableActionsMenu')).not.toBeInTheDocument();

    // The content is wrapped in an EuiContextMenuPanel, whose built-in focus
    // handling moves focus into the panel (rather than dropping it to <body>).
    const contentPanel = screen.getByTestId('inlinePanel').closest('.euiContextMenuPanel');
    expect(contentPanel).toHaveStyle({
      minWidth: `${EXPANDABLE_CONTEXT_MENU_PANEL_MIN_WIDTH}px`,
    });
    await waitFor(() => expect(contentPanel).toHaveFocus());
  });

  it('restores the menu and returns focus to it when the panel is closed', async () => {
    render(<ExpandableContextMenuPanel items={[<OpenPanelItem key="open" />]} />);

    fireEvent.click(screen.getByTestId('openPanelItem'));
    fireEvent.click(screen.getByTestId('inlineBack'));

    expect(screen.getByTestId('alertsTableActionsMenu')).toBeInTheDocument();
    expect(screen.queryByTestId('inlinePanel')).not.toBeInTheDocument();

    // Focus returns to the restored menu panel rather than falling to <body>.
    await waitFor(() => expect(screen.getByTestId('alertsTableActionsMenu')).toHaveFocus());
  });
});
