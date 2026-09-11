/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { tracing } from '@elastic/opentelemetry-node/sdk';
import moment from 'moment';
import type { ScreenshottingAction } from '.';
import { Actions, EventLogger, Transactions } from '.';
import type { ElementPosition } from '../get_element_position_data';

jest.mock('uuid', () => ({
  v4: () => 'NEW_UUID',
}));

let otelExporter: tracing.InMemorySpanExporter;
let otelProvider: tracing.BasicTracerProvider;

beforeAll(() => {
  otelExporter = new tracing.InMemorySpanExporter();
  otelProvider = new tracing.BasicTracerProvider({
    spanProcessors: [new tracing.SimpleSpanProcessor(otelExporter)],
  });
  trace.setGlobalTracerProvider(otelProvider);
});

afterAll(async () => {
  await otelProvider.shutdown();
});

type EventLoggerArgs = [message: string, meta: ScreenshottingAction];
describe('Event Logger', () => {
  let eventLogger: EventLogger;
  let logSpy: jest.SpyInstance<void, EventLoggerArgs>;

  beforeEach(() => {
    otelExporter?.reset();
    const testDate = moment(new Date('2021-04-12T16:00:00.000Z'));
    let delaySeconds = 1;

    jest.spyOn(global.Date, 'now').mockImplementation(() => {
      return testDate.add(delaySeconds++, 'seconds').valueOf();
    });

    const logger = loggingSystemMock.createLogger();
    eventLogger = new EventLogger(logger);

    logSpy = jest.spyOn(logger, 'debug') as jest.SpyInstance<void, EventLoggerArgs>;
  });

  it('creates logs for the events and includes durations and event payload data', () => {
    eventLogger.withTransaction(Transactions.SCREENSHOTTING, (setScreenshottingLabels) => {
      const openUrlEnd = eventLogger.logScreenshottingEvent(
        'open the url to the Kibana application',
        Actions.OPEN_URL,
        'wait'
      );
      openUrlEnd();
      const getElementPositionsEnd = eventLogger.logScreenshottingEvent(
        'scan the page to find the boundaries of visualization elements',
        Actions.GET_ELEMENT_POSITION_DATA,
        'wait'
      );
      getElementPositionsEnd();
      setScreenshottingLabels({
        cpu: 12,
        cpu_percentage: 0,
        memory: 450789,
        memory_mb: 449,
        byte_length: 14000,
      });
    });

    eventLogger.withTransaction(Transactions.PDF, (setPdfLabels) => {
      const addImageEnd = eventLogger.logPdfEvent(
        'add image to the PDF file',
        Actions.ADD_IMAGE,
        'output'
      );
      addImageEnd();
      setPdfLabels({ pdf_pages: 1, byte_length_pdf: 6666 });
    });

    const logs = logSpy.mock.calls.map(([message, data]) => ({
      message,
      duration: data?.event?.duration,
      screenshotting: data?.kibana?.screenshotting,
    }));

    const spans = otelExporter.getFinishedSpans();

    const screenshottingSpan = spans.find((s) => s.name === Transactions.SCREENSHOTTING);
    expect(screenshottingSpan).toBeDefined();
    expect(screenshottingSpan!.attributes['transaction.type']).toBe('screenshotting');
    expect(screenshottingSpan!.attributes.cpu).toBe(12);
    expect(screenshottingSpan!.attributes.memory).toBe(450789);
    expect(screenshottingSpan!.status.code).not.toBe(SpanStatusCode.ERROR);

    const pdfSpan = spans.find((s) => s.name === Transactions.PDF);
    expect(pdfSpan).toBeDefined();
    expect(pdfSpan!.attributes['transaction.type']).toBe('screenshotting');
    expect(pdfSpan!.attributes.pdf_pages).toBe(1);
    expect(pdfSpan!.attributes.byte_length_pdf).toBe(6666);

    const openUrlSpan = spans.find((s) => s.name === Actions.OPEN_URL);
    expect(openUrlSpan).toBeDefined();
    expect(openUrlSpan!.attributes['span.type']).toBe('wait');

    const getPositionsSpan = spans.find((s) => s.name === Actions.GET_ELEMENT_POSITION_DATA);
    expect(getPositionsSpan).toBeDefined();

    const addImageSpan = spans.find((s) => s.name === Actions.ADD_IMAGE);
    expect(addImageSpan).toBeDefined();
    expect(addImageSpan!.attributes['span.type']).toBe('output');

    expect(logs.length).toBe(10);
    expect(logs).toMatchInlineSnapshot(`
      Array [
        Object {
          "duration": undefined,
          "message": "starting: screenshot-pipeline",
          "screenshotting": Object {
            "action": "screenshot-pipeline-start",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": undefined,
          "message": "starting: open the url to the Kibana application",
          "screenshotting": Object {
            "action": "open-url-start",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": 5000,
          "message": "completed: open the url to the Kibana application",
          "screenshotting": Object {
            "action": "open-url-complete",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": undefined,
          "message": "starting: scan the page to find the boundaries of visualization elements",
          "screenshotting": Object {
            "action": "get-element-position-data-start",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": 8000,
          "message": "completed: scan the page to find the boundaries of visualization elements",
          "screenshotting": Object {
            "action": "get-element-position-data-complete",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": 44000,
          "message": "completed: screenshot-pipeline",
          "screenshotting": Object {
            "action": "screenshot-pipeline-complete",
            "byte_length": 14000,
            "cpu": 12,
            "cpu_percentage": 0,
            "memory": 450789,
            "memory_mb": 449,
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": undefined,
          "message": "starting: generate-pdf",
          "screenshotting": Object {
            "action": "generate-pdf-start",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": undefined,
          "message": "starting: add image to the PDF file",
          "screenshotting": Object {
            "action": "add-pdf-image-start",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": 14000,
          "message": "completed: add image to the PDF file",
          "screenshotting": Object {
            "action": "add-pdf-image-complete",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": 65000,
          "message": "completed: generate-pdf",
          "screenshotting": Object {
            "action": "generate-pdf-complete",
            "byte_length_pdf": 6666,
            "pdf_pages": 1,
            "session_id": "NEW_UUID",
          },
        },
      ]
    `);
  });

  it('logs the number of pixels', () => {
    const elementPosition = {
      boundingClientRect: { width: 1350, height: 2000 },
      scroll: {},
    } as ElementPosition;
    const endScreenshot = eventLogger.logScreenshottingEvent(
      'screenshot capture test',
      Actions.GET_SCREENSHOT,
      'read',
      eventLogger.getPixelsFromElementPosition(elementPosition, 2)
    );
    endScreenshot({ byte_length: 4444 });

    const spans = otelExporter.getFinishedSpans();
    const screenshotSpan = spans.find((s) => s.name === Actions.GET_SCREENSHOT);
    expect(screenshotSpan).toBeDefined();
    expect(screenshotSpan!.attributes['span.type']).toBe('read');

    const logData = logSpy.mock.calls.map(([message, data]) => ({
      message,
      duration: data.event?.duration,
      screenshotting: data.kibana.screenshotting,
    }));

    expect(logData).toMatchInlineSnapshot(`
      Array [
        Object {
          "duration": undefined,
          "message": "starting: screenshot capture test",
          "screenshotting": Object {
            "action": "get-screenshots-start",
            "pixels": 10800000,
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "duration": 3000,
          "message": "completed: screenshot capture test",
          "screenshotting": Object {
            "action": "get-screenshots-complete",
            "byte_length": 4444,
            "pixels": 10800000,
            "session_id": "NEW_UUID",
          },
        },
      ]
    `);
  });

  it('creates helpful error logs', () => {
    eventLogger.withTransaction(Transactions.SCREENSHOTTING, () => {
      eventLogger.logScreenshottingEvent('opening the url', Actions.OPEN_URL, 'wait');
      eventLogger.error(new Error('Something erroneous happened'), Transactions.SCREENSHOTTING);
    });

    const logData = logSpy.mock.calls.map(([message, data]) => ({
      message,
      error: data.error,
      screenshotting: data.kibana.screenshotting,
    }));

    expect(logData).toMatchInlineSnapshot(`
      Array [
        Object {
          "error": undefined,
          "message": "starting: screenshot-pipeline",
          "screenshotting": Object {
            "action": "screenshot-pipeline-start",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "error": undefined,
          "message": "starting: opening the url",
          "screenshotting": Object {
            "action": "open-url-start",
            "session_id": "NEW_UUID",
          },
        },
        Object {
          "error": Object {
            "code": undefined,
            "message": "Something erroneous happened",
            "stack_trace": undefined,
            "type": undefined,
          },
          "message": "Error: Something erroneous happened",
          "screenshotting": Object {
            "action": "screenshot-pipeline-error",
            "session_id": "NEW_UUID",
          },
        },
      ]
    `);
  });
});
