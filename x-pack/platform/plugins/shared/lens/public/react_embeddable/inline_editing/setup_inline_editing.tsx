/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EmbeddableStateTransfer,
  snapshotPanelSettings,
  restorePanelSettings,
  type PanelSettingsApi,
} from '@kbn/embeddable-plugin/public';
import React from 'react';
import type {
  GetStateType,
  LensInspectorAdapters,
  LensInternalApi,
  LensRuntimeState,
  TypedLensSerializedState,
  LensDatasourceId,
} from '@kbn/lens-common';
import { LENS_DATASOURCE_ID } from '@kbn/lens-common';
import type { EditConfigPanelProps } from '../../app_plugin/shared/edit_on_the_fly/types';
import { getActiveDatasourceIdFromDoc } from '../../utils';
import { isTextBasedLanguage } from '../helper';
import type { PanelManagementApi } from './panel_management';
import { getStateManagementForInlineEditing } from './state_management';
import { saveUserChartTypeToSessionStorage } from '../../chart_type_session_storage';
import type { LensEmbeddableStartServices } from '../types';

export function prepareInlineEditPanel(
  initialState: LensRuntimeState,
  getState: GetStateType,
  updateState: (newState: Pick<LensRuntimeState, 'attributes' | 'ref_id'>) => void,
  { dataLoading$, isNewlyCreated$ }: Pick<LensInternalApi, 'dataLoading$' | 'isNewlyCreated$'>,
  panelManagementApi: PanelManagementApi,
  inspectorApi: LensInspectorAdapters,
  {
    coreStart,
    visualizationMap,
    datasourceMap,
    ...startDependencies
  }: Omit<
    LensEmbeddableStartServices,
    | 'timefilter'
    | 'coreHttp'
    | 'capabilities'
    | 'expressionRenderer'
    | 'documentToExpression'
    | 'injectFilterReferences'
    | 'theme'
    | 'uiSettings'
    | 'attributeService'
  >,
  navigateToLensEditor?: (
    stateTransfer: EmbeddableStateTransfer,
    skipAppLeave?: boolean
  ) => () => Promise<void>,
  uuid?: string,
  parentApi?: unknown,
  panelSettingsApi?: PanelSettingsApi
) {
  return async function getConfigPanel({
    closeFlyout,
    onApply,
    onCancel,
    applyButtonLabel,
  }: Partial<
    Pick<EditConfigPanelProps, 'closeFlyout' | 'onApply' | 'onCancel' | 'applyButtonLabel'>
  > = {}) {
    const currentState = getState();
    const isNewPanel = initialState.isNewPanel;

    const attributes = currentState.attributes as TypedLensSerializedState['attributes'];
    // Save the user's preferred chart type to session storage
    if (!isNewPanel && attributes) {
      saveUserChartTypeToSessionStorage(attributes.visualizationType);
    }
    const activeDatasourceId = (getActiveDatasourceIdFromDoc(attributes) ||
      LENS_DATASOURCE_ID.FORM_BASED) as LensDatasourceId;

    const { updatePanelState, updateSuggestion } = getStateManagementForInlineEditing(
      activeDatasourceId,
      () => getState().attributes as TypedLensSerializedState['attributes'],
      (attrs: TypedLensSerializedState['attributes'], resetId: boolean = false) => {
        updateState({
          attributes: attrs,
          ref_id: resetId ? undefined : currentState.ref_id,
        });
      },
      visualizationMap,
      datasourceMap,
      startDependencies.data.query.filterManager.extract
    );

    const updateByRefInput = (
      refId: LensRuntimeState['ref_id'],
      attrs: TypedLensSerializedState['attributes']
    ) => {
      updateState({ attributes: attrs, ref_id: refId });
    };

    if (attributes?.visualizationType == null) {
      return null;
    }

    const { getEditLensConfiguration } = await import('../../async_services');
    const Component = await getEditLensConfiguration(
      coreStart,
      startDependencies,
      visualizationMap,
      datasourceMap
    );

    const canNavigateToFullEditor =
      !isTextBasedLanguage(currentState) &&
      panelManagementApi.isEditingEnabled() &&
      navigateToLensEditor;

    const panelSettingsSnapshot = panelSettingsApi
      ? snapshotPanelSettings(panelSettingsApi)
      : undefined;

    return (
      <Component
        closeFlyout={closeFlyout}
        attributes={attributes}
        updateByRefInput={updateByRefInput}
        updatePanelState={updatePanelState}
        updateSuggestion={updateSuggestion}
        lensAdapters={inspectorApi.getInspectorAdapters()}
        dataLoading$={dataLoading$}
        panelId={uuid}
        savedObjectId={currentState.ref_id}
        navigateToLensEditor={
          canNavigateToFullEditor
            ? navigateToLensEditor(
                new EmbeddableStateTransfer(
                  coreStart.application.navigateToApp,
                  coreStart.application.currentAppId$
                ),
                true
              )
            : undefined
        }
        displayFlyoutHeader
        isNewPanel={panelManagementApi.isNewPanel()}
        onCancel={() => {
          if (panelSettingsApi && panelSettingsSnapshot) {
            restorePanelSettings(panelSettingsApi, panelSettingsSnapshot);
          }
          panelManagementApi.onStopEditing(
            true,
            // DSL/form based charts are created via the full editor, so there's
            // an initial state to preserve. ES|QL charts are created inline, so it needs to pass an empty state
            // and the panelManagementApi will decide whether to remove the panel or not
            isNewlyCreated$.getValue() ? undefined : initialState
          );
          onCancel?.();
        }}
        onApply={async (newAttributes) => {
          let appliedAttributes = newAttributes;
          if (newAttributes.visualizationType != null) {
            const result = await onApply?.(newAttributes);
            if (result) {
              appliedAttributes = result;
            }
          }
          panelManagementApi.onStopEditing(false, {
            ...getState(),
            attributes: appliedAttributes,
          });
          return appliedAttributes;
        }}
        isReadOnly={panelManagementApi.canShowConfig() && !panelManagementApi.isEditingEnabled()}
        parentApi={parentApi}
        applyButtonLabel={applyButtonLabel}
        panelSettingsApi={panelSettingsApi}
      />
    );
  };
}
