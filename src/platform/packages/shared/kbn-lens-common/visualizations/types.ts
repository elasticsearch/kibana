/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { $Values } from '@kbn/utility-types';
import type { IconType } from '@elastic/eui';
import type { Ast } from '@kbn/interpreter';
import type { DragDropIdentifier, DropType } from '@kbn/dom-drag-drop';
import type { ExpressionAstExpression, Datatable } from '@kbn/expressions-plugin/common';
import type { AxesSettingsConfig as ExpressionAxesSettingsConfig } from '@kbn/expression-xy-plugin/common';
import type { ReactElement } from 'react';
import type { DataViewSpec } from '@kbn/data-plugin/common';
import type { EventAnnotationGroupConfig } from '@kbn/event-annotation-common';
import type { AlertRuleFromVisUIActionData } from '@kbn/alerts-ui-shared';
import type { IInterpreterRenderHandlers } from '@kbn/expressions-plugin/common';
import type { RowClickContext } from '@kbn/ui-actions-plugin/public';
import type {
  BrushTriggerEvent,
  ClickTriggerEvent,
  MultiClickTriggerEvent,
} from '@kbn/charts-plugin/public';
import type { ChartSizeEvent } from '@kbn/chart-expressions-common';
import type { Reference } from '@kbn/content-management-utils';
import type { LENS_COLLAPSE_FUNCTIONS } from './constants';
import {
  type LENS_CATEGORY_DISPLAY,
  type LENS_LEGEND_DISPLAY,
  type LENS_NUMBER_DISPLAY,
  type LENS_LAYER_TYPES,
} from './constants';
import type { SeriesType, XYVisualizationState } from './xy/types';
import type { LensTagCloudState } from './tagcloud/types';
import type { LensPartitionVisualizationState } from './partition/types';
import type { MetricVisualizationState } from './metric/types';
import type { LegacyMetricState } from './legacy_metric/types';
import type { GaugeVisualizationState } from './gauge/types';
import type {
  DatatableVisualizationState,
  LensPagesizeActionData,
  LensResizeActionData,
  LensSortActionData,
  LensToggleActionData,
} from './datatable/types';
import type { HeatmapVisualizationState } from './heatmap/types';
import type {
  SuggestionRequest,
  GeneralDatasourceStates,
  AnnotationGroups,
  VisualizationType,
  FramePublicAPI,
  Datasource,
  StateSetter,
  LayerAction,
  VisualizationConfigProps,
  VisualizationDimensionGroupConfig,
  VisualizationLayerWidgetProps,
  VisualizationToolbarProps,
  VisualizationDimensionChangeProps,
  DragDropOperation,
  GetDropPropsArgs,
  VisualizationLayerSettingsProps,
  VisualizationDimensionEditorProps,
  VisualizationSuggestion,
  DatasourceLayers,
  VisualizationDisplayOptions,
  VisualizationInfo,
  TableInspectorAdapter,
  VisualizeEditorContext,
  Suggestion,
  UserMessage,
} from '../types';
import type {
  LENS_EDIT_PAGESIZE_ACTION,
  LENS_EDIT_RESIZE_ACTION,
  LENS_EDIT_SORT_ACTION,
  LENS_TOGGLE_ACTION,
} from './datatable/constants';

export type CategoryDisplayType = $Values<typeof LENS_CATEGORY_DISPLAY>;
export type NumberDisplayType = $Values<typeof LENS_NUMBER_DISPLAY>;
export type LegendDisplayType = $Values<typeof LENS_LEGEND_DISPLAY>;

export type LensLayerType = (typeof LENS_LAYER_TYPES)[keyof typeof LENS_LAYER_TYPES];

export type CollapseFunction = (typeof LENS_COLLAPSE_FUNCTIONS)[number];

export type LensConfiguration =
  | XYVisualizationState
  | DatatableVisualizationState
  | LensPartitionVisualizationState
  | MetricVisualizationState
  | LegacyMetricState
  | GaugeVisualizationState
  | HeatmapVisualizationState
  | LensTagCloudState;

