/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { SerializedTitles } from '@kbn/presentation-publishing';
import { openLazyFlyout } from '@kbn/presentation-util';
import React from 'react';
import deepEqual from 'react-fast-compare';
import type { DataControlState } from '@kbn/controls-schemas';

import { coreServices } from '../../services/kibana_services';

export interface OpenDataControlEditorParams<State extends DataControlState = DataControlState> {
  initialState: Partial<State>;
  parentApi: unknown;
  setLastUsedDataViewId?: (dataViewId: string) => void;
  // these props are only provided when the control already exists and is being edited
  controlId?: string;
  controlType?: string;
  initialDefaultPanelTitle?: string;
  onUpdate?: (newState: Partial<State & SerializedTitles>) => void;
}

export interface ReopenDataControlEditorOverrides<
  State extends DataControlState = DataControlState
> {
  initialState?: Partial<State>;
  controlType?: string;
  initialDefaultPanelTitle?: string;
}

export const openDataControlEditor = <State extends DataControlState = DataControlState>(
  params: OpenDataControlEditorParams<State>
) => {
  const {
    initialState,
    parentApi,
    setLastUsedDataViewId,
    controlId,
    controlType,
    initialDefaultPanelTitle,
    onUpdate,
  } = params;

  // Re-opens the editor with optional state overrides. Used after closing a child ESQL variable
  // control editor.
  const reopenEditor = (overrides: ReopenDataControlEditorOverrides<State> = {}) => {
    openDataControlEditor<State>({
      ...params,
      initialState: { ...initialState, ...overrides.initialState },
      controlType: overrides.controlType ?? controlType,
      initialDefaultPanelTitle: overrides.initialDefaultPanelTitle ?? initialDefaultPanelTitle,
    });
  };

  const onCancel = (newState: Partial<State>, closeFlyout: () => void) => {
    if (deepEqual(initialState, newState)) {
      closeFlyout();
      return;
    }
    coreServices.overlays
      .openConfirm(
        i18n.translate('controls.controlGroup.management.discard.sub', {
          defaultMessage: `Changes that you've made to this control will be discarded, are you sure you want to continue?`,
        }),
        {
          confirmButtonText: i18n.translate('controls.controlGroup.management.discard.confirm', {
            defaultMessage: 'Discard changes',
          }),
          cancelButtonText: i18n.translate('controls.controlGroup.management.discard.cancel', {
            defaultMessage: 'Cancel',
          }),
          title: i18n.translate('controls.controlGroup.management.discard.title', {
            defaultMessage: 'Discard changes?',
          }),
          buttonColor: 'danger',
        }
      )
      .then((confirmed) => {
        if (confirmed) {
          closeFlyout();
        }
      });
  };

  openLazyFlyout({
    core: coreServices,
    parentApi,
    loadContent: async ({ closeFlyout }) => {
      const { DataControlEditor } = await import('./editor/data_control_editor');
      return (
        <DataControlEditor<State>
          ariaLabelledBy="control-editor-title-input"
          parentApi={parentApi}
          initialState={initialState}
          controlType={controlType}
          controlId={controlId}
          initialDefaultPanelTitle={initialDefaultPanelTitle}
          onUpdate={(state) => onUpdate?.(state)}
          onCancel={(state) => {
            onCancel(state, closeFlyout);
          }}
          onSave={(dataViewId) => {
            closeFlyout();
            if (setLastUsedDataViewId && dataViewId) setLastUsedDataViewId(dataViewId);
          }}
          reopenEditor={reopenEditor}
        />
      );
    },
    flyoutProps: {
      triggerId: 'dashboard-controls-menu-button',
      focusedPanelId: controlId,
    },
  });
};
