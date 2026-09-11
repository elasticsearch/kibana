/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { CoreStart } from '@kbn/core/public';
import type { PublishingSubject } from '@kbn/presentation-publishing';
import type {
  TypedLensSerializedState,
  DatasourceStates,
  FramePublicAPI,
  UserMessagesGetter,
  LensDocument,
  LensInspector,
  LensDatasourceId,
} from '@kbn/lens-common';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';

import type { TextBasedQueryState } from '../../../editor_frame_service/editor_frame/config_panel/types';
import type { LensPluginStartDependencies } from '../../../plugin';

export interface FlyoutWrapperProps {
  children: JSX.Element;
  toolbar?: JSX.Element;
  layerTabs?: JSX.Element;
  isInlineFlyoutVisible: boolean;
  isScrollable: boolean;
  displayFlyoutHeader?: boolean;
  isNewPanel?: boolean;
  isSaveable?: boolean;
  onCancel?: () => void;
  onApply?: () => void | Promise<void>;
  navigateToLensEditor?: () => void;
  isReadOnly?: boolean;
  applyButtonLabel?: string;
  /** Tooltip to show when Apply button is disabled */
  applyButtonDisabledTooltip?: string;
}

/** Callback for updating the visualization and datasources state. */
export type LensPanelStateUpdater = (
  datasourceState: unknown,
  visualizationState: unknown,
  visualizationId?: string,
  /** When restoring state (e.g. on cancel), pass the datasource the state belongs to. */
  datasourceId?: LensDatasourceId,
  /** All datasource states from the editor store, so non-active loaded states are preserved. */
  allDatasourceStates?: DatasourceStates,
  adHocDataViews?: Record<string, DataViewSpec>
) => void;

export interface EditConfigPanelProps {
  coreStart: CoreStart;
  startDependencies: LensPluginStartDependencies;
  /** The attributes of the Lens embeddable */
  attributes: TypedLensSerializedState['attributes'];
  /** Callback for updating the visualization and datasources state. */
  updatePanelState: LensPanelStateUpdater;
  updateSuggestion?: (attrs: TypedLensSerializedState['attributes']) => void;
  /** Set the attributes state */
  setCurrentAttributes?: (attrs: TypedLensSerializedState['attributes']) => void;
  /** Embeddable output observable, useful for dashboard flyout  */
  dataLoading$?: PublishingSubject<boolean | undefined>;
  /** Contains the active data, necessary for some panel configuration such as coloring */
  lensAdapters?: ReturnType<LensInspector['getInspectorAdapters']>;
  /** Optional callback called when updating the by reference embeddable */
  updateByRefInput?: (soId: string, attrs: TypedLensSerializedState['attributes']) => void;
  /** Callback for closing the edit flyout */
  closeFlyout?: () => void;
  /** Boolean used for adding a flyout wrapper */
  wrapInFlyout?: boolean;
  /** Optional parameter for panel identification
   * If not given, Lens generates a new one
   */
  panelId?: string;
  /** Optional parameter for saved object id
   * Should be given if the lens embeddable is a by reference one
   * (saved in the library)
   */
  savedObjectId?: string;
  /** Callback for saving the embeddable as a SO */
  saveByRef?: (attrs: LensDocument) => void;
  /** Optional callback for navigation from the header of the flyout */
  navigateToLensEditor?: () => void;
  /** If set to true it displays a header on the flyout */
  displayFlyoutHeader?: boolean;
  /** If true, hides the ES|QL editor in the flyout */
  hideTextBasedEditor?: boolean;
  /** The flyout is used for adding a new panel by scratch */
  isNewPanel?: boolean;
  /** If set to true the layout changes to accordion and the text based query (i.e. ES|QL) can be edited */
  hidesSuggestions?: boolean;
  /** Apply button handler — may return updated attributes (e.g. with synced __lastSaved) */
  onApply?: (
    attrs: TypedLensSerializedState['attributes']
  ) => Promise<TypedLensSerializedState['attributes'] | void> | void;
  /** Cancel button handler */
  onCancel?: () => void;
  // Lens panels allow read-only "edit" where the user can look and tweak the existing chart, without
  // persisting the changes. This is useful for dashboards where the user wants to see the configuration behind
  isReadOnly?: boolean;
  /** The dashboard api, important for creating controls from the ES|QL editor */
  parentApi?: unknown;
  /** Text for the apply button. Defaults to "Apply and close" */
  applyButtonLabel?: string;
}

export interface LayerConfigurationProps {
  attributes: TypedLensSerializedState['attributes'];
  /** Embeddable output observable, useful for dashboard flyout  */
  dataLoading$?: PublishingSubject<boolean | undefined>;
  /** Contains the active data, necessary for some panel configuration such as coloring */
  lensAdapters?: ReturnType<LensInspector['getInspectorAdapters']>;
  coreStart: CoreStart;
  startDependencies: LensPluginStartDependencies;
  framePublicAPI: FramePublicAPI;
  hasPadding?: boolean;
  setIsInlineFlyoutVisible: (flag: boolean) => void;
  getUserMessages: UserMessagesGetter;
  onlyAllowSwitchToSubtypes?: boolean;
  updateSuggestion?: (attrs: TypedLensSerializedState['attributes']) => void;
  /** Set the attributes state */
  setCurrentAttributes?: (attrs: TypedLensSerializedState['attributes']) => void;
  parentApi?: unknown;
  panelId?: string;
  closeFlyout?: () => void;
  editorContainer?: HTMLElement;
  /** Callback to report text-based query state changes */
  onTextBasedQueryStateChange?: (state: TextBasedQueryState) => void;
}

export interface LayerTabsProps {
  attributes?: TypedLensSerializedState['attributes'];
  coreStart: CoreStart;
  framePublicAPI: FramePublicAPI;
  uiActions: LensPluginStartDependencies['uiActions'];
}
