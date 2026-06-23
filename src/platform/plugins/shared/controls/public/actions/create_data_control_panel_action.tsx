/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { apiHasEditorConfig } from '@kbn/control-group-renderer';
import type { DataControlState } from '@kbn/controls-schemas';
import { i18n } from '@kbn/i18n';
import {
  apiCanAddNewPanel,
  apiCanPinPanels,
  apiIsPresentationContainer,
  apiPublishesDataViews,
  type EmbeddableApiContext,
} from '@kbn/presentation-publishing';
import { IncompatibleActionError } from '@kbn/ui-actions-plugin/public';
import type { ActionDefinition } from '@kbn/ui-actions-plugin/public/actions';
import { ACTION_CREATE_CONTROL, ControlValuesSource } from '@kbn/controls-constants';
import { openDataControlEditor } from '../controls/data_controls/open_data_control_editor';
import { ADD_PANEL_CONTROL_GROUP } from './constants';
import type { CreateControlTypeContext } from './control_panel_actions';
import { dataViewsService } from '../services/kibana_services';

let lastUsedDataViewId: string | undefined;

export const createDataControlPanelAction = (): ActionDefinition<EmbeddableApiContext> => ({
  id: ACTION_CREATE_CONTROL,
  order: 1,
  grouping: [ADD_PANEL_CONTROL_GROUP],
  getIconType: () => 'controls',
  isCompatible: async ({ embeddable }) => apiCanAddNewPanel(embeddable),
  execute: async ({ embeddable }) => {
    if (!apiCanAddNewPanel(embeddable)) throw new IncompatibleActionError();
    const defaultDataViewId = apiHasEditorConfig(embeddable)
      ? embeddable.getEditorConfig()?.defaultDataViewId
      : undefined;
    const publishedDataViewId = apiPublishesDataViews(embeddable)
      ? embeddable.dataViews$.value?.[0]?.id
      : undefined;
    const parentDataViewId =
      defaultDataViewId ??
      lastUsedDataViewId ??
      publishedDataViewId ??
      (await dataViewsService.getDefaultDataView())?.id;

    openDataControlEditor({
      initialState: {
        data_view_id: parentDataViewId,
        values_source: ControlValuesSource.FIELD,
      },
      parentApi: embeddable,
      setLastUsedDataViewId: (dataViewId) => {
        lastUsedDataViewId = dataViewId;
      },
    });
  },
  getDisplayName: () =>
    i18n.translate('controls.createControlAction.displayNameAriaLabel', {
      defaultMessage: 'Control',
    }),

  getDisplayNameTooltip: () =>
    i18n.translate('controls.createControlAction.tooltip', {
      defaultMessage: 'Add a control to your dashboard.',
    }),
});

export const createDataControlOfType = <State extends DataControlState = DataControlState>(
  type: string,
  { embeddable, state, controlId }: CreateControlTypeContext<State>
) => {
  if (!apiIsPresentationContainer(embeddable)) throw new IncompatibleActionError();

  const {
    data_view_id: dataViewId,
    field_name: fieldName,
    values_source: valuesSource,
    esql_query: esqlQuery,
  } = state;
  if (valuesSource !== ControlValuesSource.ESQL && (!dataViewId || !fieldName)) {
    // this shouldn't happen due to constraints in the editor UI - however, if it does, throw an error
    throw new Error(
      i18n.translate('controls.dataControl.creationError', {
        defaultMessage:
          'Both the data view and the field must be defined in order to create a control.',
      })
    );
  } else if (valuesSource === ControlValuesSource.ESQL && !esqlQuery) {
    throw new Error(
      i18n.translate('controls.dataControl.creationErrorESQL', {
        defaultMessage: 'A values query must be defined in order to create a control.',
      })
    );
  }

  const newControl = {
    panelType: type,
    serializedState: state,
  };

  if (controlId) {
    // the control exists but changed type - so, replace the old control
    embeddable.replacePanel(controlId, newControl);
  } else if (apiCanPinPanels(embeddable)) {
    // otherwise, add a new control as either pinned or not depending on whether the parent allows it
    embeddable.addPinnedPanel(newControl);
  } else {
    embeddable.addNewPanel(newControl, { displaySuccessMessage: true });
  }
};
