/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { BehaviorSubject, combineLatest, of, Subscription } from 'rxjs';
import { distinctUntilChanged, map, skipWhile, switchMap } from 'rxjs';
import type { UrlStateService } from '@kbn/ml-url-state';
import { StateService } from '../services/state_service';
import type { AnomalyExplorerCommonStateService } from './anomaly_explorer_common_state';
import type { AnomalyTimelineStateService } from './anomaly_timeline_state_service';
import type { ExplorerChartsData } from './explorer_charts/explorer_charts_container_service';
import { getDefaultChartsData } from './explorer_charts/explorer_charts_container_service';
import type { AnomalyExplorerChartsService } from '../services/anomaly_explorer_charts_service';
import { getSelectionInfluencers, getSelectionJobIds } from './explorer_utils';
import type { TableSeverityState } from '../components/controls/select_severity';
import { resolveSeverityFormat } from '../../../common/util/severity_threshold';
import type { AnomalyExplorerUrlStateService } from './hooks/use_explorer_url_state';

export class AnomalyChartsStateService extends StateService {
  private _isChartsDataLoading$ = new BehaviorSubject<boolean>(false);
  private _chartsData$ = new BehaviorSubject<ExplorerChartsData>(getDefaultChartsData());
  private _showCharts$ = new BehaviorSubject<boolean>(true);

  constructor(
    private _anomalyExplorerCommonStateService: AnomalyExplorerCommonStateService,
    private _anomalyTimelineStateServices: AnomalyTimelineStateService,
    private _anomalyExplorerChartsService: AnomalyExplorerChartsService,
    private _anomalyExplorerUrlStateService: AnomalyExplorerUrlStateService,
    private _tableSeverityState: UrlStateService<TableSeverityState>
  ) {
    super();
    this._init();
  }

  protected _initSubscriptions(): Subscription {
    const subscription = new Subscription();

    subscription.add(
      this._anomalyExplorerUrlStateService
        .getUrlState$()
        .pipe(
          map((urlState) => urlState?.mlShowCharts ?? true),
          distinctUntilChanged()
        )
        .subscribe(this._showCharts$)
    );

    subscription.add(this.initChartDataSubscription());

    return subscription;
  }

  private initChartDataSubscription() {
    return combineLatest([
      this._anomalyExplorerCommonStateService.selectedJobs$,
      this._anomalyExplorerCommonStateService.influencerFilterQuery$,
      this._anomalyTimelineStateServices.getContainerWidth$().pipe(skipWhile((v) => v === 0)),
      this._anomalyTimelineStateServices.getSelectedCells$(),
      this._anomalyTimelineStateServices.getViewBySwimlaneFieldName$(),
      this._tableSeverityState.getUrlState$(),
    ])
      .pipe(
        switchMap(
          ([
            selectedJobs,
            influencerFilterQuery,
            containerWidth,
            selectedCells,
            viewBySwimlaneFieldName,
            severityState,
          ]) => {
            if (!selectedCells) return of(getDefaultChartsData());

            const jobIds = getSelectionJobIds(selectedCells, selectedJobs);
            this._isChartsDataLoading$.next(true);

            const selectionInfluencers = getSelectionInfluencers(
              selectedCells,
              viewBySwimlaneFieldName!
            );

            // Resolve the severity format in case it's in the old format
            const resolvedSeverity = resolveSeverityFormat(severityState.val);

            return this._anomalyExplorerChartsService.getAnomalyData$(
              jobIds,
              containerWidth!,
              selectedCells?.times[0] * 1000,
              selectedCells?.times[1] * 1000,
              resolvedSeverity,
              influencerFilterQuery,
              selectionInfluencers,
              6
            );
          }
        )
      )
      .subscribe((v) => {
        this._chartsData$.next(v);
        this._isChartsDataLoading$.next(false);
      });
  }

  public getChartsData$(): Observable<ExplorerChartsData> {
    return this._chartsData$.asObservable();
  }

  public getChartsData(): ExplorerChartsData {
    return this._chartsData$.getValue();
  }

  public getShowCharts$(): Observable<boolean> {
    return this._showCharts$.asObservable();
  }

  public getShowCharts(): boolean {
    return this._showCharts$.getValue();
  }

  public setShowCharts(update: boolean) {
    this._anomalyExplorerUrlStateService.updateUrlState({ mlShowCharts: update });
  }

  public isChartsDataLoading$(): Observable<boolean> {
    return this._isChartsDataLoading$.asObservable();
  }

  public isChartsDataLoading(): boolean {
    return this._isChartsDataLoading$.getValue();
  }
}
