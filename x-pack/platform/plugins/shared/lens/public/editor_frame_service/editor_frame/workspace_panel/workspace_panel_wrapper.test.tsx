/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Visualization, LensAppState } from '@kbn/lens-common';
import { createMockVisualization, renderWithReduxStore } from '../../../mocks';
import { WorkspacePanelWrapper } from './workspace_panel_wrapper';
import {
  updateVisualizationState,
  enableAutoApply,
  disableAutoApply,
  selectAutoApplyEnabled,
} from '../../../state_management';
import { setChangesApplied } from '../../../state_management/lens_slice';
import { act, screen } from '@testing-library/react';
import { faker } from '@faker-js/faker';
import { EditorFrameServiceProvider } from '../../editor_frame_service_context';

describe('workspace_panel_wrapper', () => {
  let mockVisualization: jest.Mocked<Visualization>;

  const renderWorkspacePanelWrapper = (
    propsOverrides = {},
    { preloadedState }: { preloadedState: Partial<LensAppState> } = { preloadedState: {} }
  ) => {
    const { store, ...rtlRender } = renderWithReduxStore(
      <EditorFrameServiceProvider
        visualizationMap={{
          myVis: { ...mockVisualization },
        }}
        datasourceMap={{}}
      >
        <WorkspacePanelWrapper
          isFullscreen={false}
          getUserMessages={() => []}
          children={<span />}
          displayOptions={undefined}
          {...propsOverrides}
        />
      </EditorFrameServiceProvider>,
      {},
      { preloadedState }
    );

    const getApplyChangesToolbar = () => {
      return screen.queryByTestId('lnsApplyChanges__toolbar');
    };

    const toggleAutoApply = async () => {
      act(() => {
        store.dispatch(
          selectAutoApplyEnabled(store.getState()) ? disableAutoApply() : enableAutoApply()
        );
      });
    };

    const isAutoApplyOn = () => selectAutoApplyEnabled(store.getState());

    const editVisualization = () => {
      store.dispatch(
        updateVisualizationState({
          visualizationId: store.getState().lens.visualization.activeId as string,
          newState: { something: 'changed' },
        })
      );
    };

    return {
      getApplyChangesToolbar,
      toggleAutoApply,
      isAutoApplyOn,
      store,
      editVisualization,
      ...rtlRender,
    };
  };

  beforeEach(() => {
    mockVisualization = createMockVisualization();
  });

  it('should render its children', async () => {
    const customElementText = faker.word.words();
    renderWorkspacePanelWrapper({ children: <span>{customElementText}</span> });
    expect(screen.getByText(customElementText)).toBeInTheDocument();
  });

  describe('auto-apply controls', () => {
    it('shows and hides apply-changes button depending on whether auto-apply is enabled', async () => {
      const { toggleAutoApply, getApplyChangesToolbar } = renderWorkspacePanelWrapper();
      await toggleAutoApply();
      expect(getApplyChangesToolbar()).toBeInTheDocument();
      await toggleAutoApply();
      expect(getApplyChangesToolbar()).not.toBeInTheDocument();
      await toggleAutoApply();
      expect(getApplyChangesToolbar()).toBeInTheDocument();
    });

    it('apply-changes button applies changes', async () => {
      const { store, toggleAutoApply, getApplyChangesToolbar, editVisualization } =
        renderWorkspacePanelWrapper();
      await toggleAutoApply();
      expect(getApplyChangesToolbar()).toBeDisabled();

      // make a change
      act(() => {
        editVisualization();
      });

      // simulate workspace panel behavior
      act(() => {
        store.dispatch(setChangesApplied(false));
      });

      expect(getApplyChangesToolbar()).not.toBeDisabled();

      // simulate workspace panel behavior
      act(() => {
        store.dispatch(setChangesApplied(true));
      });
      expect(getApplyChangesToolbar()).toBeDisabled();
    });

    it('enabling auto apply while having unapplied changes works', async () => {
      const { store, toggleAutoApply, getApplyChangesToolbar, editVisualization } =
        renderWorkspacePanelWrapper();
      await toggleAutoApply();
      act(() => {
        editVisualization();
      });

      // simulate workspace panel behavior
      act(() => {
        store.dispatch(setChangesApplied(false));
      });
      expect(getApplyChangesToolbar()).not.toBeDisabled();
      await toggleAutoApply();
      expect(getApplyChangesToolbar()).not.toBeInTheDocument();
    });
  });
});
