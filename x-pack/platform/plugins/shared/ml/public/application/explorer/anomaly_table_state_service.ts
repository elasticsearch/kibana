/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient } from '@kbn/core/public';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import type { Observable } from 'rxjs';
import {
  combineLatest,
  distinctUntilChanged,
  switchMap,
  BehaviorSubject,
  of,
  map,
  catchError,
  Subscription,
  startWith,
  skipWhile,
  tap,
} from 'rxjs';
import { get, isEqual } from 'lodash';
import type { InfluencersFilterQuery, MlAnomaliesTableRecordExtended } from '@kbn/ml-anomaly-utils';
import { ML_JOB_AGGREGATION, getEntityFieldList } from '@kbn/ml-anomaly-utils';
import type { UrlStateService } from '@kbn/ml-url-state';
import { mlTimefilterRefresh$ } from '@kbn/ml-date-picker';
import type { TimeRangeBounds } from '@kbn/data-plugin/common';
import { extractErrorMessage } from '@kbn/ml-error-utils';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type { MlJobService } from '../services/job_service';
import type { MlApi } from '../services/ml_api_service';
import type { AnomalyExplorerCommonStateService } from './anomaly_explorer_common_state';
import type { TableSeverityState } from '../components/controls/select_severity';
import { resolveSeverityFormat } from '../../../common/util/severity_threshold';
import type { TableInterval } from '../components/controls/select_interval/select_interval';
import type { AnomalyTimelineStateService } from './anomaly_timeline_state_service';
import type { AnomaliesTableData, AppStateSelectedCells, ExplorerJob } from './explorer_utils';
import {
  getDateFormatTz,
  getSelectionInfluencers,
  getSelectionJobIds,
  getSelectionTimeRange,
} from './explorer_utils';
import { ANOMALIES_TABLE_DEFAULT_QUERY_SIZE } from '../../../common/constants/search';
import { MAX_CATEGORY_EXAMPLES } from './explorer_constants';
import {
  isModelPlotChartableForDetector,
  isModelPlotEnabled,
  isSourceDataChartableForDetector,
} from '../../../common/util/job_utils';
import { StateService } from '../services/state_service';
import type { Refresh } from '../routing/use_refresh';

export class AnomalyTableStateService extends StateService {
  private _tableData$ = new BehaviorSubject<AnomaliesTableData | null>(null);
  private _tableDataLoading$ = new BehaviorSubject<boolean>(true);
  private _tableError$ = new BehaviorSubject<string | null>(null);
  private _timeBounds$: Observable<TimeRangeBounds>;
  private _refreshSubject$: Observable<Refresh>;

  constructor(
    private readonly mlApi: MlApi,
    private readonly mlJobService: MlJobService,
    private readonly uiSettings: IUiSettingsClient,
    private readonly timefilter: TimefilterContract,
    private readonly anomalyExplorerCommonStateService: AnomalyExplorerCommonStateService,
    private readonly anomalyTimelineStateService: AnomalyTimelineStateService,
    private readonly tableSeverityUrlStateService: UrlStateService<TableSeverityState>,
    private readonly tableIntervalUrlStateService: UrlStateService<TableInterval>
  ) {
    super();

    this._timeBounds$ = this.timefilter.getTimeUpdate$().pipe(
      startWith(null),
      map(() => this.timefilter.getBounds())
    );
    this._refreshSubject$ = mlTimefilterRefresh$.pipe(startWith({ lastRefresh: 0 }));

    this._init();
  }

  public readonly tableData$ = this._tableData$.asObservable();

  public get tableData(): AnomaliesTableData | null {
    return this._tableData$.getValue();
  }

  public readonly tableDataLoading$ = this._tableDataLoading$.asObservable();

  public get tableDataLoading(): boolean {
    return this._tableDataLoading$.getValue();
  }

  public readonly tableError$ = this._tableError$.asObservable();

  public get tableError(): string | null {
    return this._tableError$.getValue();
  }