interface AddLayerButtonProps<T> {
  state: T;
  supportedLayers: VisualizationLayerDescription[];
  addLayer: AddLayerFunction;
  ensureIndexPattern: (specOrId: DataViewSpec | string) => Promise<void>;
  registerLibraryAnnotationGroup: RegisterLibraryAnnotationGroupFunction;
  isInlineEditing?: boolean;
  /** Hides annotation library options (used for ES|QL charts where library groups are data-view-based) */
  hideAnnotationLibrary?: boolean;
}

interface VisualizationStateFromContextChangeProps<T = unknown> {
  suggestions: Array<Suggestion<T>>;
  context: VisualizeEditorContext<T extends LensConfiguration ? T : LensConfiguration>;
}

export type AddLayerFunction<T = unknown> = (
  layerType: LensLayerType,
  extraArg?: T,
  ignoreInitialValues?: boolean,
  seriesType?: SeriesType
) => void;

export interface VisualizationLayerDescription {
  type: LensLayerType;
  label: string;
  icon?: IconType;
  noDatasource?: boolean;
  disabled?: boolean;
  toolTipContent?: string;
  initialDimensions?: Array<{
    columnId: string;
    groupId: string;
    staticValue?: unknown;
    autoTimeField?: boolean;
  }>;
}

export interface DimensionLink {
  from: { columnId: string; groupId: string; layerId: string };
  to: {
    columnId?: string;
    groupId: string;
    layerId: string;
  };
}

export type RegisterLibraryAnnotationGroupFunction = (groupInfo: {
  id: string;
  group: EventAnnotationGroupConfig;
}) => void;

// Use same technique as TriggerContext
export interface LensEditContextMapping {
  [LENS_EDIT_SORT_ACTION]: LensSortActionData;
  [LENS_EDIT_RESIZE_ACTION]: LensResizeActionData;
  [LENS_TOGGLE_ACTION]: LensToggleActionData;
  [LENS_EDIT_PAGESIZE_ACTION]: LensPagesizeActionData;
}

export type LensEditSupportedActions = keyof LensEditContextMapping;

export type LensEditPayload<T extends LensEditSupportedActions> = {
  action: T;
} & LensEditContextMapping[T];

type EditPayloadContext<T> = T extends LensEditSupportedActions ? LensEditPayload<T> : never;

export interface LensEditEvent<T> {
  name: 'edit';
  data: EditPayloadContext<T>;
}

export interface LensTableRowContextMenuEvent {
  name: 'tableRowContextMenuClick';
  data: RowClickContext['data'];
}

export interface LensAlertRulesEvent {
  name: 'alertRule';
  data: AlertRuleFromVisUIActionData;
}

export type TriggerEvent =
  | BrushTriggerEvent
  | ClickTriggerEvent
  | MultiClickTriggerEvent
  | LensTableRowContextMenuEvent
  | LensAlertRulesEvent;

/**
 * Expression renderer handlers specifically for lens renderers. This is a narrowed down
 * version of the general render handlers, specifying supported event types. If this type is
 * used, dispatched events will be handled correctly.
 */
export interface ILensInterpreterRenderHandlers extends IInterpreterRenderHandlers {
  event: (
    event:
      | ClickTriggerEvent
      | BrushTriggerEvent
      | LensEditEvent<LensEditSupportedActions>
      | LensTableRowContextMenuEvent
      | ChartSizeEvent
  ) => void;
}

export interface Visualization<T = unknown, P = T, ExtraAppendLayerArg = unknown> {
  /** Plugin ID, such as "lnsXY" */
  id: string;
  alias?: string[];

  /**
   * Initialize is allowed to modify the state stored in memory. The initialize function
   * is called with a previous state in two cases:
   * - Loading from a saved visualization
   * - When using suggestions, the suggested state is passed in
   */
  initialize: {
    (
      addNewLayer: () => string,
      nonPersistedState?: T,
      mainPalette?: SuggestionRequest['mainPalette'],
      datasourceStates?: GeneralDatasourceStates
    ): T;
    (
      addNewLayer: () => string,
      persistedState: P,
      mainPalette?: SuggestionRequest['mainPalette'],
      datasourceStates?: GeneralDatasourceStates,
      annotationGroups?: AnnotationGroups,
      references?: Reference[]
    ): T;
  };

