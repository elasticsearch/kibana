/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import type { MlEntityField } from '@kbn/ml-anomaly-utils';
import type {
  AnomalyChartsEmbeddableState,
  SeverityThreshold,
} from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import type { AnomalySwimLaneEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import type { AnomalySingleMetricViewerEmbeddableType } from '@kbn/ml-common-types/embeddables/single_metric_viewer';
import type {
  EmbeddableApiContext,
  HasEditCapabilities,
  HasParentApi,
  HasType,
  PublishesUnifiedSearch,
  PublishingSubject,
  PublishesTimeRange,
  PublishesWritableTitle,
  PublishesDataViews,
} from '@kbn/presentation-publishing';
import { type BehaviorSubject } from 'rxjs';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { AnomalyExplorerChartsEmbeddableType } from '@kbn/ml-common-types/embeddables/anomaly_charts';
import type { AnomalySwimLaneEmbeddableType } from '@kbn/ml-common-types/embeddables/anomaly_swimlane';
import type { MlDependencies } from '../application/app';
import type { MlCapabilitiesService } from '../application/capabilities/check_capabilities';
import type { AppStateSelectedCells } from '../application/explorer/explorer_utils';
import type { AnomalyDetectorService } from '../application/services/anomaly_detector_service';
import type { AnomalyExplorerChartsService } from '../application/services/anomaly_explorer_charts_service';
import type { AnomalyTimelineService } from '../application/services/anomaly_timeline_service';
import type { MlFieldFormatService } from '../application/services/field_format_service';
import type { MlApi } from '../application/services/ml_api_service';
import type { MlResultsService } from '../application/services/results_service';
import type { MlTimeSeriesSearchService } from '../application/timeseriesexplorer/timeseriesexplorer_utils/time_series_search_service';
import type { TimeSeriesExplorerService } from '../application/util/time_series_explorer_service';
import type { ToastNotificationService } from '../application/services/toast_notification_service';
import type { MlPublicUsageCollection } from '../application/services/usage_collection';

export type { AnomalySwimLaneEmbeddableApi } from './anomaly_swimlane/types';

export type MlEmbeddableTypes =
  | AnomalySwimLaneEmbeddableType
  | AnomalyExplorerChartsEmbeddableType
  | AnomalySingleMetricViewerEmbeddableType;

/**
 * Common API for all ML embeddables
 */
export interface MlEmbeddableBaseApi<StateType extends object = object>
  extends DefaultEmbeddableApi<StateType>,
    PublishesTimeRange {}

export type MlEntity = Record<string, MlEntityField['fieldValue']>;

export interface AnomalySwimlaneServices {
  anomalyDetectorService: AnomalyDetectorService;
  anomalyTimelineService: AnomalyTimelineService;
}

export type AnomalySwimlaneEmbeddableServices = [
  CoreStart,
  MlDependencies,
  AnomalySwimlaneServices
];

export type EditSwimLaneActionApi = HasType<AnomalySwimLaneEmbeddableType> &
  Partial<HasParentApi<PublishesUnifiedSearch>>;

export interface EditSwimlanePanelContext extends EmbeddableApiContext {
  embeddable: EditSwimLaneActionApi;
}

export interface SwimLaneDrilldownContext extends EditSwimlanePanelContext {
  /**
   * Optional data provided by swim lane selection
   */
  data?: AppStateSelectedCells;
}

export interface AnomalyChartsComponentApi {
  jobIds$: PublishingSubject<JobId[]>;
  maxSeriesToPlot$: PublishingSubject<number>;
  severityThreshold$: PublishingSubject<SeverityThreshold[] | undefined>;
  selectedEntities$: PublishingSubject<MlEntityField[] | undefined>;
  updateUserInput: (input: AnomalyChartsEmbeddableState) => void;
  updateSeverityThreshold: (v?: SeverityThreshold[]) => void;
  updateSelectedEntities: (entities?: MlEntityField[] | undefined) => void;
}
export interface AnomalyChartsDataLoadingApi {
  onRenderComplete: () => void;
  onLoading: (v: boolean) => void;
  onError: (error?: Error) => void;
}

export type AnomalyChartsApi = AnomalyChartsComponentApi & AnomalyChartsDataLoadingApi;

export type AnomalyChartsEmbeddableApi = MlEmbeddableBaseApi<AnomalyChartsEmbeddableState> &
  PublishesDataViews &
  PublishesWritableTitle &
  HasEditCapabilities &
  AnomalyChartsApi;

export interface AnomalyChartsFieldSelectionApi {
  jobIds: PublishingSubject<JobId[]>;
  entityFields: PublishingSubject<MlEntityField[] | undefined>;
}

/**
 * Case attachment wrapper state. The core Anomaly Charts embeddable state does
 * not persist id/query/filters; cases keep them alongside the embeddable state
 * so attachments can render with their original context.
 */
export type AnomalyChartsAttachmentState = AnomalyChartsEmbeddableState & {
  id?: string;
  query?: Query;
  filters?: Filter[];
};

/** Cases store query/filters next to the embeddable state; the embeddable schema itself doesn't persist them. */
export type AnomalySwimLaneAttachmentState = AnomalySwimLaneEmbeddableState & {
  id?: string;
  query?: Query;
  filters?: Filter[];
};

export interface AnomalyChartsAttachmentApi extends AnomalyChartsApi {
  parentApi: {
    query$: BehaviorSubject<Query | undefined>;
    filters$: BehaviorSubject<Filter[] | undefined>;
    timeRange$: BehaviorSubject<TimeRange | undefined>;
  };
}

/**
 * Persisted state for the Single Metric Embeddable.
 */
export type SingleMetricViewerEmbeddableApi =
  MlEmbeddableBaseApi<SingleMetricViewerEmbeddableState> &
    PublishesWritableTitle &
    HasEditCapabilities &
    SingleMetricViewerComponentApi;

/**
 * The serialized subset of the single metric viewer embeddable state that is owned by the
 * controls manager (job selection and detector/entity/forecast selection). Title and time
 * range are managed separately.
 */
export type SingleMetricViewerControlsState = Pick<
  SingleMetricViewerEmbeddableState,
  | 'job_ids'
  | 'selected_detector_index'
  | 'selected_entities'
  | 'function_description'
  | 'forecast_id'
>;

export interface SingleMetricViewerComponentApi {
  forecastId: PublishingSubject<string | undefined>;
  functionDescription: PublishingSubject<string | undefined>;
  jobIds: PublishingSubject<JobId[]>;
  selectedDetectorIndex: PublishingSubject<number>;
  selectedEntities: PublishingSubject<MlEntity | undefined>;

  updateUserInput: (input: SingleMetricViewerEmbeddableState) => void;
  updateForecastId: (id: string | undefined) => void;
}

export interface AnomalyChartsServices {
  anomalyDetectorService: AnomalyDetectorService;
  anomalyExplorerService: AnomalyExplorerChartsService;
  mlCapabilities: MlCapabilitiesService;
  mlFieldFormatService: MlFieldFormatService;
  mlResultsService: MlResultsService;
  mlApi: MlApi;
  mlUsageCollection: MlPublicUsageCollection;
}

export interface SingleMetricViewerServices {
  anomalyExplorerService: AnomalyExplorerChartsService;
  anomalyDetectorService: AnomalyDetectorService;
  mlApi: MlApi;
  mlCapabilities: MlCapabilitiesService;
  mlFieldFormatService: MlFieldFormatService;
  mlResultsService: MlResultsService;
  mlUsageCollection: MlPublicUsageCollection;
  mlTimeSeriesSearchService?: MlTimeSeriesSearchService;
  mlTimeSeriesExplorerService?: TimeSeriesExplorerService;
  toastNotificationService?: ToastNotificationService;
}

export type AnomalyChartsEmbeddableServices = [CoreStart, MlDependencies, AnomalyChartsServices];
export type SingleMetricViewerEmbeddableServices = [
  CoreStart,
  MlDependencies,
  SingleMetricViewerServices
];
export interface EditAnomalyChartsPanelContext {
  embeddable: AnomalyChartsEmbeddableApi;
}

export interface AnomalyChartsFieldSelectionContext extends EditAnomalyChartsPanelContext {
  /**
   * Optional fields selected using anomaly charts
   */
  data?: MlEntityField[];
}

export type MappedEmbeddableTypeOf<TEmbeddableType extends MlEmbeddableTypes> =
  TEmbeddableType extends AnomalyExplorerChartsEmbeddableType
    ? AnomalyChartsEmbeddableState
    : TEmbeddableType extends AnomalySingleMetricViewerEmbeddableType
    ? SingleMetricViewerEmbeddableState
    : unknown;
