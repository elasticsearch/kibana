/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, LogMeta } from '@kbn/core/server';
import apm from 'elastic-apm-node';
import { withActiveSpan } from '@kbn/tracing-utils';
import { type Span as OtelSpan, trace } from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';
import type { CaptureResult } from '..';
import { PLUGIN_ID } from '../../../common';
import type { ElementPosition } from '../get_element_position_data';
import type { Screenshot } from '../types';

export enum Actions {
  OPEN_URL = 'open-url',
  GET_ELEMENT_POSITION_DATA = 'get-element-position-data',
  GET_NUMBER_OF_ITEMS = 'get-number-of-items',
  GET_RENDER_ERRORS = 'get-render-errors',
  GET_TIMERANGE = 'get-timerange',
  INJECT_CSS = 'inject-css',
  REPOSITION = 'position-elements',
  WAIT_RENDER = 'wait-for-render',
  WAIT_VISUALIZATIONS = 'wait-for-visualizations',
  GET_SCREENSHOT = 'get-screenshots',
  PRINT_A4_PDF = 'print-a4-pdf',
  ADD_IMAGE = 'add-pdf-image',
  COMPILE = 'compile-pdf',
}

export enum Transactions {
  SCREENSHOTTING = 'screenshot-pipeline',
  PDF = 'generate-pdf',
}

export type SpanTypes = 'setup' | 'read' | 'wait' | 'correction' | 'output';

export interface ScreenshottingAction extends LogMeta {
  event?: {
    duration?: number; // number of nanoseconds from begin to end of an event
    provider: typeof PLUGIN_ID;
  };

  message: string;
  kibana: {
    screenshotting: {
      action: Actions | Transactions;
      session_id: string;

      // chromium stats
      cpu?: number;
      cpu_percentage?: number;
      memory?: number;
      memory_mb?: number;

      // screenshotting stats
      items_count?: number;
      pixels?: number;
      byte_length?: number;
      element_positions?: number;
      render_errors?: number;

      // pdf stats
      byte_length_pdf?: number;
      pdf_pages?: number;
    };
  };
}

interface ErrorAction {
  message: string;
  code?: string;
  stack_trace?: string;
  type?: string;
}

type SimpleEvent = Omit<ScreenshottingAction['kibana']['screenshotting'], 'session_id'>;

type LogAdapter = (
  message: string,
  suffix: 'start' | 'complete' | 'error',
  event: Partial<SimpleEvent>,
  startTime?: Date | undefined
) => void;

type Labels = Record<keyof SimpleEvent, number | undefined>;
type LogEndFn = (metricData?: Partial<SimpleEvent>) => void;

function fillLogData(
  message: string,
  event: Partial<SimpleEvent>,
  suffix: 'start' | 'complete' | 'error',
  sessionId: string,
  duration: number | undefined
) {
  let newMessage = message;
  if (suffix !== 'error') {
    newMessage = `${suffix === 'start' ? 'starting' : 'completed'}: ${message}`;
  }

  let interpretedAction: string;
  if (suffix === 'error') {
    interpretedAction = event.action + '-error';
  } else {
    interpretedAction = event.action + `-${suffix}`;
  }

  const logData: ScreenshottingAction = {
    message: newMessage,
    kibana: {
      screenshotting: {
        ...event,
        action: interpretedAction as Actions,
        session_id: sessionId,
      },
    },
    event: { duration, provider: PLUGIN_ID },
  };
  return logData;
}

function logAdapter(logger: Logger, sessionId: string) {
  const log: LogAdapter = (message, suffix, event, startTime) => {
    let duration: number | undefined;
    if (startTime != null) {
      const start = startTime.valueOf();
      duration = new Date(Date.now()).valueOf() - start.valueOf();
    }

    const logData = fillLogData(message, event, suffix, sessionId, duration);
    logger.debug(logData.message, logData);
  };
  return log;
}

/**
 * A class to use internal state properties to log timing between actions in the screenshotting pipeline
 */
export class EventLogger {
  private spans = new Map<Actions, apm.Span | null | undefined>();
  private transactions: Record<Transactions, null | apm.Transaction> = {
    'screenshot-pipeline': null,
    'generate-pdf': null,
  };

  private sessionId: string; // identifier to track all logs from one screenshotting flow
  private logEvent: LogAdapter;
  private timings: Partial<Record<Actions | Transactions, Date>> = {};

  constructor(private readonly logger: Logger) {
    this.sessionId = uuidv4();
    this.logEvent = logAdapter(logger.get('events'), this.sessionId);
  }

  private startTiming(a: Actions | Transactions) {
    this.timings[a] = new Date(Date.now());
  }

  /**
   * @returns Logger - original logger
   */
  public get kbnLogger() {
    return this.logger;
  }