  protected _initSubscriptions(): Subscription {
    const subscriptions = new Subscription();

    // Add the main subscription that updates tableData$
    subscriptions.add(
      combineLatest([
        this.anomalyTimelineStateService.getSelectedCells$(),
        this.anomalyExplorerCommonStateService.selectedJobs$,
        this.anomalyTimelineStateService.getViewBySwimlaneFieldName$(),
        this.tableIntervalUrlStateService.getUrlState$(),
        this.tableSeverityUrlStateService.getUrlState$(),
        this.anomalyExplorerCommonStateService.influencerFilterQuery$,
        this._refreshSubject$,
        this._timeBounds$,
      ])
        .pipe(
          distinctUntilChanged((prev, curr) => isEqual(prev, curr)),
          skipWhile(
            ([selectedCells, selectedJobs, viewBySwimlaneFieldName]) =>
              selectedCells === undefined ||
              !selectedJobs ||
              selectedJobs.length === 0 ||
              viewBySwimlaneFieldName === undefined
          ),
          tap(() => this._tableDataLoading$.next(true)),
          switchMap(
            ([
              selectedCells,
              selectedJobs,
              viewBySwimlaneFieldName,
              tableInterval,
              tableSeverity,
              influencersFilterQuery,
            ]) => {
              // Resolve the severity format in case it's in the old format
              const resolvedSeverity = resolveSeverityFormat(tableSeverity.val);

              // Clear previous error before starting a new load cycle
              this._tableError$.next(null);
              return this.loadAnomaliesTableData(
                selectedCells,
                selectedJobs,
                // viewBySwimlaneFieldName is guaranteed to be defined by the skipWhile
                viewBySwimlaneFieldName!,
                tableInterval.val,
                resolvedSeverity,
                influencersFilterQuery
              ).pipe(
                map((tableData) => ({
                  tableData,
                  tableDataLoading: false,
                })),
                catchError((error) => {
                  const message = extractErrorMessage(error);
                  this._tableError$.next(message);
                  return of({ tableData: null, tableDataLoading: false });
                })
              );
            }
          )
        )
        .subscribe((result) => {
          // Update the BehaviorSubject with new data
          this._tableData$.next(result.tableData);
          this._tableDataLoading$.next(false);
        })
    );

    return subscriptions;
  }

  private loadAnomaliesTableData(
    selectedCells: AppStateSelectedCells | undefined | null,
    selectedJobs: ExplorerJob[],
    fieldName: string,
    tableInterval: string,
    tableSeverity: SeverityThreshold[],
    influencersFilterQuery?: InfluencersFilterQuery
  ): Observable<AnomaliesTableData | null> {
    const jobIds = getSelectionJobIds(selectedCells, selectedJobs);
    const influencers = getSelectionInfluencers(selectedCells, fieldName);
    const bounds = this.timefilter.getBounds();
    const timeRange = getSelectionTimeRange(selectedCells, bounds);
    const dateFormatTz = getDateFormatTz(this.uiSettings);

    return this.mlApi.results
      .getAnomaliesTableData(
        jobIds,
        [],
        influencers,
        tableInterval,
        tableSeverity,
        timeRange.earliestMs,
        timeRange.latestMs,
        dateFormatTz,
        ANOMALIES_TABLE_DEFAULT_QUERY_SIZE,
        MAX_CATEGORY_EXAMPLES,
        influencersFilterQuery
      )
      .pipe(
        map((resp) => {
          const detectorsByJob = this.mlJobService.detectorsByJob;

          const anomalies = resp.anomalies.map((anomaly) => {
            const jobId = anomaly.jobId;
            const detector = get(detectorsByJob, [jobId, anomaly.detectorIndex]);

            const extendedAnomaly = { ...anomaly } as MlAnomaliesTableRecordExtended;

            extendedAnomaly.detector = get(
              detector,
              ['detector_description'],
              anomaly.source.function_description
            );

            if (detector !== undefined && detector.custom_rules !== undefined) {
              extendedAnomaly.rulesLength = detector.custom_rules.length;
            }

            const job = this.mlJobService.getJob(jobId);
            let isChartable = isSourceDataChartableForDetector(job, anomaly.detectorIndex);
            if (
              isChartable === false &&
              isModelPlotChartableForDetector(job, anomaly.detectorIndex)
            ) {
              const entityFields = getEntityFieldList(anomaly.source);
              isChartable = isModelPlotEnabled(job, anomaly.detectorIndex, entityFields);
            }

            extendedAnomaly.isTimeSeriesViewRecord = isChartable;

            extendedAnomaly.isGeoRecord =
              detector !== undefined && detector.function === ML_JOB_AGGREGATION.LAT_LONG;

            if (this.mlJobService.customUrlsByJob[jobId] !== undefined) {
              extendedAnomaly.customUrls = this.mlJobService.customUrlsByJob[jobId];
            }

            return extendedAnomaly;
          });

          return {
            anomalies,
            interval: resp.interval,
            examplesByJobId: resp.examplesByJobId ?? {},
            showViewSeriesLink: true,
            jobIds,
          };
        })
      );
  }
}
