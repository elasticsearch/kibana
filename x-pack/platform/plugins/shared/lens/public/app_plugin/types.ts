/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { History } from 'history';
import type { OnSaveProps } from '@kbn/saved-objects-plugin/public';
import type { Observable } from 'rxjs';
import type { TimeRange } from '@kbn/es-query';
import type { AppMountParameters, CoreStart, CoreTheme } from '@kbn/core/public';
import type {
  VisualizeFieldContext,
  ACTION_VISUALIZE_LENS_FIELD,
} from '@kbn/ui-actions-plugin/public';
import type { ACTION_CONVERT_TO_LENS } from '@kbn/visualizations-plugin/public';
import type { EmbeddableEditorState } from '@kbn/embeddable-plugin/public';
import type {
  LensAppLocatorParams,
  LensSerializedState,
  UserMessagesGetter,
  LensStartServices as StartServices,
  EditorFrameInstance,
  VisualizeEditorContext,
  LensTopNavMenuEntryGenerator,
  LensDocument,
  LensInspector,
} from '@kbn/lens-common';
import type { LensSerializedAPIConfig } from '@kbn/lens-common-2';
import type { IndexPatternServiceAPI } from '../data_views_service/service';

export interface RedirectToOriginProps {
  state?: LensSerializedAPIConfig;
  isCopied?: boolean;
}

export interface LensAppProps {
  history: History;
  editorFrame: EditorFrameInstance;
  onAppLeave: AppMountParameters['onAppLeave'];
  setHeaderActionMenu: AppMountParameters['setHeaderActionMenu'];
  redirectTo: (savedObjectId?: string) => void;
  redirectToOrigin?: (props?: RedirectToOriginProps) => void;

  // The initial input passed in by the container when editing. Can be either by reference or by value.
  initialInput?: LensSerializedState;

  // State passed in by the container which is used to determine the id of the Originating App.
  incomingState?: EmbeddableEditorState;
  initialContext?: VisualizeEditorContext | VisualizeFieldContext;
  contextOriginatingApp?: string;
  topNavMenuEntryGenerators: LensTopNavMenuEntryGenerator[];
  theme$: Observable<CoreTheme>;
  coreStart: CoreStart;
}

export type RunSave = (
  saveProps: Omit<OnSaveProps, 'newDescription'> & {
    returnToOrigin: boolean;
    dashboardId?: string | null;
    newDescription?: string;
    newTags?: string[];
    panelTimeRange?: TimeRange;
  },
  options: {
    saveToLibrary: boolean;
  }
) => Promise<void>;

export interface LensTopNavMenuProps {
  onAppLeave: AppMountParameters['onAppLeave'];

  redirectToOrigin?: (props?: RedirectToOriginProps) => void;
  // The initial input passed in by the container when editing. Can be either by reference or by value.
  initialInput?: LensSerializedState;
  // State passed in by the container when editing from a dashboard panel
  incomingState?: EmbeddableEditorState;
  getIsByValueMode: () => boolean;
  indicateNoData: boolean;
  setIsSaveModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  runSave: RunSave;
  title?: string;
  lensInspector: LensInspector;
  goBackToOriginatingApp?: () => void;
  contextOriginatingApp?: string;
  topNavMenuEntryGenerators: LensTopNavMenuEntryGenerator[];
  initialContext?: VisualizeFieldContext | VisualizeEditorContext;
  currentDoc: LensDocument | undefined;
  indexPatternService: IndexPatternServiceAPI;
  getUserMessages: UserMessagesGetter;
  shortUrlService: (params: LensAppLocatorParams) => Promise<string>;
  isCurrentStateDirty: boolean;
  startServices: StartServices;
}

export interface HistoryLocationState {
  type: typeof ACTION_VISUALIZE_LENS_FIELD | typeof ACTION_CONVERT_TO_LENS;
  payload: VisualizeFieldContext | VisualizeEditorContext;
  originatingApp?: string;
}

interface TopNavAction {
  visible: boolean;
  enabled?: boolean;
  execute: (anchorElement: HTMLElement) => void;
  getLink?: () => string | undefined;
  tooltip?: () => string | undefined;
}

type AvailableTopNavActions =
  | 'inspect'
  | 'saveAndReturn'
  | 'showSaveModal'
  | 'goBack'
  | 'cancel'
  | 'share'
  | 'export'
  | 'getUnderlyingDataUrl';
export type LensTopNavActions = Record<AvailableTopNavActions, TopNavAction>;