  /**
   * Wraps work in both an APM transaction and an OTel span with active context.
   * The callback receives a setLabels function to set attributes on both APM and OTel before the transaction ends.
   * withActiveSpan keeps the OTel context active so sub-spans (from log() or auto-instrumentation) are parented correctly.
   */
  public withTransaction<T>(
    action: Transactions.SCREENSHOTTING | Transactions.PDF,
    fn: (setLabels: (labels: Partial<Labels>) => void) => T
  ): T {
    const transaction = apm.startTransaction(action, PLUGIN_ID);
    this.transactions[action] = transaction;

    this.startTiming(action);
    this.logEvent(action, 'start', { action });

    return withActiveSpan(action, { attributes: { 'transaction.type': PLUGIN_ID } }, (otelSpan) => {
      const setLabels = (labels: Partial<Labels>) => {
        Object.entries(labels).forEach(([label]) => {
          const labelField = label as keyof SimpleEvent;
          const labelValue = labels[labelField];
          transaction.setLabel(label, labelValue, false);
          if (labelValue !== undefined && otelSpan) {
            otelSpan.setAttribute(label, labelValue);
          }
        });
        transaction.end();
        this.logEvent(action, 'complete', { ...labels, action }, this.timings[action]);
      };

      return fn(setLabels);
    }) as T;
  }

  /**
   * General event logging function
   *
   * @param {string} message
   * @param {Actions} action - action type for kibana.screenshotting.action
   * @param {TransactionType} transaction - name of the internal APM transaction in which to associate the span
   * @param {SpanTypes} type - identifier of the span type
   * @param {metricsPre} type - optional metrics to add to the "start" log of the event
   * @returns {LogEndFn} - function to log the end of the span
   */
  public log(
    message: string,
    action: Actions,
    type: SpanTypes,
    metricsPre: Partial<SimpleEvent> = {},
    transaction: Transactions
  ): LogEndFn {
    const txn = this.transactions[transaction];
    const span = txn?.startSpan(action, type);

    const tracer = trace.getTracer(PLUGIN_ID);
    const otelSpan: OtelSpan | undefined = tracer?.startSpan(action, {
      attributes: { 'span.type': type },
    });

    this.spans.set(action, span);
    this.startTiming(action);
    this.logEvent(message, 'start', { ...metricsPre, action });

    return (metricData = {}) => {
      span?.end();
      otelSpan?.end();
      this.logEvent(
        message,
        'complete',
        { ...metricsPre, ...metricData, action },
        this.timings[action]
      );
    };
  }

  /**
   * Logging helper for screenshotting events
   */
  public logScreenshottingEvent(
    message: string,
    action: Actions,
    type: SpanTypes,
    metricsPre: Partial<SimpleEvent> = {}
  ) {
    return this.log(message, action, type, metricsPre, Transactions.SCREENSHOTTING);
  }

  /**
   * Logging helper for screenshotting events
   */
  public logPdfEvent(
    message: string,
    action: Actions,
    type: SpanTypes,
    metricsPre: Partial<SimpleEvent> = {}
  ) {
    return this.log(message, action, type, metricsPre, Transactions.PDF);
  }

  /**
   * Helper function to calculate the byte length of a set of captured PNG images
   */
  public getByteLengthFromCaptureResults(
    results: CaptureResult['results']
  ): Pick<SimpleEvent, 'byte_length'> {
    const totalByteLength = results.reduce(
      (totals, { screenshots }) =>
        totals +
        screenshots.reduce(
          (byteLength: number, screenshot: Screenshot) => byteLength + screenshot.data.byteLength,
          0
        ),
      0
    );
    return { byte_length: totalByteLength };
  }

  /**
   * Helper function to create the "metricPre" data needed to log the start
   * of a screenshot capture event.
   *
   * `zoom` must be the layout's effective zoom rather than the configured one: the
   * layouts step it down for large reports, so reading it from config overstates
   * the captured pixels by 4x on exactly those reports.
   */
  public getPixelsFromElementPosition(
    elementPosition: ElementPosition,
    zoom: number
  ): Pick<SimpleEvent, 'pixels'> {
    const { width, height } = elementPosition.boundingClientRect;
    const pixels = width * zoom * (height * zoom);
    return { pixels };
  }

  /**
   * General error logger
   *
   * @param {ErrorAction} error: The error object that was caught
   * @param {Actions} action: The screenshotting action type
   * @returns void
   */
  public error(error: ErrorAction | string, action: Actions | Transactions) {
    const isError = typeof error === 'object';
    const message = `Error: ${isError ? error.message : error}`;

    const errorData = {
      ...fillLogData(
        message,
        { action },
        'error',
        this.sessionId,
        undefined //
      ),
      error: {
        message: isError ? error.message : error,
        code: isError ? error.code : undefined,
        stack_trace: isError ? error.stack_trace : undefined,
        type: isError ? error.type : undefined,
      },
    };

    this.logger.get('events').debug(message, errorData);
    apm.captureError(error as Error | string);
  }
}
