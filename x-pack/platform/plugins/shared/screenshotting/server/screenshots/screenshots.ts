/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import ipaddr from 'ipaddr.js';
import { defaultsDeep, sum } from 'lodash';
import moment from 'moment';
import type { Observable } from 'rxjs';
import {
  catchError,
  concatMap,
  first,
  from,
  map,
  mergeMap,
  of,
  take,
  takeUntil,
  tap,
  throwError,
  toArray,
} from 'rxjs';

import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { HttpServiceSetup, Logger, PackageInfo } from '@kbn/core/server';
import { Semaphore } from '@kbn/std';

import type { ConfigType } from '@kbn/screenshotting-server';
import { durationToNumber } from '@kbn/screenshotting-server';
import type { CaptureResult, ScreenshotOptions, ScreenshotResult } from '.';
import {
  SCREENSHOTTING_APP_ID,
  SCREENSHOTTING_EXPRESSION,
  SCREENSHOTTING_EXPRESSION_INPUT,
  errors,
} from '../../common';
import type { HeadlessChromiumDriverFactory } from '../browsers';
import { systemHasInsufficientMemory } from '../cloud';
import type {
  PdfScreenshotOptions,
  PdfScreenshotResult,
  PngScreenshotOptions,
  PngScreenshotResult,
} from '../formats';
import { toPdf, toPng } from '../formats';
import type { Layout } from '../layouts';
import { createLayout } from '../layouts';
import { EventLogger, Transactions } from './event_logger';
import type { ScreenshotObservableOptions, UrlOrUrlWithContext } from './observable';
import { ScreenshotObservableHandler } from './observable';

const DEFAULT_SETUP_RESULT = {
  elementsPositionAndAttributes: null,
  timeRange: null,
};

export class Screenshots {
  private semaphore: Semaphore;

  constructor(
    private readonly browserDriverFactory: HeadlessChromiumDriverFactory,
    private readonly logger: Logger,
    private readonly packageInfo: PackageInfo,
    private readonly http: HttpServiceSetup,
    private readonly config: ConfigType,
    private readonly cloud?: CloudSetup
  ) {
    this.semaphore = new Semaphore(config.poolSize);
  }

  private captureScreenshots(
    eventLogger: EventLogger,
    layout: Layout,
    options: ScreenshotObservableOptions,
    logger: Logger
  ): Observable<CaptureResult> {
    const { browserTimezone } = options;

    return this.browserDriverFactory
      .createPage(
        {
          browserTimezone,
          openUrlTimeout: durationToNumber(this.config.capture.timeouts.openUrl),
          defaultViewport: { width: layout.width, deviceScaleFactor: layout.getBrowserZoom() },
        },
        logger
      )
      .pipe(
        this.semaphore.acquire(),
        mergeMap(({ driver, error$, close }) => {
          const screen: ScreenshotObservableHandler = new ScreenshotObservableHandler(
            driver,
            this.config,
            eventLogger,
            layout,
            options
          );

          return from(options.urls).pipe(
            concatMap((url, index) =>
              screen.setupPage(index, url).pipe(
                catchError((error) => {
                  screen.checkPageIsOpen(); // this fails the job if the browser has closed

                  logger.error(error);
                  eventLogger.error(error, Transactions.SCREENSHOTTING);
                  return of({ ...DEFAULT_SETUP_RESULT, error }); // allow "as-is" screenshot with injected warning message
                }),
                takeUntil(error$),
                screen.getScreenshots()
              )
            ),
            take(options.urls.length),
            toArray(),
            mergeMap((results) =>
              // At this point we no longer need the page, close it and send out the results
              close().pipe(map(({ metrics }) => ({ metrics, results })))
            )
          );
        }),
        first()
      );
  }

  private getScreenshottingAppUrl() {
    const info = this.http.getServerInfo();
    const { protocol, port } = info;
    let { hostname } = info;

    if (ipaddr.isValid(hostname) && !sum(ipaddr.parse(hostname).toByteArray())) {
      hostname = 'localhost';
    }

    return `${protocol}://${hostname}:${port}${this.http.basePath.serverBasePath}/app/${SCREENSHOTTING_APP_ID}`;
  }

  private getCaptureOptions({
    expression,
    input,
    request,
    ...options
  }: ScreenshotOptions): ScreenshotObservableOptions {
    const headers = { ...(request?.headers ?? {}), ...(options.headers ?? {}) };
    const urls = expression
      ? [
          [
            this.getScreenshottingAppUrl(),
            {
              [SCREENSHOTTING_EXPRESSION]: expression,
              [SCREENSHOTTING_EXPRESSION_INPUT]: input,
            },
          ] as UrlOrUrlWithContext,
        ]
      : options.urls;

    return defaultsDeep(
      {
        ...options,
        headers,
        urls,
      },
      {
        timeouts: {
          openUrl: 60000,
          waitForElements: 60000,
          renderComplete: 120000,
        },
        urls: [],
      }
    );
  }

  systemHasInsufficientMemory(): boolean {
    return systemHasInsufficientMemory(this.cloud, this.logger.get('cloud'));
  }

  getScreenshots(options: PngScreenshotOptions): Observable<PngScreenshotResult>;
  getScreenshots(options: PdfScreenshotOptions): Observable<PdfScreenshotResult>;
  getScreenshots(options: ScreenshotOptions): Observable<ScreenshotResult>;
  getScreenshots(options: ScreenshotOptions): Observable<ScreenshotResult> {
    const logger = options.logger?.get('screenshotting') ?? this.logger;
    const { taskInstanceFields, format, layout } = options;

    const { startedAt, retryAt } = taskInstanceFields;
    if (startedAt) {
      logger.debug(
        `Task started at: ${startedAt && moment(startedAt).format()}.` +
          ` Can run until: ${retryAt && moment(retryAt).format()}`
      );
    }

    if (this.systemHasInsufficientMemory()) {
      return throwError(() => new errors.InsufficientMemoryAvailableOnCloudError());
    }

    const eventLogger = new EventLogger(logger);
    const layoutInstance = createLayout(layout ?? {});
    const captureOptions = this.getCaptureOptions(options);

    return eventLogger.withTransaction(Transactions.SCREENSHOTTING, (setLabels) =>
      this.captureScreenshots(eventLogger, layoutInstance, captureOptions, logger).pipe(
        tap(({ results, metrics }) => {
          setLabels({
            cpu: metrics?.cpu,
            memory: metrics?.memory,
            memory_mb: metrics?.memoryInMegabytes,
            ...eventLogger.getByteLengthFromCaptureResults(results),
          });
        }),
        mergeMap((result) => {
          switch (format) {
            case 'pdf':
              return toPdf(eventLogger, this.packageInfo, layoutInstance, options, result);
            default:
              return toPng(result);
          }
        })
      )
    );
  }
}
