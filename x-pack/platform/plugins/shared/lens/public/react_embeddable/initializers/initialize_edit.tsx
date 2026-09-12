/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  HasEditCapabilities,
  HasReadOnlyCapabilities,
  HasSupportedTriggers,
  PublishesDisabledActionIds,
  PublishesViewMode,
  PublishingSubject,
  ViewMode,
} from '@kbn/presentation-publishing';
import { apiHasAppContext, apiPublishesDisabledActionIds } from '@kbn/presentation-publishing';
import { noop } from 'lodash';
import { EmbeddableStateTransfer, type PanelSettingsApi } from '@kbn/embeddable-plugin/public';
import { i18n } from '@kbn/i18n';
import { BehaviorSubject } from 'rxjs';
import type { Filter } from '@kbn/es-query';
import type {
  GetStateType,
  LensHasEditPanel,
  LensInspectorAdapters,
  LensInternalApi,
  LensRuntimeState,
} from '@kbn/lens-common';
import {
  ON_APPLY_FILTER,
  ON_CLICK_VALUE,
  ON_OPEN_PANEL_MENU,
  ON_SELECT_RANGE,
} from '@kbn/ui-actions-plugin/common/trigger_ids';
import { APP_ID, getEditPath } from '../../../common/constants';
import type { LensEmbeddableStartServices } from '../types';
import {
  extractInheritedViewModeObservable,
  saveUpdatedLinkedAnnotationsToLibrary,
} from '../helper';
import { prepareInlineEditPanel } from '../inline_editing/setup_inline_editing';
import { setupPanelManagement } from '../inline_editing/panel_management';
import { mountInlinePanel } from '../mount';
import type { StateManagementConfig } from './initialize_state_management';
import {
  apiPublishesInlineEditingCapabilities,
  apiPublishesIsEditableByUser,
} from '../type_guards';
import type { SearchContextConfig } from './initialize_search_context';
import { isESQLModeEnabled } from './utils';

function getSupportedTriggers(
  getState: GetStateType,
  visualizationMap: LensEmbeddableStartServices['visualizationMap']
) {
  return () => {
    const panelTriggers = [ON_OPEN_PANEL_MENU];
    const currentState = getState();
    if (currentState.attributes?.visualizationType) {
      return ensureNestedTriggers([
        ...panelTriggers,
        ...(visualizationMap[currentState.attributes.visualizationType]?.triggers ?? []),
      ]);
    }
    return panelTriggers;
  };
}

/**
 * ON_CLICK_VALUE and ON_SELECT_RANGE also trigger ON_APPLY_FILTER.
 * This function appends ON_APPLY_FILTER to the list of triggers if either ON_CLICK_VALUE
 * or ON_SELECT_RANGE is supported.
 * @param triggers
 */
function ensureNestedTriggers(triggers: string[]): string[] {
  if (
    !triggers.includes(ON_APPLY_FILTER) &&
    (triggers.includes(ON_CLICK_VALUE) || triggers.includes(ON_SELECT_RANGE))
  ) {
    return [...triggers, ON_APPLY_FILTER];
  }

  return triggers;
}

function isReadOnly(viewMode$: PublishingSubject<ViewMode>) {
  return viewMode$.getValue() === 'view';
}

function isEditMode(viewMode$: PublishingSubject<ViewMode>) {
  return viewMode$.getValue() === 'edit';
}

function hasManagedApi(api: unknown): api is { isManaged: boolean } {
  return Boolean(api && typeof (api as { isManaged?: boolean }).isManaged === 'boolean');
}

/**
 * Initialize the edit API for the embeddable
 **/
