/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { XSOARConnector } from './xsoar';
import { actionsConfigMock } from '@kbn/actions-plugin/server/actions_config.mock';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { ConnectorUsageCollector } from '@kbn/actions-plugin/server/types';
import { TaskErrorSource, getErrorSource } from '@kbn/task-manager-plugin/server/task_running';
import type { XSOARRunActionParams } from '@kbn/connector-schemas/xsoar';
import {
  CONNECTOR_ID,
  XSOARPlaybooksActionResponseSchema,
  XSOARRunActionResponseSchema,
} from '@kbn/connector-schemas/xsoar';

const mockTime = new Date('2025-02-20T10:10:30.000');

describe('XSOARConnector', () => {
  const logger = loggingSystemMock.createLogger();

  const connector = new XSOARConnector({
    configurationUtilities: actionsConfigMock.create(),
    connector: { id: '1', type: CONNECTOR_ID },
    config: { url: 'https://example.com' },
    secrets: { apiKey: 'test123', apiKeyID: null },
    logger,
    services: actionsMock.createServices(),
  });

  const cloudConnector = new XSOARConnector({
    configurationUtilities: actionsConfigMock.create(),
    connector: { id: '2', type: CONNECTOR_ID },
    config: { url: 'https://test.com' },
    secrets: { apiKey: 'test123', apiKeyID: '123' },
    logger,
    services: actionsMock.createServices(),
  });

  let mockRequest: jest.Mock;
  let mockCloudRequest: jest.Mock;
  let mockError: jest.Mock;
  let connectorUsageCollector: ConnectorUsageCollector;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockTime);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockError = jest.fn().mockImplementation(() => {
      throw new Error('API Error');
    });
    jest.clearAllMocks();
    connectorUsageCollector = new ConnectorUsageCollector({
      logger,
      connectorId: 'test-connector-id',
    });
  });

  describe('getPlaybooks', () => {
    const mockResponse = {
      data: {
        playbooks: [
          {
            id: '8db0105c-f674-4d83-8095-f95a9f61e77a',
            version: 4,
            cacheVersn: 0,
            sequenceNumber: 33831652,
            primaryTerm: 11,
            modified: '2023-12-12T13:51:15.668021556Z',
            sizeInBytes: 0,
            packID: '',
            packName: '',
            itemVersion: '',
            fromServerVersion: '',
            toServerVersion: '',
            propagationLabels: ['all'],
            definitionId: '',
            vcShouldIgnore: false,
            vcShouldKeepItemLegacyProdMachine: false,
            commitMessage: '',
            shouldCommit: false,
            name: 'aaa',
            nameRaw: 'aaa',
            prevName: 'aaa',
            startTaskId: '0',
            tasks: {
              '0': {
                id: '0',
                taskId: 'e228a044-2ad5-4ab0-873a-d5bb94a5c1b4',
                type: 'start',
                task: {
                  id: 'e228a044-2ad5-4ab0-873a-d5bb94a5c1b4',
                  version: 1,
                  cacheVersn: 0,
                  sequenceNumber: 13431901,
                  primaryTerm: 8,
                  modified: '2023-05-23T07:16:19.930125981Z',
                  sizeInBytes: 0,
                },
                nextTasks: {
                  '#none#': ['1'],
                },
                continueOnErrorType: '',
                view: {
                  position: {
                    x: 450,
                    y: 50,
                  },
                },
                evidenceData: {},
              },
              '1': {
                id: '1',
                taskId: 'c28b63d3-c860-4e16-82b4-6db6b58bdee3',
                type: 'regular',
                task: {
                  id: 'c28b63d3-c860-4e16-82b4-6db6b58bdee3',
                  version: 1,
                  cacheVersn: 0,
                  sequenceNumber: 33831651,
                  primaryTerm: 11,
                  modified: '2023-12-12T13:51:15.604271789Z',
                  sizeInBytes: 0,
                  name: 'Untitled Task 1',
                  description: 'commands.local.cmd.set.incident',
                  scriptId: 'Builtin|||setIncident',
                  type: 'regular',
                  isCommand: true,
                  brand: 'Builtin',
                },
                scriptArguments: {
                  severity: {
                    simple: '1',
                  },
                },
                continueOnErrorType: '',
                view: {
                  position: {
                    x: 450,
                    y: 200,
                  },
                },
                evidenceData: {},
              },
            },
            taskIds: [
              'e228a044-2ad5-4ab0-873a-d5bb94a5c1b4',
              'c28b63d3-c860-4e16-82b4-6db6b58bdee3',
            ],
            scriptIds: [],
            commands: ['setIncident'],
            brands: ['Builtin'],
            missingScriptsIds: ['Builtin|||setIncident'],
            view: {
              linkLabelsPosition: {},
              paper: {
                dimensions: {
                  height: 245,
                  width: 380,
                  x: 450,
                  y: 50,
                },
              },
            },
            inputs: null,
            outputs: null,
            quiet: true,
          },
        ],
        tags: [
          'Endpoint',
          'ITDR',
          'Automated',
          'Phishing',
          'Sandbox',
          'Joe Security',
          'Severity',
          'Malware',
          'Sumo Logic',
          'Remediation',
          'Job',
          'Code42 Incydr',
          'Sinkhole',
          'XDR',
          'TIM',
          'PAN-OS',
          'Vulnerability',
          'Virus',
          'Domaintools',
        ],
        total: 1,
      },
    };

    beforeEach(() => {
      mockRequest = jest.fn().mockResolvedValue(mockResponse);
      mockCloudRequest = jest.fn().mockResolvedValue(mockResponse);
      // @ts-ignore
      connector.request = mockRequest;
      // @ts-ignore
      cloudConnector.request = mockCloudRequest;
      jest.clearAllMocks();
    });

    it('XSOAR API call is successful with correct parameters', async () => {
      const response = await connector.getPlaybooks(undefined, connectorUsageCollector);
      expect(mockRequest).toBeCalledTimes(1);
      expect(mockRequest).toHaveBeenCalledWith(
        {
          method: 'post',
          url: 'https://example.com/playbook/search',
          data: {},
          responseSchema: XSOARPlaybooksActionResponseSchema,
          headers: {
            Authorization: 'test123',
          },
          timeout: 15000,
        },
        connectorUsageCollector
      );
      expect(response).toEqual(mockResponse.data);
    });

    it('Auth headers are correctly set for cloud instance', async () => {
      const response = await cloudConnector.getPlaybooks(undefined, connectorUsageCollector);
      expect(mockCloudRequest).toBeCalledTimes(1);
      expect(mockCloudRequest).toHaveBeenCalledWith(
        {
          method: 'post',
          url: 'https://test.com/xsoar/public/v1/playbook/search',
          data: {},
          responseSchema: XSOARPlaybooksActionResponseSchema,
          headers: {
            Authorization: 'test123',
            'x-xdr-auth-id': '123',
          },
          timeout: 15000,
        },
        connectorUsageCollector
      );
      expect(response).toEqual(mockResponse.data);
    });

    it('errors during API calls are properly handled', async () => {
      // @ts-ignore
      connector.request = mockError;

      await expect(connector.getPlaybooks(undefined, connectorUsageCollector)).rejects.toThrow(
        'API Error'
      );
    });
  });

  describe('run', () => {
    const mockResponse = {
      data: {
        id: '178791',
        version: 0,
        cacheVersn: 0,
        modified: '1970-01-01T00:00:00Z',
        sizeInBytes: 0,
        CustomFields: {
          bmcassignee: [{}],
          bmccustomer: [{}],
          bmcrequester: [{}],
          containmentsla: {
            accumulatedPause: 0,
            breachTriggered: false,
            dueDate: '0001-01-01T00:00:00Z',
            endDate: '0001-01-01T00:00:00Z',
            lastPauseDate: '0001-01-01T00:00:00Z',
            runStatus: 'idle',
            sla: 30,
            slaStatus: -1,
            startDate: '0001-01-01T00:00:00Z',
            totalDuration: 0,
          },
          crowdstrikefalconbehaviourpatterndispositiondetails: [{}, {}, {}],
          datadogcloudsiem: [{}, {}, {}],
          dataminrpulserelatedterms: [{}, {}, {}],
          decyfirdatadetails: [{}, {}, {}],
          detectionsla: {
            accumulatedPause: 0,
            breachTriggered: false,
            dueDate: '0001-01-01T00:00:00Z',
            endDate: '0001-01-01T00:00:00Z',
            lastPauseDate: '0001-01-01T00:00:00Z',
            runStatus: 'idle',
            sla: 20,
            slaStatus: -1,
            startDate: '0001-01-01T00:00:00Z',
            totalDuration: 0,
          },
          domaintoolsirisdetect: [{}, {}, {}],
          endpoint: [{}],
          externalid: '178791',
          extrahoprevealxdetectiondevices: [{}, {}, {}],
          extrahoprevealxmitretechniques: [{}, {}, {}],
          filerelationships: [{}, {}, {}],
          fortisiemattacktactics: [{}, {}],
          fortisiemevents: [{}],
          incidentduration: {
            accumulatedPause: 0,
            breachTriggered: false,
            dueDate: '0001-01-01T00:00:00Z',
            endDate: '0001-01-01T00:00:00Z',
            lastPauseDate: '0001-01-01T00:00:00Z',
            runStatus: 'idle',
            sla: 0,
            slaStatus: -1,
            startDate: '0001-01-01T00:00:00Z',
            totalDuration: 0,
          },
          incidentrdpachehuntingstringssimilarity: [{}, {}, {}],
          incidentrdpcachehuntingstringsifter: [{}, {}, {}],
          inventasource: [{}],
          microsoftsentinelowner: [],
          qintelqwatchexposures: [{}, {}, {}],
          remediationsla: {
            accumulatedPause: 0,
            breachTriggered: false,
            dueDate: '0001-01-01T00:00:00Z',
            endDate: '0001-01-01T00:00:00Z',
            lastPauseDate: '0001-01-01T00:00:00Z',
            runStatus: 'idle',
            sla: 7200,
            slaStatus: -1,
            startDate: '0001-01-01T00:00:00Z',
            totalDuration: 0,
          },
          rsametasevents: [],
          rsarawlogslist: [],
          securitypolicymatch: [{}],
          similarincidentsdbot: [{}],
          spycloudcompassdevicedata: [{}, {}, {}],
          suspiciousexecutions: [{}, {}, {}],
          timetoassignment: {
            accumulatedPause: 0,
            breachTriggered: false,
            dueDate: '0001-01-01T00:00:00Z',
            endDate: '0001-01-01T00:00:00Z',
            lastPauseDate: '0001-01-01T00:00:00Z',
            runStatus: 'idle',
            sla: 0,
            slaStatus: -1,
            startDate: '0001-01-01T00:00:00Z',
            totalDuration: 0,
          },
          triagesla: {
            accumulatedPause: 0,
            breachTriggered: false,
            dueDate: '0001-01-01T00:00:00Z',
            endDate: '0001-01-01T00:00:00Z',
            lastPauseDate: '0001-01-01T00:00:00Z',
            runStatus: 'idle',
            sla: 30,
            slaStatus: -1,
            startDate: '0001-01-01T00:00:00Z',
            totalDuration: 0,
          },
          urlsslverification: [],
          xdralertsearchresults: [{}, {}, {}],
          xdrinvestigationresults: [
            {},
            {},
            {},
            {
              columnheader1: '',
            },
            {},
            {
              columnheader1: '',
            },
            {},
            {},
          ],
          xpanseserviceclassifications: [{}, {}, {}],
          xpanseservicevalidation: [
            {
              columnheader1: '',
            },
            {},
            {},
          ],
        },
        account: '',
        autime: 1713700028107000000,
        type: 'Unclassified',
        rawType: 'Unclassified',
        name: 'My test incident',
        rawName: 'My test incident',
        status: 0,
        custom_status: '',
        resolution_status: '',
        reason: '',
        created: '2024-04-21T11:47:08.107Z',
        occurred: '2024-04-21T11:47:08.107982676Z',
        closed: '0001-01-01T00:00:00Z',
        sla: 0,
        severity: 2,
        investigationId: '',
        labels: [
          {
            value: '',
            type: 'Instance',
          },
          {
            value: 'Manual',
            type: 'Brand',
          },
        ],
        attachment: null,
        details: 'My test incident',
        openDuration: 0,
        lastOpen: '0001-01-01T00:00:00Z',
        closingUserId: '',
        owner: '',
        activated: '0001-01-01T00:00:00Z',
        closeReason: '',
        rawCloseReason: '',
        closeNotes: '',
        playbookId: 'playbook0',
        dueDate: '2024-05-01T11:47:08.107988742Z',
        reminder: '0001-01-01T00:00:00Z',
        runStatus: '',
        notifyTime: '0001-01-01T00:00:00Z',
        phase: '',
        rawPhase: '',
        isPlayground: false,
        rawJSON: '',
        parent: '',
        parentXDRIncident: '',
        retained: false,
        category: '',
        rawCategory: '',
        linkedIncidents: null,
        linkedCount: 0,
        droppedCount: 0,
        sourceInstance: '',
        sourceBrand: 'Manual',
        canvases: null,
        lastJobRunTime: '0001-01-01T00:00:00Z',
        feedBased: false,
        dbotMirrorId: '',
        dbotMirrorInstance: '',
        dbotMirrorDirection: '',
        dbotDirtyFields: null,
        dbotCurrentDirtyFields: null,
        dbotMirrorTags: null,
        dbotMirrorLastSync: '0001-01-01T00:00:00Z',
        isDebug: false,
      },
    };

    beforeEach(() => {
      mockRequest = jest.fn().mockResolvedValue(mockResponse);
      mockCloudRequest = jest.fn().mockResolvedValue(mockResponse);
      // @ts-ignore
      connector.request = mockRequest;
      // @ts-ignore
      cloudConnector.request = mockCloudRequest;
      jest.clearAllMocks();
    });

    const incident: XSOARRunActionParams = {
      name: 'My test incident',
      playbookId: 'playbook0',
      createInvestigation: false,
      severity: 2,
      isRuleSeverity: false,
      body: JSON.stringify({}),
    };

    const malformedIncident: XSOARRunActionParams = {
      name: 'My test incident 2',
      playbookId: 'playbook0',
      createInvestigation: false,
      isRuleSeverity: false,
      severity: 2,
      body: '{',
    };

    const { body, isRuleSeverity, ...incidentWithoutBody } = incident;
    const expectedIncident = { ...JSON.parse(body || '{}'), ...incidentWithoutBody };

    it('XSOAR API call is successful with correct parameters', async () => {
      await connector.run(incident, connectorUsageCollector);
      expect(mockRequest).toBeCalledTimes(1);
      expect(mockRequest).toHaveBeenCalledWith(
        {
          url: 'https://example.com/incident',
          method: 'post',
          responseSchema: XSOARRunActionResponseSchema,
          data: expectedIncident,
          headers: {
            Authorization: 'test123',
          },
        },
        connectorUsageCollector
      );
    });

    it('errors during API calls are properly handled', async () => {
      // @ts-ignore
      connector.request = mockError;

      await expect(connector.run(expectedIncident, connectorUsageCollector)).rejects.toThrow(
        'API Error'
      );
    });

    it('error when malformed incident is passed', async () => {
      await expect(connector.run(malformedIncident, connectorUsageCollector)).rejects.toThrowError(
        `Error parsing Body: SyntaxError: Expected property name or '}' in JSON at position 1`
      );
    });

    it('marks malformed incident body errors as user errors', async () => {
      expect.assertions(2);

      try {
        await connector.run(malformedIncident, connectorUsageCollector);
      } catch (error) {
        expect(error.message).toContain(
          `Error parsing Body: SyntaxError: Expected property name or '}' in JSON at position 1`
        );
        expect(getErrorSource(error)).toBe(TaskErrorSource.USER);
      }
    });
  });
});