  convertToRuntimeState?: (state: T, datasourceStates?: Record<string, unknown>) => T;

  getUsedDataView?: (state: T, layerId: string) => string | undefined;
  /**
   * Retrieve the used DataViews in the visualization
   */
  getUsedDataViews?: (state?: T) => string[];

  getMainPalette?: (state: T) => undefined | SuggestionRequest['mainPalette'];

  /**
   * Supported triggers of this visualization type when embedded somewhere
   */
  triggers?: string[];
  /**
   * Optional priority used to sort suggestions when multiple visualizations
   * compete. Higher values are sorted first. Defaults to 0.
   */
  suggestionPriority?: number;

  /**
   * Visualizations must provide at least one type for the chart switcher,
   * but can register multiple subtypes
   */
  visualizationTypes: VisualizationType[];
  /**
   * Return the ID of the current visualization. Used to highlight
   * the active subtype of the visualization.
   */
  getVisualizationTypeId: (state: T, layerId?: string) => string;

  hideFromChartSwitch?: (frame: FramePublicAPI) => boolean;
  /**
   * If the visualization has subtypes, update the subtype in state.
   */
  switchVisualizationType?: (visualizationTypeId: string, state: T, layerId?: string) => T;
  /** Description is displayed as the clickable text in the chart switcher */
  getDescription: (state: T, layerId?: string) => { icon?: IconType; label: string };
  /** Visualizations can have references as well */
  getPersistableState?: (
    state: T,
    datasource?: Datasource,
    datasourceState?: { state: unknown }
  ) => { state: P; references: Reference[] };
  /** Frame needs to know which layers the visualization is currently using */
  getLayerIds: (state: T) => string[];
  /** Reset button on each layer triggers this */
  clearLayer: (state: T, layerId: string, indexPatternId: string) => T;
  /** Reset button on each layer triggers this */
  cloneLayer?: (
    state: T,
    layerId: string,
    newLayerId: string,
    /** @param contains map old -> new id **/
    clonedIDsMap: Map<string, string>
  ) => T;
  /** Optional, if the visualization supports multiple layers */
  removeLayer?: (state: T, layerId: string) => T;
  /** Track added layers in internal state */
  appendLayer?: (
    state: T,
    layerId: string,
    type: LensLayerType,
    indexPatternId: string,
    extraArg?: ExtraAppendLayerArg,
    seriesType?: SeriesType
  ) => T;

  /** Retrieve a list of supported layer types with initialization data */
  getSupportedLayers: (
    state?: T,
    frame?: Pick<FramePublicAPI, 'datasourceLayers' | 'activeData'>
  ) => VisualizationLayerDescription[];
  /**
   * returns a list of custom actions supported by the visualization layer.
   * Default actions like delete/clear are not included in this list and are managed by the editor frame
   * */
  getSupportedActionsForLayer?: (
    layerId: string,
    state: T,
    setState: StateSetter<T>,
    registerLibraryAnnotationGroup: RegisterLibraryAnnotationGroupFunction,
    isSaveable?: boolean
  ) => LayerAction[];

  /**
   * This method is a clunky solution to the problem, but I'm banking on the confirm modal being removed
   * with undo/redo anyways
   */
  getCustomRemoveLayerText?: (
    layerId: string,
    state: T
  ) => { title?: string; description?: string } | undefined;

  /** returns the type string of the given layer */
  getLayerType: (layerId: string, state?: T) => LensLayerType | undefined;

  /**
   * Get the layers this one should be linked to (currently that means just keeping the data view in sync)
   */
  getLayersToLinkTo?: (state: T, newLayerId: string) => string[];

  /**
   * Returns a set of dimensions that should be kept in sync
   */
  getLinkedDimensions?: (state: T) => DimensionLink[];