export function initializeEditApi(
  uuid: string,
  initialState: LensRuntimeState,
  getState: GetStateType,
  internalApi: LensInternalApi,
  stateApi: StateManagementConfig['api'],
  inspectorApi: LensInspectorAdapters,
  searchContextApi: SearchContextConfig['api'],
  isTextBasedLanguage: (currentState: LensRuntimeState) => boolean,
  startDependencies: LensEmbeddableStartServices,
  parentApi?: unknown,
  panelSettingsApi?: PanelSettingsApi
): {
  api: HasSupportedTriggers &
    PublishesDisabledActionIds &
    HasEditCapabilities &
    HasReadOnlyCapabilities &
    PublishesViewMode & { uuid: string } & LensHasEditPanel & { usesInlinePanelSettings: true };
} {
  const supportedTriggers = getSupportedTriggers(getState, startDependencies.visualizationMap);
  const isManaged = (currentState: LensRuntimeState) => {
    return currentState.managed || (hasManagedApi(parentApi) ? parentApi.isManaged : false);
  };

  const viewMode$ = extractInheritedViewModeObservable(parentApi);

  const { disabledActionIds$, setDisabledActionIds } = apiPublishesDisabledActionIds(parentApi)
    ? parentApi
    : {
        disabledActionIds$: new BehaviorSubject<string[] | undefined>(undefined),
        setDisabledActionIds: noop,
      };

  /**
   * Inline editing section
   */
  const navigateToLensEditor =
    (stateTransfer: EmbeddableStateTransfer, skipAppLeave?: boolean) => async () => {
      if (!parentApi || !apiHasAppContext(parentApi)) {
        return;
      }
      const parentApiContext = parentApi.getAppContext();
      const currentState = getState();
      await stateTransfer.navigateToEditor(APP_ID, {
        path: getEditPath(currentState.ref_id),
        state: {
          embeddableId: uuid,
          valueInput: currentState,
          originatingApp: parentApiContext.currentAppId ?? 'dashboards',
          originatingPath: parentApiContext.getCurrentPath?.(),
          searchSessionId: currentState.searchSessionId,
        },
        skipAppLeave,
      });
    };

  const panelManagementApi = setupPanelManagement(uuid, parentApi, {
    isNewlyCreated$: internalApi.isNewlyCreated$,
    setAsCreated: internalApi.setAsCreated,
    isReadOnly: () => isReadOnly(viewMode$),
    canEdit: () => isEditMode(viewMode$),
  });

  const updateState = (newState: Pick<LensRuntimeState, 'attributes' | 'ref_id'>) => {
    stateApi.updateAttributes(newState.attributes);
    stateApi.updateRefId(newState.ref_id);
  };

  /**
   * Use the search context api here for filters for 2 reasons:
   *  - the filters here have the correct references already injected
   *  - the edit filters flow may change in the future and this is the right place to get the filters
   */
  const getFilters = ({ attributes }: LensRuntimeState): Filter[] =>
    searchContextApi.filters$.getValue() ?? attributes.state.filters;

  const convertVisualizationState = ({ attributes }: LensRuntimeState) => {
    const visState = attributes.state.visualization;
    const convertToRuntimeState =
      startDependencies.visualizationMap[attributes.visualizationType ?? '']?.convertToRuntimeState;
    if (!convertToRuntimeState) return visState;
    return convertToRuntimeState(visState, attributes.state.datasourceStates);
  };

  /**
   * Wrap getState() when inline editing to ensure:
   *  - Filters in the attributes are properly injected with the correct references to avoid
   *    issues when saving/navigating to the full editor
   *  - Apply runtime conversions to visualization state
   */
  const getModifiedState = (): LensRuntimeState => {
    const currentState = getState();

    return {
      ...currentState,
      attributes: {
        ...currentState.attributes,
        state: {
          ...currentState.attributes.state,
          filters: getFilters(currentState),
          visualization: convertVisualizationState(currentState),
        },
      },
    };
  };

  // This will handle both edit and read only mode based on the view mode
  const getInlineEditor = prepareInlineEditPanel(
    initialState,
    getModifiedState,
    updateState,
    internalApi,
    panelManagementApi,
    inspectorApi,
    startDependencies,
    navigateToLensEditor,
    uuid,
    parentApi,
    panelSettingsApi
  );

  /**
   * The rest of the edit stuff
   */
  const { uiSettings, capabilities, data } = startDependencies;

  const canEdit = () => {
    if (!isEditMode(viewMode$)) {
      return false;
    }
    const currentState = getState();
    // check if it's in ES|QL mode
    if (isTextBasedLanguage(currentState) && !isESQLModeEnabled({ uiSettings })) {
      return false;
    }
    if (isManaged(currentState)) {
      return false;
    }
    return (
      Boolean(capabilities.visualize_v2.save) ||
      (!getState().ref_id &&
        Boolean(capabilities.dashboard_v2?.showWriteControls) &&
        Boolean(capabilities.visualize_v2.show))
    );
  };

  const canShowConfig = () => {
    return isReadOnly(viewMode$) && Boolean(capabilities.visualize_v2.show);
  };

  const getEditPanel = async (
    { closeFlyout }: { closeFlyout?: () => void } = {
      closeFlyout: noop,
    }
  ) => {
    if (canEdit()) {
      // prevent serializing incomplete state during editing
      internalApi.updateEditingState(true);
    }
    const firstState = getState();
    const ConfigPanel = await getInlineEditor({
      onCancel: () => {
        internalApi.updateEditingState(false);
        updateState({ ...firstState });
      },
      onApply: !canEdit()
        ? undefined
        : async (attributes) => {
            let appliedAttributes = attributes;
            if (attributes.visualizationType === 'lnsXY') {
              const updatedVisState = await saveUpdatedLinkedAnnotationsToLibrary(
                attributes.state.visualization,
                startDependencies.eventAnnotationService
              );
              appliedAttributes = {
                ...attributes,
                state: { ...attributes.state, visualization: updatedVisState },
              };
            }
            internalApi.updateEditingState(false);
            updateState({ ...getState(), attributes: appliedAttributes });
            return appliedAttributes;
          },
      closeFlyout: () => {
        internalApi.updateEditingState(false);
        closeFlyout?.();
      },
    });
    return ConfigPanel ?? undefined;
  };

  return {
    api: {
      uuid,
      viewMode$,
      usesInlinePanelSettings: true,
      getTypeDisplayName: () =>
        i18n.translate('xpack.lens.embeddableDisplayName', {
          defaultMessage: 'visualization',
        }),
      supportedTriggers,
      disabledActionIds$,
      setDisabledActionIds,

      /**
       * This is the key method to enable the new Editing capabilities API
       * Lens will leverage the neutral nature of this function to build the inline editing experience
       */
      onEdit: async () => {
        if (!parentApi || !apiHasAppContext(parentApi)) {
          return;
        }

        // this will force the embeddable to toggle the inline editing feature
        const canEditInline = apiPublishesInlineEditingCapabilities(parentApi)
          ? parentApi.canEditInline
          : true;

        // just navigate directly to the editor
        if (!canEditInline) {
          const navigateFn = navigateToLensEditor(
            new EmbeddableStateTransfer(
              startDependencies.coreStart.application.navigateToApp,
              startDependencies.coreStart.application.currentAppId$
            ),
            true
          );
          return navigateFn();
        }

        mountInlinePanel({
          core: startDependencies.coreStart,
          api: parentApi,
          loadContent: getEditPanel,
          options: { uuid, isEsql: isTextBasedLanguage(getState()) },
        });
      },
      getEditPanel,
      /**
       * Check everything here: user/app permissions and the current inline editing state
       */
      isEditingEnabled: () => {
        return Boolean(
          parentApi &&
            apiHasAppContext(parentApi) &&
            canEdit() &&
            panelManagementApi.isEditingEnabled()
        );
      },
      isReadOnlyEnabled: () => {
        // Check if user can actually edit this specific dashboard (considering access control)
        const isEditableByUser = apiPublishesIsEditableByUser(parentApi)
          ? parentApi.isEditableByUser
          : true;

        return {
          read: Boolean(parentApi && apiHasAppContext(parentApi) && canShowConfig()),
          write: Boolean(
            capabilities.dashboard_v2?.showWriteControls &&
              !isManaged(getState()) &&
              isEditableByUser
          ),
        };
      },
      onShowConfig: async () => {
        if (!parentApi || !apiHasAppContext(parentApi)) {
          return;
        }
        mountInlinePanel({
          core: startDependencies.coreStart,
          api: parentApi,
          loadContent: async ({ closeFlyout } = { closeFlyout: noop }) => {
            return getEditPanel({
              closeFlyout,
            });
          },
          options: { uuid, isEsql: isTextBasedLanguage(getState()) },
        });
      },
      getEditHref: async () => {
        if (!parentApi || !apiHasAppContext(parentApi)) {
          return;
        }
        const currentState = getState();
        return getEditPath(
          currentState.ref_id,
          currentState.time_range,
          currentState.filters,
          data.query.timefilter.timefilter.getRefreshInterval()
        );
      },
    },
  };
}
