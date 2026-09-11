/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { OverlayRef } from '@kbn/core-mount-utils-browser';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';
import type { TimeRange } from '@kbn/es-query';
import type { HasInspectorAdapters } from '@kbn/inspector-plugin/public';
import type {
  CanCancelRequests,
  HasEditCapabilities,
  HasLibraryTransforms,
  HasSupportedTriggers,
  PublishesDataLoading,
  PublishesDataViews,
  PublishesEsql,
  PublishesProjectRoutingOverrides,
  PublishesRendered,
  PublishesTimeRange,
  PublishesTitle,
  PublishesWritableTitle,
  SerializedTimeRange,
  SerializedTitles,
} from '@kbn/presentation-publishing';
import type { DeepPartial } from '@kbn/utility-types';
import type { VisParams } from '@kbn/visualizations-common';
import type { SerializedDrilldowns } from '@kbn/embeddable-plugin/server';
import type { VisualizeEmbeddableState } from '../../common/embeddable/types';
import type { HasVisualizeConfig } from './interfaces/has_visualize_config';
import type { Vis, VisSavedObject } from '../types';
import type { SerializedVis } from '../vis';

export type ExtraSavedObjectProperties = Pick<
  VisSavedObject,
  | 'lastSavedTitle'
  | 'displayName'
  | 'getDisplayName'
  | 'getEsType'
  | 'managed'
  | 'sharingSavedObjectProps'
>;

export type VisualizeRuntimeState = SerializedTitles &
  SerializedTimeRange &
  SerializedDrilldowns & {
    serializedVis: SerializedVis<VisParams>;
    savedObjectId?: string;
    savedObjectProperties?: ExtraSavedObjectProperties;
  };

export type VisualizeEditorInput = Omit<VisualizeRuntimeState, 'vis'> & {
  savedVis?: SerializedVis<VisParams>;
  timeRange: TimeRange;
  vis?: Vis<VisParams> & { colors?: Record<string, string>; legendOpen?: boolean };
};

export type VisualizeApi = Partial<HasEditCapabilities> &
  CanCancelRequests &
  PublishesWritableTitle &
  PublishesDataViews &
  PublishesDataLoading &
  PublishesRendered &
  PublishesProjectRoutingOverrides &
  PublishesEsql &
  Required<PublishesTitle> &
  HasVisualizeConfig &
  HasInspectorAdapters &
  HasSupportedTriggers &
  PublishesTimeRange &
  HasLibraryTransforms &
  DefaultEmbeddableApi<VisualizeEmbeddableState> & {
    updateVis: (vis: DeepPartial<SerializedVis<VisParams>>) => void;
    openInspector: () => OverlayRef | undefined;
  };