  /* returns the type of removal operation to perform for the specific layer in the current state */
  getRemoveOperation?: (state: T, layerId: string) => 'remove' | 'clear';

  /**
   * For consistency across different visualizations, the dimension configuration UI is standardized
   */
  getConfiguration: (props: VisualizationConfigProps<T>) => {
    hidden?: boolean;
    groups: VisualizationDimensionGroupConfig[];
  };

  isSubtypeCompatible?: (subtype1?: string, subtype2?: string) => boolean;

  isSubtypeSupported?: (subtype: string) => boolean;

  /**
   * Header rendered as layer title. This can be used for both static and dynamic content like
   * for extra configurability, such as for switch chart type
   */
  getCustomLayerHeader?: (
    props: VisualizationLayerWidgetProps<T>
  ) => undefined | ReactElement<VisualizationLayerWidgetProps<T>>;

  getSubtypeSwitch?: (props: VisualizationLayerWidgetProps<T>) => (() => JSX.Element) | null;

  /**
   * Layer panel content rendered. This can be used to render a custom content below the title,
   * like a custom dataview switch
   */
  LayerPanelComponent?: (
    props: VisualizationLayerWidgetProps<T>
  ) => null | ReactElement<VisualizationLayerWidgetProps<T>>;

  /**
   * Flyout toolbar component that renders visualization-specific controls
   * in a flyout panel. Provides configuration options for style, legend and filters.
   */
  FlyoutToolbarComponent?: (
    props: VisualizationToolbarProps<T> & { isInlineEditing: boolean }
  ) => null | ReactElement<VisualizationToolbarProps<T> & { isInlineEditing: boolean }>;

  /**
   * The frame is telling the visualization to update or set a dimension based on user interaction
   * groupId is coming from the groupId provided in getConfiguration
   */
  setDimension: (
    props: VisualizationDimensionChangeProps<T> & { groupId: string; previousColumn?: string }
  ) => T;

  reorderDimension?: (
    props: VisualizationDimensionChangeProps<T> & { groupId: string; targetColumnId: string }
  ) => T;
  /**
   * The frame is telling the visualization to remove a dimension. The visualization needs to
   * look at its internal state to determine which dimension is being affected.
   */
  removeDimension: (props: VisualizationDimensionChangeProps<T>) => T;
  /**
   * Allow defining custom behavior for the visualization when the drop action occurs.
   */
  onDrop?: (props: {
    prevState: T;
    target: DragDropOperation;
    source: DragDropIdentifier;
    frame: FramePublicAPI;
    dropType: DropType;
    group?: VisualizationDimensionGroupConfig;
  }) => T;

  getDropProps?: (
    dropProps: GetDropPropsArgs
  ) => { dropTypes: DropType[]; nextLabel?: string } | undefined;

  /**
   * Allows the visualization to announce whether or not it has any settings to show
   */
  hasLayerSettings?: (props: VisualizationConfigProps<T>) => Record<'data' | 'appearance', boolean>;

  LayerSettingsComponent?: (
    props: VisualizationLayerSettingsProps<T> & { section: 'data' | 'appearance' }
  ) => null | ReactElement<VisualizationLayerSettingsProps<T>>;

