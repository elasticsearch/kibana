/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('uuid', () => ({ v4: () => 'mock-report-id' }));

import rison from '@kbn/rison';

import type { KibanaRequest, KibanaResponseFactory } from '@kbn/core/server';
import { coreMock, httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { JobParamsPDFV2, TaskPayloadPDFV2 } from '@kbn/reporting-export-types-pdf-common';
import { createMockConfigSchema } from '@kbn/reporting-mocks-server';

import type { ReportingCore } from '../../..';
import type { ReportingStore } from '../../../lib/store';
import { Report } from '../../../lib/store';
import { createMockReportingCore } from '../../../test_helpers';
import type {
  ReportingJobResponse,
  ReportingRequestHandlerContext,
  ReportingSetup,
  ReportingUser,
} from '../../../types';
import { GenerateRequestHandler } from './generate_request_handler';

jest.mock('@kbn/reporting-server/crypto', () => ({
  cryptoFactory: () => ({
    encrypt: () => `hello mock cypher text`,
  }),
}));

const getMockContext = () =>
  ({
    core: coreMock.createRequestHandlerContext(),
  } as unknown as ReportingRequestHandlerContext);

const getMockRequest = () =>
  ({
    url: { port: '5601', search: '', pathname: '/foo' },
    route: { path: '/foo', options: {} },
  } as KibanaRequest<
    { exportType: string },
    { jobParams: string } | null,
    { jobParams: string } | null
  >);

const getMockResponseFactory = () =>
  ({
    ...httpServerMock.createResponseFactory(),
    forbidden: (obj: unknown) => obj,
    unauthorized: (obj: unknown) => obj,
    customError: (err: unknown) => err,
  } as unknown as KibanaResponseFactory);

const mockLogger = loggingSystemMock.createLogger();
const mockJobParams: JobParamsPDFV2 = {
  browserTimezone: 'UTC',
  objectType: 'cool_object_type',
  title: 'cool_title',
  version: 'unknown',
  layout: { id: 'preserve_layout' },
  locatorParams: [],
};

describe('Handle request to generate', () => {
  let reportingCore: ReportingCore;
  let mockContext: ReturnType<typeof getMockContext>;
  let mockRequest: ReturnType<typeof getMockRequest>;
  let mockResponseFactory: ReturnType<typeof getMockResponseFactory>;
  let requestHandler: GenerateRequestHandler;

  beforeEach(async () => {
    reportingCore = await createMockReportingCore(createMockConfigSchema({}));
    reportingCore.getStore = () =>
      Promise.resolve({
        addReport: jest
          .fn()
          .mockImplementation(
            (report) => new Report({ ...report, _index: '.reporting-foo-index-234' })
          ),
      } as unknown as ReportingStore);

    mockRequest = getMockRequest();

    mockResponseFactory = getMockResponseFactory();
    (mockResponseFactory.ok as jest.Mock) = jest.fn((args: unknown) => args);
    (mockResponseFactory.forbidden as jest.Mock) = jest.fn((args: unknown) => args);
    (mockResponseFactory.badRequest as jest.Mock) = jest.fn((args: unknown) => args);

    mockContext = getMockContext();
    mockContext.reporting = Promise.resolve({} as ReportingSetup);

    requestHandler = new GenerateRequestHandler({
      reporting: reportingCore,
      user: { username: 'testymcgee' } as ReportingUser,
      context: mockContext,
      path: '/api/reporting/test/generate/pdf',
      req: mockRequest,
      res: mockResponseFactory,
      logger: mockLogger,
    });
  });

  describe('Enqueue Job', () => {
    test('creates a report object to queue', async () => {
      const report = await requestHandler.enqueueJob({
        exportTypeId: 'printablePdfV2',
        jobParams: mockJobParams,
      });

      const { _id, created_at, payload, ...snapObj } = report;
      expect(snapObj).toMatchInlineSnapshot(`
        Object {
          "_index": ".reporting-foo-index-234",
          "_primary_term": undefined,
          "_seq_no": undefined,
          "attempts": 0,
          "completed_at": undefined,
          "created_by": "testymcgee",
          "error": undefined,
          "execution_time_ms": undefined,
          "jobtype": "printable_pdf_v2",
          "kibana_id": undefined,
          "kibana_name": undefined,
          "max_attempts": undefined,
          "meta": Object {
            "isDeprecated": false,
            "layout": "preserve_layout",
            "objectType": "cool_object_type",
          },
          "metrics": undefined,
          "migration_version": "7.14.0",
          "output": null,
          "process_expiration": undefined,
          "queue_time_ms": undefined,
          "scheduled_report_id": undefined,
          "space_id": "default",
          "started_at": undefined,
          "status": "pending",
          "timeout": undefined,
        }
      `);
      const { forceNow, ...snapPayload } = payload as TaskPayloadPDFV2;
      expect(snapPayload).toMatchInlineSnapshot(`
        Object {
          "browserTimezone": "UTC",
          "headers": "hello mock cypher text",
          "isDeprecated": false,
          "layout": Object {
            "id": "preserve_layout",
          },
          "locatorParams": Array [],
          "objectType": "cool_object_type",
          "spaceId": undefined,
          "title": "cool_title",
          "version": "unknown",
        }
      `);
    });

    test('provides a default kibana version field for older POST URLs', async () => {
      // how do we handle the printable_pdf endpoint that isn't migrating to the class instance of export types?
      (mockJobParams as unknown as { version?: string }).version = undefined;
      const report = await requestHandler.enqueueJob({
        exportTypeId: 'printablePdfV2',
        jobParams: mockJobParams,
      });

      const { _id, created_at, ...snapObj } = report;
      expect(snapObj.payload.version).toBe(reportingCore.getKibanaPackageInfo().version);
    });
  });

  describe('getJobParams', () => {
    test('parse jobParams from query string', () => {
      // @ts-ignore query is a read-only property
      mockRequest.query = { jobParams: rison.encode(mockJobParams) };
      expect(requestHandler.getJobParams()).toEqual(mockJobParams);
    });

    test('parse jobParams from body', () => {
      // @ts-ignore body is a read-only property
      mockRequest.body = { jobParams: rison.encode(mockJobParams) };
      expect(requestHandler.getJobParams()).toEqual(mockJobParams);
    });

    test('handles missing job params', () => {
      try {
        requestHandler.getJobParams();
      } catch (err) {
        expect(err.statusCode).toBe(400);
      }
    });

    test('handles null job params', () => {
      try {
        // @ts-ignore body is a read-only property
        mockRequest.body = { jobParams: rison.encode(null) };
        requestHandler.getJobParams();
      } catch (err) {
        expect(err.statusCode).toBe(400);
      }
    });

    test('handles invalid rison', () => {
      // @ts-ignore body is a read-only property
      mockRequest.body = { jobParams: mockJobParams };
      try {
        requestHandler.getJobParams();
      } catch (err) {
        expect(err.statusCode).toBe(400);
      }
    });
  });

  describe('handleRequest', () => {
    test('disallows invalid export type', async () => {
      expect(
        await requestHandler.handleRequest({
          exportTypeId: 'neanderthals',
          jobParams: mockJobParams,
        })
      ).toMatchInlineSnapshot(`
              Object {
                "body": "Invalid export-type of neanderthals",
              }
          `);
    });

    test('disallows unsupporting license', async () => {
      (reportingCore.getLicenseInfo as jest.Mock) = jest.fn(() => ({
        csv_searchsource: {
          enableLinks: false,
          message: `seeing this means the license isn't supported`,
        },
      }));

      expect(
        await requestHandler.handleRequest({
          exportTypeId: 'csv_searchsource',
          jobParams: mockJobParams,
        })
      ).toMatchInlineSnapshot(`
              Object {
                "body": "seeing this means the license isn't supported",
              }
          `);
    });

    test('disallows invalid browser timezone', async () => {
      const handler = new GenerateRequestHandler({
        reporting: reportingCore,
        user: { username: 'testymcgee' } as ReportingUser,
        context: mockContext,
        path: '/api/reporting/test/generate/pdf',
        req: {
          ...mockRequest,
          body: {
            jobParams: rison.encode({ ...mockJobParams, browserTimezone: 'America/Amsterdam' }),
          },
        },
        res: mockResponseFactory,
        logger: mockLogger,
      });
      try {
        await handler.getJobParams();
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.body).toMatchInlineSnapshot(`
          "invalid params: [
            {
              \\"code\\": \\"custom\\",
              \\"path\\": [
                \\"browserTimezone\\"
              ],
              \\"message\\": \\"Invalid timezone\\"
            }
          ]"
        `);
      }
    });

    test('generates the download path', async () => {
      const { body } = (await requestHandler.handleRequest({
        exportTypeId: 'csv_searchsource',
        jobParams: mockJobParams,
      })) as unknown as { body: ReportingJobResponse };

      expect(body.path).toMatch('/mock-server-basepath/api/reporting/jobs/download/mock-report-id');
    });
  });
});
