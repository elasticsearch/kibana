/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type {
  DiscoverSessionTab,
  SavedSearchByValueAttributes,
} from '@kbn/saved-search-plugin/common';
import { SEARCH_EMBEDDABLE_TYPE } from '@kbn/discover-utils';
import type { EmbeddableEditorState, EmbeddableStateTransfer } from '@kbn/embeddable-plugin/public';
import type { ApplicationStart } from '@kbn/core/public';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import type { ControlPanelState, ControlPanelsState } from '@kbn/control-group-renderer';
import { ESQL_CONTROL } from '@kbn/controls-constants';
import type { SearchEmbeddableByReferenceState } from '../../common/embeddable/types';
import type { SearchEmbeddablePanelApiState } from '../embeddable/types';

export interface DiscoverSessionByValueInput {
  discoverSessionTab: DiscoverSessionTab | undefined;
  dashboardControlGroupState: ControlPanelsState<OptionsListESQLControlState> | undefined;
}

/**
 * Specifies the action to be taken for navigating back to an editor.
 */
export enum TransferAction {
  /**
   * A Cancel operation. Returns to the editor without modifying the original state.
   */
  Cancel,
  /**
   * A Save Session operation. Updates the saved session and doesn't pass back any serialised state.
   */
  SaveSession,
  /**
   * A Save By Value operation. Sends the serialised embeddable attributes to the editor.
   */
  SaveByValue,
  /**
   * A Save By Reference operation. Sends a saved object reference to the editor.
   */
  SaveByReference,
}

interface TransferOptionsBase {
  path?: string;
  app?: string;
  newPanel?: boolean;
}

interface ByValueTransferOptions extends TransferOptionsBase {
  state: {
    byValueState: SavedSearchByValueAttributes;
    controlGroupState: ControlPanelsState<OptionsListESQLControlState> | undefined;
  };
}

interface ByReferenceTransferOptions extends TransferOptionsBase {
  state: SearchEmbeddableByReferenceState;
}

type CombinedTransferOptions = ByValueTransferOptions | ByReferenceTransferOptions;

type DiscoverTransferSerializedState =
  | ControlPanelState<OptionsListESQLControlState>
  | SearchEmbeddablePanelApiState
  | {};

interface GetSerializedStateResult {
  serializedState: SearchEmbeddablePanelApiState | {};
  controlGroupState: ControlPanelsState<OptionsListESQLControlState>;
}

export class EmbeddableEditorService {
  private embeddableState?: EmbeddableEditorState;

  constructor(
    private embeddableStateTransfer: EmbeddableStateTransfer,
    private application: ApplicationStart
  ) {
    this.embeddableState = embeddableStateTransfer.getIncomingEditorState('discover', true);
  }

  public canSaveToDashboard = (): boolean =>
    !this.isEmbeddedEditor() &&
    Boolean(this.application.capabilities.dashboard_v2.show) &&
    Boolean(this.application.capabilities.dashboard_v2.createNew);

  public isByValueEditor = (): boolean => Boolean(this.embeddableState?.valueInput);

  public isEmbeddedEditor = (): boolean => Boolean(this.embeddableState);

  public getEmbeddableId = (): string | undefined => this.embeddableState?.embeddableId;

  public getOriginatingPath = (): string | undefined => this.embeddableState?.originatingPath;

  public getByValueTab = (): DiscoverSessionTab | undefined =>
    this.getByValueInput().discoverSessionTab;

  /**
   * Resets the embeddable transfer state, ensuring it is cleared in storage and then dropped in memory.
   */
  public clearEditorState = () => {
    if (this.embeddableState) {
      this.embeddableStateTransfer.clearEditorState('discover');
      this.embeddableState = undefined;
    }
  };

  public transferBackToEditor(action: TransferAction.Cancel | TransferAction.SaveSession): void;
  public transferBackToEditor(
    action: TransferAction.SaveByValue,
    options: ByValueTransferOptions
  ): void;
  public transferBackToEditor(
    action: TransferAction.SaveByReference,
    options: ByReferenceTransferOptions
  ): void;
  /**
   * Initiates a navigation back to the editing application, either cancelling the current action to return
   * or passing a state for an embeddable to receive an updated view.
   *
   * **NOTE**: Cancelling will never pass an updated state, so the state param is ignored for cancel actions.
   */
  public transferBackToEditor(action: TransferAction, options?: CombinedTransferOptions) {
    const app = options?.app || this.embeddableState?.originatingApp;
    const path = options?.path || this.embeddableState?.originatingPath;
    const { serializedState, controlGroupState } = this.getSerializedState(action, options);
    const controlPackages = Object.entries(controlGroupState).map(
      ([embeddableId, controlPanelState]) => ({
        type: ESQL_CONTROL,
        serializedState: controlPanelState,
        embeddableId,
      })
    );

    if (app && path) {
      this.embeddableStateTransfer.clearEditorState('discover');
      this.embeddableStateTransfer.navigateToWithEmbeddablePackages<DiscoverTransferSerializedState>(
        app,
        {
          path,
          state:
            action !== TransferAction.Cancel
              ? [
                  ...controlPackages,
                  {
                    type: SEARCH_EMBEDDABLE_TYPE,
                    serializedState,
                    embeddableId: options?.newPanel
                      ? undefined
                      : this.embeddableState?.embeddableId,
                  },
                ]
              : [],
        }
      );
    }
  }

  private getSerializedState(
    action: TransferAction,
    options?: CombinedTransferOptions
  ): GetSerializedStateResult {
    if (action === TransferAction.SaveByValue) {
      const { state } = options as ByValueTransferOptions;
      return {
        serializedState: { attributes: state.byValueState },
        controlGroupState: reconcileControlGroupState({
          controlGroupState: state.controlGroupState ?? {},
          dashboardControlGroupState: this.getByValueInput().dashboardControlGroupState,
        }),
      };
    }

    if (action === TransferAction.SaveByReference) {
      const { state } = options as ByReferenceTransferOptions;
      return {
        serializedState: { ref_id: state.savedObjectId, overrides: {} },
        controlGroupState: {},
      };
    }

    return { serializedState: {}, controlGroupState: {} };
  }

  private getByValueInput(): DiscoverSessionByValueInput {
    return this.embeddableState?.valueInput
      ? (this.embeddableState.valueInput as DiscoverSessionByValueInput)
      : { discoverSessionTab: undefined, dashboardControlGroupState: undefined };
  }
}

const reconcileControlGroupState = ({
  controlGroupState,
  dashboardControlGroupState,
}: {
  controlGroupState: ControlPanelsState<OptionsListESQLControlState>;
  dashboardControlGroupState: ControlPanelsState<OptionsListESQLControlState> | undefined;
}): ControlPanelsState<OptionsListESQLControlState> => {
  if (!dashboardControlGroupState) {
    return controlGroupState;
  }

  const dashboardPanelIdsByVariable = Object.fromEntries(
    Object.entries(dashboardControlGroupState).map(([dashboardPanelId, dashboardPanelState]) => [
      dashboardPanelState.variable_name,
      dashboardPanelId,
    ])
  );

  return Object.entries(controlGroupState).reduce<ControlPanelsState<OptionsListESQLControlState>>(
    (acc, [discoverPanelId, panelState]) => {
      const nextPanelId = dashboardPanelIdsByVariable[panelState.variable_name] ?? discoverPanelId;

      acc[nextPanelId] = panelState;

      return acc;
    },
    {}
  );
};