  /**
   * Additional editor that gets rendered inside the dimension popover in the "appearance" section.
   * This can be used to configure dimension-specific options
   */
  DimensionEditorComponent?: (
    props: VisualizationDimensionEditorProps<T>
  ) => null | ReactElement<VisualizationDimensionEditorProps<T>>;
  /**
   * Additional editor that gets rendered inside the dimension popover in an additional section below "appearance".
   * This can be used to configure dimension-specific options
   */
  DimensionEditorAdditionalSectionComponent?: (
    props: VisualizationDimensionEditorProps<T>
  ) => null | ReactElement<VisualizationDimensionEditorProps<T>>;
  /**
   * Additional editor that gets rendered inside the data section.
   * This can be used to configure dimension-specific options
   */
  DimensionEditorDataExtraComponent?: (
    props: VisualizationDimensionEditorProps<T>
  ) => null | ReactElement<VisualizationDimensionEditorProps<T>>;
  /**
   * Renders dimension trigger. Used only for noDatasource layers
   */
  DimensionTriggerComponent?: (props: {
    columnId: string;
    label: string;
  }) => null | ReactElement<{ columnId: string; label: string }>;
  getAddLayerButtonComponent?: (
    props: AddLayerButtonProps<T>
  ) => null | ReactElement<AddLayerButtonProps<T>>;
  /**
   * Creates map of columns ids and unique lables. Used only for noDatasource layers
   */
  getUniqueLabels?: (state: T) => Record<string, string>;
  /**
   * The frame will call this function on all visualizations at different times. The
   * main use cases where visualization suggestions are requested are:
   * - When dragging a field
   * - When opening the chart switcher
   * If the state is provided when requesting suggestions, the visualization is active.
   * Most visualizations will apply stricter filtering to suggestions when they are active,
   * because suggestions have the potential to remove the users's work in progress.
   */
  getSuggestions: (context: SuggestionRequest<T>) => Array<VisualizationSuggestion<T>>;

  toExpression: (
    state: T,
    datasourceLayers: DatasourceLayers,
    attributes?: Partial<{ title: string; description: string }>,
    datasourceExpressionsByLayers?: Record<string, Ast>
  ) => ExpressionAstExpression | string | null;
  /**
   * Expression to render a preview version of the chart in very constrained space.
   * If there is no expression provided, the preview icon is used.
   */
  toPreviewExpression?: (
    state: T,
    datasourceLayers: DatasourceLayers,
    datasourceExpressionsByLayers?: Record<string, Ast>
  ) => ExpressionAstExpression | string | null;

  /**
   * The frame will call this function on all visualizations at few stages (pre-build/build error) in order
   * to provide more context to the error and show it to the user
   */
  getUserMessages?: (
    state: T,
    deps: { frame: FramePublicAPI; setState?: StateSetter<T> }
  ) => UserMessage[];

  /**
   * On Edit events the frame will call this to know what's going to be the next visualization state
   */
  onEditAction?: (state: T, event: LensEditEvent<LensEditSupportedActions>) => T;

  onDatasourceUpdate?: (state: T, frame?: FramePublicAPI) => T;

  /**
   * Some visualization track indexPattern changes (i.e. annotations)
   * This method makes it aware of the change and produces a new updated state
   */
  onIndexPatternChange?: (state: T, indexPatternId: string, layerId?: string) => T;
  onIndexPatternRename?: (state: T, oldIndexPatternId: string, newIndexPatternId: string) => T;
  getLayersToRemoveOnIndexPatternChange?: (state: T) => string[];
  /**
   * Gets custom display options for showing the visualization.
   */
  getDisplayOptions?: () => VisualizationDisplayOptions;

  /**
   * Get RenderEventCounters events for telemetry
   */
  getRenderEventCounters?: (state: T) => string[];

  getSuggestionFromConvertToLensContext?: (
    props: VisualizationStateFromContextChangeProps<T>
  ) => Suggestion<T> | undefined;

  isEqual?: (
    state1: P,
    references1: Reference[],
    state2: P,
    references2: Reference[],
    annotationGroups: AnnotationGroups
  ) => boolean;

  getVisualizationInfo?: (state: T, frame?: FramePublicAPI) => VisualizationInfo;
  /**
   * A visualization can return custom dimensions for the reporting tool
   */
  getReportingLayout?: (state: T) => { height: number; width: number };
  /**
   * Get all datatables to be exported as csv
   */
  getExportDatatables?: (
    state: T,
    datasourceLayers?: DatasourceLayers,
    activeData?: TableInspectorAdapter
  ) => Datatable[];
  /**
   * returns array of telemetry events for the visualization on save
   */
  getTelemetryEventsOnSave?: (state: T, prevState?: T) => string[];
}

export interface VisualizationState {
  activeId: string | null;
  selectedLayerId: string | null;
  state: unknown;
}

export type AxesSettingsConfig = ExpressionAxesSettingsConfig & {
  x: boolean;
};
