/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Subject } from 'rxjs';

import type { estypes } from '@elastic/elasticsearch';
import type { ILicense } from '@kbn/licensing-types';
import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import type { License } from '@kbn/licensing-plugin/common/license';
import type { AwaitedProperties } from '@kbn/utility-types';
import type { KibanaRequest, KibanaResponseFactory, RequestHandler } from '@kbn/core/server';
import type { ElasticsearchClientMock } from '@kbn/core/server/mocks';
import {
  elasticsearchServiceMock,
  httpServerMock,
  httpServiceMock,
  savedObjectsClientMock,
} from '@kbn/core/server/mocks';
import type { CasesClientMock } from '@kbn/cases-plugin/server/client/mocks';

import { LicenseService } from '../../../../common/license';
import {
  ENDPOINT_ACTIONS_INDEX,
  EXECUTE_ROUTE,
  GET_FILE_ROUTE,
  GET_PROCESSES_ROUTE,
  ISOLATE_HOST_ROUTE_V2,
  KILL_PROCESS_ROUTE,
  SCAN_ROUTE,
  SUSPEND_PROCESS_ROUTE,
  UNISOLATE_HOST_ROUTE_V2,
  UPLOAD_ROUTE,
  CANCEL_ROUTE,
  MEMORY_DUMP_ROUTE,
} from '../../../../common/endpoint/constants';
import type {
  ActionDetails,
  HostMetadata,
  LogsEndpointAction,
  ResponseActionApiResponse,
} from '../../../../common/endpoint/types';
import { EndpointDocGenerator } from '../../../../common/endpoint/generate_data';
import type { EndpointAuthz } from '../../../../common/endpoint/types/authz';
import type { SecuritySolutionRequestHandlerContextMock } from '../../../lib/detection_engine/routes/__mocks__/request_context';
import { EndpointAppContextService } from '../../endpoint_app_context_services';
import type { HttpApiTestSetupMock } from '../../mocks';
import {
  createHttpApiTestSetupMock,
  createMockEndpointAppContext,
  createMockEndpointAppContextServiceSetupContract,
  createMockEndpointAppContextServiceStartContract,
  createRouteHandlerContext,
  getRegisteredVersionedRouteMock,
} from '../../mocks';
import { legacyMetadataSearchResponseMock } from '../metadata/support/test_support';
import { registerResponseActionRoutes } from './response_actions';
import * as ActionDetailsService from '../../services/actions/action_details_by_id';
import { CaseStatuses } from '@kbn/cases-components';
import { getEndpointAuthzInitialStateMock } from '../../../../common/endpoint/service/authz/mocks';
import { getResponseActionsClient as _getResponseActionsClient } from '../../services';
import type { ResponseActionsClient } from '../../services';
import type {
  ResponseActionsRequestBody,
  UploadActionApiRequestBody,
  CancelActionRequestBody,
} from '../../../../common/api/endpoint';
import * as fetchActionUtils from '../../services/actions/utils/fetch_action_request_by_id';
import type { FleetToHostFileClientInterface } from '@kbn/fleet-plugin/server';
import type { HapiReadableStream, SecuritySolutionRequestHandlerContext } from '../../../types';
import { createHapiReadableStreamMock } from '../../services/actions/mocks';
import { EndpointActionGenerator } from '../../../../common/endpoint/data_generators/endpoint_action_generator';
import { CustomHttpRequestError } from '../../../utils/custom_http_request_error';
import { omit } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import type { ResponseActionAgentType } from '../../../../common/endpoint/service/response_actions/constants';
import { RESPONSE_ACTION_AGENT_TYPE } from '../../../../common/endpoint/service/response_actions/constants';
import { responseActionsClientMock } from '../../services/actions/clients/mocks';
import type { ActionsApiRequestHandlerContext } from '@kbn/actions-plugin/server';
import { sentinelOneMock } from '../../services/actions/clients/sentinelone/mocks';
import { ResponseActionsClientError } from '../../services/actions/clients/errors';
import type { EndpointAppContext } from '../../types';
import { actionsClientMock } from '@kbn/actions-plugin/server/actions_client/actions_client.mock';
import { isActionSupportedByAgentType } from '../../../../common/endpoint/service/response_actions/is_response_action_supported';

jest.mock('../../services', () => {
  const realModule = jest.requireActual('../../services');

  return {
    ...realModule,
    getResponseActionsClient: jest.fn((...args) => {
      return realModule.getResponseActionsClient(...args);
    }),
  };
});

const getResponseActionsClientMock = _getResponseActionsClient;

interface CallRouteInterface {
  body?: ResponseActionsRequestBody;
  indexErrorResponse?: any;
  searchResponse?: HostMetadata;
  mockUser?: any;
  license?: License;
  authz?: Partial<EndpointAuthz>;
  /** Api version if any */
  version?: string;
}

const Platinum = licenseMock.createLicense({ license: { type: 'platinum', mode: 'platinum' } });
const Gold = licenseMock.createLicense({ license: { type: 'gold', mode: 'gold' } });

describe('Response actions', () => {
  let getActionDetailsByIdSpy: jest.SpyInstance;

  beforeEach(() => {
    getActionDetailsByIdSpy = jest
      .spyOn(ActionDetailsService, 'getActionDetailsById')
      .mockResolvedValue(new EndpointActionGenerator('seed').generateActionDetails());
  });

  describe('handler', () => {
    let endpointAppContextService: EndpointAppContextService;
    let mockResponse: jest.Mocked<KibanaResponseFactory>;
    let licenseService: LicenseService;
    let licenseEmitter: Subject<ILicense>;
    let endpointContext: EndpointAppContext;

    let callRoute: (
      routePrefix: string,
      opts: CallRouteInterface,
      indexExists?: { endpointDsExists: boolean }
    ) => Promise<AwaitedProperties<SecuritySolutionRequestHandlerContextMock>>;
    const superUser = {
      username: 'superuser',
      roles: ['superuser'],
    };

    const docGen = new EndpointDocGenerator();

    beforeEach(() => {
      const startContract = createMockEndpointAppContextServiceStartContract();
      const routerMock = httpServiceMock.createRouter();
      const mockScopedClient = elasticsearchServiceMock.createScopedClusterClient();
      const mockClusterClient = elasticsearchServiceMock.createClusterClient();

      mockClusterClient.asScoped.mockReturnValue(mockScopedClient);
      mockScopedClient.asInternalUser = startContract.esClient as ElasticsearchClientMock;
      mockResponse = httpServerMock.createResponseFactory();
      (
        startContract.fleetStartServices.messageSigningService?.sign as jest.Mock
      ).mockImplementation(() => {
        return {
          data: 'thisisthedata',
          signature: 'thisisasignature',
        };
      });
      endpointAppContextService = new EndpointAppContextService();
      const mockSavedObjectClient = savedObjectsClientMock.create();

      licenseEmitter = new Subject();
      licenseService = new LicenseService();
      licenseService.start(licenseEmitter);

      endpointContext = {
        ...createMockEndpointAppContext(),
        service: endpointAppContextService,
      };

      endpointAppContextService.setup(createMockEndpointAppContextServiceSetupContract());
      endpointAppContextService.start({
        ...startContract,
        esClient: mockScopedClient.asInternalUser,
        licenseService,
      });

      // add the host isolation route handlers to routerMock
      registerResponseActionRoutes(routerMock, endpointContext);

      // define a convenience function to execute an API call for a given route, body, and mocked response from ES
      // it returns the requestContext mock used in the call, to assert internal calls (e.g. the indexed document)
      callRoute = async (
        routePrefix: string,
        {
          body,
          indexErrorResponse,
          searchResponse,
          mockUser,
          license,
          authz = {},
          version,
        }: CallRouteInterface,
        indexExists?: { endpointDsExists: boolean }
      ): Promise<AwaitedProperties<SecuritySolutionRequestHandlerContextMock>> => {
        const ctx = createRouteHandlerContext(mockScopedClient, mockSavedObjectClient);

        ctx.securitySolution.getEndpointAuthz.mockResolvedValue(
          getEndpointAuthzInitialStateMock(authz)
        );

        // mock _index_template
        ctx.core.elasticsearch.client.asInternalUser.indices.existsIndexTemplate.mockResponseImplementationOnce(
          () => {
            if (indexExists) {
              return {
                body: true,
                statusCode: 200,
              };
            }
            return {
              body: false,
              statusCode: 404,
            };
          }
        );
        const asUser = mockUser ? mockUser : superUser;
        (ctx.core.security.authc.getCurrentUser as jest.Mock).mockImplementationOnce(() => asUser);

        const metadataResponse = docGen.generateHostMetadata();

        const withErrorResponse = indexErrorResponse ? indexErrorResponse : { statusCode: 201 };
        ctx.core.elasticsearch.client.asInternalUser.index.mockResponseImplementation(
          () => withErrorResponse
        );
        ctx.core.elasticsearch.client.asInternalUser.search.mockResponseImplementation(() => {
          return {
            body: legacyMetadataSearchResponseMock(searchResponse ?? metadataResponse),
          };
        });

        const withLicense = license ? license : Platinum;
        licenseEmitter.next(withLicense);

        const mockRequest = httpServerMock.createKibanaRequest({ body });
        const routeHandler: RequestHandler<any, any, any, any> = version
          ? getRegisteredVersionedRouteMock(routerMock, 'post', routePrefix, version).routeHandler
          : routerMock.post.mock.calls.find(([{ path }]) => path.startsWith(routePrefix))![1];

        await routeHandler(ctx, mockRequest, mockResponse);

        return ctx;
      };
    });

    afterEach(() => {
      endpointAppContextService.stop();
      licenseService.stop();
      licenseEmitter.complete();
      getActionDetailsByIdSpy.mockClear();
    });

    it('succeeds when an endpoint ID is provided', async () => {
      await callRoute(ISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: ['XYZ'] },
        version: '2023-10-31',
      });
      expect(mockResponse.ok).toHaveBeenCalled();
    });

    it('accepts a comment field', async () => {
      await callRoute(ISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: ['XYZ'], comment: 'XYZ' },
        version: '2023-10-31',
      });
      expect(mockResponse.ok).toHaveBeenCalled();
    });

    it('sends the action to the requested agent', async () => {
      const metadataResponse = docGen.generateHostMetadata();
      const AgentID = metadataResponse.elastic.agent.id;
      await callRoute(ISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: ['ABC-XYZ-000'] },
        searchResponse: metadataResponse,
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          agents: [AgentID],
        })
      );
    });

    it('records the user who performed the action to the action record', async () => {
      const testUser = { username: 'testuser', roles: ['superuser'] };
      await callRoute(ISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: ['XYZ'] },
        mockUser: testUser,
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: testUser.username,
        })
      );
    });

    it('records the comment in the action payload', async () => {
      const comment = "I am isolating this because it's Friday";
      await callRoute(ISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: ['XYZ'], comment },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ comment }),
        })
      );
    });

    it('creates an action and returns its ID (`action` legacy property) + ActionDetails', async () => {
      const endpointIds = ['XYZ'];
      const actionDetails = {
        agents: endpointIds,
        command: 'isolate',
        id: '1-2-3',
      } as ActionDetails;
      getActionDetailsByIdSpy.mockResolvedValue(actionDetails);

      await callRoute(ISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: endpointIds, comment: 'XYZ' },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          action_id: expect.any(String),
        })
      );

      expect(mockResponse.ok).toHaveBeenCalled();

      expect((mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse).action).toEqual(
        expect.any(String)
      );
      expect(getActionDetailsByIdSpy).toHaveBeenCalledTimes(1);

      expect((mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse).data).toEqual(
        actionDetails
      );
    });

    it('records the timeout in the action payload', async () => {
      await callRoute(ISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: ['XYZ'] },
        version: '2023-10-31',
      });
      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 300,
        })
      );
    });

    it('sends the action to the correct agent when endpoint ID is given', async () => {
      const doc = docGen.generateHostMetadata();
      const agentId = doc.elastic.agent.id;

      await callRoute(ISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: ['XYZ'] },
        searchResponse: doc,
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          agents: [agentId],
        })
      );
    });

    it('sends the isolate command payload from the isolate route', async () => {
      await callRoute(ISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: ['XYZ'] },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            command: 'isolate',
          }),
        })
      );
    });

    it('sends the unisolate command payload from the unisolate route', async () => {
      await callRoute(UNISOLATE_HOST_ROUTE_V2, {
        body: { endpoint_ids: ['XYZ'] },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            command: 'unisolate',
          }),
        })
      );
    });

    it('sends the kill-process command payload from the kill process route', async () => {
      await callRoute(KILL_PROCESS_ROUTE, {
        body: { endpoint_ids: ['XYZ'] },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            command: 'kill-process',
          }),
        })
      );
    });

    it('sends the suspend-process command payload from the suspend process route', async () => {
      await callRoute(SUSPEND_PROCESS_ROUTE, {
        body: { endpoint_ids: ['XYZ'] },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            command: 'suspend-process',
          }),
        })
      );
    });

    it('sends the running-processes command payload from the running processes route', async () => {
      await callRoute(GET_PROCESSES_ROUTE, {
        body: { endpoint_ids: ['XYZ'] },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            command: 'running-processes',
          }),
        })
      );
    });

    it('sends the get-file command payload from the get file route', async () => {
      await callRoute(GET_FILE_ROUTE, {
        body: { endpoint_ids: ['XYZ'], parameters: { path: '/one/two/three' } },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            command: 'get-file',
          }),
        })
      );
    });

    it('sends the `execute` command payload from the execute route', async () => {
      await callRoute(EXECUTE_ROUTE, {
        body: { endpoint_ids: ['XYZ'], parameters: { command: 'ls -al' } },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            command: 'execute',
          }),
        })
      );
    });

    it('sends the `scan` command payload from the scan route', async () => {
      await callRoute(SCAN_ROUTE, {
        body: { endpoint_ids: ['XYZ'], parameters: { path: '/home/usr/' } },
        version: '2023-10-31',
      });

      expect(
        (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            command: 'scan',
            parameters: { path: '/home/usr/' },
          }),
        })
      );
    });

    describe('With endpoint data streams', () => {
      it('handles unisolation', async () => {
        const ctx = await callRoute(
          UNISOLATE_HOST_ROUTE_V2,
          {
            body: { endpoint_ids: ['XYZ'] },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              command: 'unisolate',
            }),
          })
        );

        const indexDoc = ctx.core.elasticsearch.client.asInternalUser.index;
        const actionDocs: [{ index: string; document?: LogsEndpointAction }] = [
          indexDoc.mock.calls[0][0] as estypes.IndexRequest<LogsEndpointAction>,
        ];

        expect(actionDocs[0].index).toEqual(ENDPOINT_ACTIONS_INDEX);
        expect(actionDocs[0].document!.EndpointActions.data.command).toEqual('unisolate');

        expect(mockResponse.ok).toHaveBeenCalled();
        const responseBody = mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse;
        expect(responseBody.action).toBeTruthy();
      });

      it('handles isolation', async () => {
        const ctx = await callRoute(
          ISOLATE_HOST_ROUTE_V2,
          {
            body: { endpoint_ids: ['XYZ'] },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              command: 'isolate',
            }),
          })
        );

        const indexDoc = ctx.core.elasticsearch.client.asInternalUser.index;
        const actionDocs: [{ index: string; document?: LogsEndpointAction }] = [
          indexDoc.mock.calls[0][0] as estypes.IndexRequest<LogsEndpointAction>,
        ];

        expect(actionDocs[0].index).toEqual(ENDPOINT_ACTIONS_INDEX);
        expect(actionDocs[0].document!.EndpointActions.data.command).toEqual('isolate');

        expect(mockResponse.ok).toHaveBeenCalled();
        const responseBody = mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse;
        expect(responseBody.action).toBeTruthy();
      });

      it('handles kill-process', async () => {
        const parameters = { entity_id: 1234 };
        const ctx = await callRoute(
          KILL_PROCESS_ROUTE,
          {
            body: { endpoint_ids: ['XYZ'], parameters },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              command: 'kill-process',
              comment: undefined,
              parameters,
            }),
          })
        );

        const indexDoc = ctx.core.elasticsearch.client.asInternalUser.index;
        const actionDocs: [{ index: string; document?: LogsEndpointAction }] = [
          indexDoc.mock.calls[0][0] as estypes.IndexRequest<LogsEndpointAction>,
        ];

        expect(actionDocs[0].index).toEqual(ENDPOINT_ACTIONS_INDEX);
        expect(actionDocs[0].document!.EndpointActions.data.command).toEqual('kill-process');

        expect(mockResponse.ok).toHaveBeenCalled();
        const responseBody = mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse;
        expect(responseBody.action).toBeUndefined();
      });

      it('handles suspend-process', async () => {
        const parameters = { entity_id: 1234 };
        const ctx = await callRoute(
          SUSPEND_PROCESS_ROUTE,
          {
            body: { endpoint_ids: ['XYZ'], parameters },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              command: 'suspend-process',
              comment: undefined,
              parameters,
            }),
          })
        );

        const indexDoc = ctx.core.elasticsearch.client.asInternalUser.index;
        const actionDocs: [{ index: string; document?: LogsEndpointAction }] = [
          indexDoc.mock.calls[0][0] as estypes.IndexRequest<LogsEndpointAction>,
        ];

        expect(actionDocs[0].index).toEqual(ENDPOINT_ACTIONS_INDEX);
        expect(actionDocs[0].document!.EndpointActions.data.command).toEqual('suspend-process');

        expect(mockResponse.ok).toHaveBeenCalled();
        const responseBody = mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse;
        expect(responseBody.action).toBeUndefined();
      });

      it('handles running-processes', async () => {
        const ctx = await callRoute(
          GET_PROCESSES_ROUTE,
          {
            body: { endpoint_ids: ['XYZ'] },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              command: 'running-processes',
            }),
          })
        );

        const indexDoc = ctx.core.elasticsearch.client.asInternalUser.index;
        const actionDocs: [{ index: string; document?: LogsEndpointAction }] = [
          indexDoc.mock.calls[0][0] as estypes.IndexRequest<LogsEndpointAction>,
        ];

        expect(actionDocs[0].index).toEqual(ENDPOINT_ACTIONS_INDEX);
        expect(actionDocs[0].document!.EndpointActions.data.command).toEqual('running-processes');

        expect(mockResponse.ok).toHaveBeenCalled();
        const responseBody = mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse;
        expect(responseBody.action).toBeUndefined();
      });

      it('handles get-file', async () => {
        const ctx = await callRoute(
          GET_FILE_ROUTE,
          {
            body: { endpoint_ids: ['XYZ'], parameters: { path: '/one/two/three' } },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              command: 'get-file',
              comment: undefined,
              parameters: { path: '/one/two/three' },
            }),
          })
        );

        const indexDoc = ctx.core.elasticsearch.client.asInternalUser.index;
        const actionDocs: [{ index: string; document?: LogsEndpointAction }] = [
          indexDoc.mock.calls[0][0] as estypes.IndexRequest<LogsEndpointAction>,
        ];

        expect(actionDocs[0].index).toEqual(ENDPOINT_ACTIONS_INDEX);
        expect(actionDocs[0].document!.EndpointActions.data.command).toEqual('get-file');

        expect(mockResponse.ok).toHaveBeenCalled();
        const responseBody = mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse;
        expect(responseBody.action).toBeUndefined();
      });

      it('handles execute with given `command` and `timeout`', async () => {
        const ctx = await callRoute(
          EXECUTE_ROUTE,
          {
            body: { endpoint_ids: ['XYZ'], parameters: { command: 'ls -al', timeout: 1000 } },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              command: 'execute',
              parameters: expect.objectContaining({
                command: 'ls -al',
                timeout: 1000,
              }),
            }),
          })
        );

        const indexDoc = ctx.core.elasticsearch.client.asInternalUser.index;
        const actionDocs: [{ index: string; document?: LogsEndpointAction }] = [
          indexDoc.mock.calls[0][0] as estypes.IndexRequest<LogsEndpointAction>,
        ];
        expect(actionDocs[0].index).toEqual(ENDPOINT_ACTIONS_INDEX);
        expect(actionDocs[0].document!.EndpointActions.data.command).toEqual('execute');

        expect(mockResponse.ok).toHaveBeenCalled();
        const responseBody = mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse;
        expect(responseBody.action).toBeUndefined();
      });

      it('handles execute without optional `timeout` and sets it to 4 hrs if not given', async () => {
        const ctx = await callRoute(
          EXECUTE_ROUTE,
          {
            body: { endpoint_ids: ['XYZ'], parameters: { command: 'ls -al' } },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              command: 'execute',
              parameters: expect.objectContaining({
                command: 'ls -al',
                timeout: 14400,
              }),
            }),
          })
        );

        // logs-endpoint indexed doc
        const indexDoc = ctx.core.elasticsearch.client.asInternalUser.index;
        const actionDocs: [{ index: string; document?: LogsEndpointAction }] = [
          indexDoc.mock.calls[0][0] as estypes.IndexRequest<LogsEndpointAction>,
        ];

        expect(actionDocs[0].index).toEqual(ENDPOINT_ACTIONS_INDEX);
        expect(actionDocs[0].document!.EndpointActions.data.command).toEqual('execute');

        expect(mockResponse.ok).toHaveBeenCalled();
        const responseBody = mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse;
        expect(responseBody.action).toBeUndefined();
      });

      it('handles scan', async () => {
        const ctx = await callRoute(
          SCAN_ROUTE,
          {
            body: { endpoint_ids: ['XYZ'], parameters: { path: '/home/usr/' } },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              command: 'scan',
              comment: undefined,
              parameters: { path: '/home/usr/' },
            }),
          })
        );

        const indexDoc = ctx.core.elasticsearch.client.asInternalUser.index;
        const actionDocs: [{ index: string; document?: LogsEndpointAction }] = [
          indexDoc.mock.calls[0][0] as estypes.IndexRequest<LogsEndpointAction>,
        ];

        expect(actionDocs[0].index).toEqual(ENDPOINT_ACTIONS_INDEX);
        expect(actionDocs[0].document!.EndpointActions.data.command).toEqual('scan');

        expect(mockResponse.ok).toHaveBeenCalled();
        const responseBody = mockResponse.ok.mock.calls[0][0]?.body as ResponseActionApiResponse;
        expect(responseBody.action).toBeUndefined();
      });

      it('signs the action', async () => {
        await callRoute(
          ISOLATE_HOST_ROUTE_V2,
          {
            body: { endpoint_ids: ['XYZ'] },
            version: '2023-10-31',
          },
          { endpointDsExists: true }
        );

        expect(
          (await endpointAppContextService.getFleetActionsClient()).create as jest.Mock
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            signed: {
              data: 'thisisthedata',
              signature: 'thisisasignature',
            },
          })
        );
      });

      it('handles errors', async () => {
        const expectedError = new Error('Uh oh!');
        await callRoute(
          UNISOLATE_HOST_ROUTE_V2,
          {
            body: { endpoint_ids: ['XYZ'] },
            version: '2023-10-31',
            indexErrorResponse: {
              statusCode: 500,
              body: {
                result: expectedError.message,
              },
            },
          },
          { endpointDsExists: true }
        );

        expect(mockResponse.customError).toHaveBeenCalledWith({
          body: expect.any(ResponseActionsClientError),
          statusCode: 500,
        });
      });
    });

    describe('License Level', () => {
      // FIXME: This test also works for downgraded licenses (Gold)
      it('allows platinum license levels to isolate hosts', async () => {
        await callRoute(ISOLATE_HOST_ROUTE_V2, {
          body: { endpoint_ids: ['XYZ'] },
          license: Platinum,
          version: '2023-10-31',
        });
        expect(mockResponse.ok).toHaveBeenCalled();
      });

      it('prohibits isolating hosts if no authz for it', async () => {
        await callRoute(ISOLATE_HOST_ROUTE_V2, {
          body: { endpoint_ids: ['XYZ'] },
          authz: { canIsolateHost: false },
          license: Gold,
          version: '2023-10-31',
        });

        expect(mockResponse.forbidden).toHaveBeenCalled();
      });

      it('allows any license level to unisolate', async () => {
        licenseEmitter.next(Gold);
        await callRoute(UNISOLATE_HOST_ROUTE_V2, {
          body: { endpoint_ids: ['XYZ'] },
          version: '2023-10-31',
          license: Gold,
        });
        expect(mockResponse.ok).toHaveBeenCalled();
      });
    });

    describe('User Authorization Level', () => {
      it('allows user to perform isolation when canIsolateHost is true', async () => {
        await callRoute(ISOLATE_HOST_ROUTE_V2, {
          body: { endpoint_ids: ['XYZ'] },
          version: '2023-10-31',
        });
        expect(mockResponse.ok).toHaveBeenCalled();
      });

      it('allows user to perform unisolation when canUnIsolateHost is true', async () => {
        await callRoute(UNISOLATE_HOST_ROUTE_V2, {
          body: { endpoint_ids: ['XYZ'] },
          version: '2023-10-31',
        });
        expect(mockResponse.ok).toHaveBeenCalled();
      });

      it('prohibits user from performing isolation if canIsolateHost is false', async () => {
        await callRoute(ISOLATE_HOST_ROUTE_V2, {
          body: { endpoint_ids: ['XYZ'] },
          authz: { canIsolateHost: false },
          version: '2023-10-31',
        });
        expect(mockResponse.forbidden).toHaveBeenCalled();
      });

      it('prohibits user from performing un-isolation if canUnIsolateHost is false', async () => {
        await callRoute(UNISOLATE_HOST_ROUTE_V2, {
          body: { endpoint_ids: ['XYZ'] },
          authz: { canUnIsolateHost: false },
          version: '2023-10-31',
        });
        expect(mockResponse.forbidden).toHaveBeenCalled();
      });

      it('prohibits user from performing execute action if `canWriteExecuteOperations` is `false`', async () => {
        await callRoute(EXECUTE_ROUTE, {
          body: { endpoint_ids: ['XYZ'] },
          authz: { canWriteExecuteOperations: false },
          version: '2023-10-31',
        });
        expect(mockResponse.forbidden).toHaveBeenCalled();
      });

      it('prohibits user from performing `scan` action if `canWriteScanOperations` is `false`', async () => {
        await callRoute(SCAN_ROUTE, {
          body: { endpoint_ids: ['XYZ'] },
          authz: { canWriteScanOperations: false },
          version: '2023-10-31',
        });
        expect(mockResponse.forbidden).toHaveBeenCalled();
      });
    });

    describe('Cases', () => {
      let casesClient: CasesClientMock;

      const getCaseIdsFromAttachmentAddService = () => {
        return casesClient.attachments.bulkCreate.mock.calls.map(([addArgs]) => addArgs.caseId);
      };

      beforeEach(async () => {
        casesClient = (await endpointAppContextService.getCasesClient(
          {} as KibanaRequest
        )) as CasesClientMock;

        casesClient.attachments.bulkCreate.mockClear();

        let counter = 1;
        casesClient.cases.getCasesByAlertID.mockImplementation(async () => {
          return [
            {
              id: `case-${counter++}`,
              title: 'case',
              createdAt: '2022-10-31T11:49:48.806Z',
              description: 'a description',
              status: CaseStatuses.open,
              totals: {
                userComments: 1,
                alerts: 1,
                events: 0,
              },
            },
          ];
        });
      });

      it('logs a comment to the provided cases', async () => {
        await callRoute(ISOLATE_HOST_ROUTE_V2, {
          body: { endpoint_ids: ['XYZ'], case_ids: ['one', 'two'] },
          version: '2023-10-31',
        });

        expect(casesClient.attachments.bulkCreate).toHaveBeenCalledTimes(2);
        expect(getCaseIdsFromAttachmentAddService()).toEqual(
          expect.arrayContaining(['one', 'two'])
        );
      });

      it('logs a comment to any cases associated with the given alerts', async () => {
        await callRoute(ISOLATE_HOST_ROUTE_V2, {
          body: { endpoint_ids: ['XYZ'], alert_ids: ['one', 'two'] },
          version: '2023-10-31',
        });

        expect(getCaseIdsFromAttachmentAddService()).toEqual(
          expect.arrayContaining(['case-1', 'case-2'])
        );
      });

      it('logs a comment to any cases  provided on input along with cases associated with the given alerts', async () => {
        await callRoute(ISOLATE_HOST_ROUTE_V2, {
          // 'case-1` provided on `case_ids` should be dedupped
          body: {
            endpoint_ids: ['XYZ'],
            case_ids: ['ONE', 'TWO', 'case-1'],
            alert_ids: ['one', 'two'],
          },
          version: '2023-10-31',
        });

        expect(casesClient.attachments.bulkCreate).toHaveBeenCalledTimes(4);
        expect(getCaseIdsFromAttachmentAddService()).toEqual(
          expect.arrayContaining(['ONE', 'TWO', 'case-1', 'case-2'])
        );
      });
    });

    describe('Cancel Action Authorization', () => {
      const agentTypesSupportingCancelAction = RESPONSE_ACTION_AGENT_TYPE.reduce<
        ResponseActionAgentType[]
      >((acc, agentType) => {
        if (isActionSupportedByAgentType(agentType, 'cancel', 'manual')) {
          acc.push(agentType);
        }

        return acc;
      }, []);

      describe.each(agentTypesSupportingCancelAction)(`for agent type: %s`, (agentType) => {
        let fetchActionByIdSpy: jest.SpyInstance;
        let responseActionsClientMockInstance: jest.Mocked<Pick<ResponseActionsClient, 'cancel'>>;
        let originalGetResponseActionsClientMock: ((...args: any) => any) | undefined;

        const mockIsolateAction: Partial<LogsEndpointAction> = {
          EndpointActions: {
            action_id: 'test-action-id-1',
            expiration: '2024-12-31T23:59:59.999Z',
            type: 'INPUT_ACTION' as const,
            input_type: agentType,
            data: {
              command: 'isolate',
            },
          },
        };
        const mockExecuteAction: Partial<LogsEndpointAction> = {
          EndpointActions: {
            action_id: 'test-action-id-2',
            expiration: '2024-12-31T23:59:59.999Z',
            type: 'INPUT_ACTION' as const,
            input_type: agentType,
            data: {
              command: 'runscript',
            },
          },
        };

        beforeEach(() => {
          // Enable the experimental feature for cancel actions
          endpointContext.experimentalFeatures = {
            ...endpointContext.experimentalFeatures,
            microsoftDefenderEndpointCancelEnabled: true,
            responseActionsEndpointCancel: true,
          };

          // Store the original mock implementation
          originalGetResponseActionsClientMock =
            (getResponseActionsClientMock as jest.Mock).getMockImplementation() || jest.fn();

          fetchActionByIdSpy = jest
            .spyOn(fetchActionUtils, 'fetchActionRequestById')
            .mockResolvedValue(mockIsolateAction as LogsEndpointAction);

          // Mock the response actions client
          responseActionsClientMockInstance = {
            cancel: jest.fn().mockResolvedValue({
              id: 'mock-cancel-action-id',
              agents: ['agent-id'],
              command: 'cancel',
              isCompleted: true,
              isExpired: false,
              wasSuccessful: true,
              status: 'successful',
              outputs: {},
              agentState: {},
              createdBy: 'test-user',
              startedAt: '2023-05-01T12:00:00Z',
              completedAt: '2023-05-01T12:01:00Z',
              comment: '',
              action_id: 'test-action-id',
            }),
          };

          (getResponseActionsClientMock as jest.Mock).mockReturnValue(
            responseActionsClientMockInstance
          );
        });

        afterEach(() => {
          fetchActionByIdSpy.mockRestore();
          // Restore the original mock implementation
          if (originalGetResponseActionsClientMock) {
            (getResponseActionsClientMock as jest.Mock).mockImplementation(
              originalGetResponseActionsClientMock
            );
          } else {
            (getResponseActionsClientMock as jest.Mock).mockRestore();
          }
          jest.clearAllMocks();
        });

        it('allows cancel action when user has baseline permissions for isolate command', async () => {
          fetchActionByIdSpy.mockResolvedValue({
            EndpointActions: {
              data: { command: 'isolate' },
              input_type: agentType,
            },
          });

          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'test-action-id' },
            } as CancelActionRequestBody,
            authz: { canIsolateHost: true },
            version: '2023-10-31',
          });
          expect(mockResponse.ok).toHaveBeenCalled();
          expect(fetchActionByIdSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            'test-action-id'
          );
          expect(responseActionsClientMockInstance.cancel).toHaveBeenCalledWith({
            endpoint_ids: ['test-endpoint-id'],
            parameters: { id: 'test-action-id' },
          });
        });

        it('allows cancel action route access regardless of baseline permissions', async () => {
          // Mock the command-specific validation to succeed
          // (this simulates the user having the required permission for the specific command being cancelled)
          fetchActionByIdSpy.mockResolvedValue({
            EndpointActions: {
              data: { command: 'isolate' },
              input_type: agentType,
            },
          });

          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'test-action-id' },
            } as CancelActionRequestBody,
            authz: { canReadActionsLogManagement: false, canIsolateHost: true }, // Has permission for the command being cancelled
            version: '2023-10-31',
          });
          expect(mockResponse.ok).toHaveBeenCalled();
        });

        it('prohibits cancel action when user lacks command-specific permission for isolate', async () => {
          fetchActionByIdSpy.mockResolvedValue({
            EndpointActions: {
              data: { command: 'isolate' },
              input_type: agentType,
            },
          });

          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'test-action-id' },
            } as CancelActionRequestBody,
            authz: { canReadActionsLogManagement: true, canIsolateHost: false },
            version: '2023-10-31',
          });
          expect(mockResponse.forbidden).toHaveBeenCalled();
        });

        it('allows cancel action for runscript command when user has required permissions', async () => {
          fetchActionByIdSpy.mockResolvedValue(mockExecuteAction);
          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'test-action-id' },
            } as CancelActionRequestBody,
            authz: { canReadActionsLogManagement: true, canWriteExecuteOperations: true },
            version: '2023-10-31',
          });
          expect(mockResponse.ok).toHaveBeenCalled();
          expect(responseActionsClientMockInstance.cancel).toHaveBeenCalledWith({
            endpoint_ids: ['test-endpoint-id'],
            parameters: { id: 'test-action-id' },
          });
        });

        it('prohibits cancel action for runscript command when user lacks execute permissions', async () => {
          fetchActionByIdSpy.mockResolvedValue(mockExecuteAction);
          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'test-action-id' },
            } as CancelActionRequestBody,
            authz: { canReadActionsLogManagement: true, canWriteExecuteOperations: false },
            version: '2023-10-31',
          });
          expect(mockResponse.forbidden).toHaveBeenCalled();
        });

        it('returns 404 when action to cancel is not found', async () => {
          fetchActionByIdSpy.mockResolvedValue(null);
          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'non-existent-action' },
            } as CancelActionRequestBody,
            authz: { canReadActionsLogManagement: true },
            version: '2023-10-31',
          });
          expect(mockResponse.customError).toHaveBeenCalledWith({
            body: expect.objectContaining({
              message: "Action with id 'non-existent-action' not found.",
            }),
            statusCode: 404,
          });
        });

        it('returns 400 when action has missing command information', async () => {
          fetchActionByIdSpy.mockResolvedValue({ EndpointActions: { data: {} } });
          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'test-action-id' },
            } as CancelActionRequestBody,
            authz: {},
            version: '2023-10-31',
          });
          expect(mockResponse.customError).toHaveBeenCalledWith({
            body: expect.objectContaining({
              message: "Unable to determine command type for action 'test-action-id'",
            }),
            statusCode: 500,
          });
        });

        it('returns 404 when user tries to cancel action from different space', async () => {
          // Simulate action not found in current space (user in 'other-space', action in 'default')
          fetchActionByIdSpy.mockResolvedValue(null);
          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'action-from-different-space' },
            } as CancelActionRequestBody,
            authz: { canReadActionsLogManagement: true },
            version: '2023-10-31',
          });
          expect(mockResponse.customError).toHaveBeenCalledWith({
            body: expect.objectContaining({
              message: "Action with id 'action-from-different-space' not found.",
            }),
            statusCode: 404,
          });
        });

        it('handles race condition when action is completed between validation and cancellation', async () => {
          // Mock the action as existing during validation
          fetchActionByIdSpy.mockResolvedValue(mockIsolateAction);

          // Mock the response actions client to simulate action already completed
          responseActionsClientMockInstance.cancel = jest
            .fn()
            .mockRejectedValue(
              new ResponseActionsClientError(
                'Action cannot be cancelled as it has already completed',
                400
              )
            );

          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'already-completed-action' },
            } as CancelActionRequestBody,
            authz: { canReadActionsLogManagement: true, canIsolateHost: true },
            version: '2023-10-31',
          });

          expect(mockResponse.customError).toHaveBeenCalledWith({
            body: expect.objectContaining({
              message: 'Action cannot be cancelled as it has already completed',
            }),
            statusCode: 400,
          });
        });

        it('returns 403 when cancel feature flag is disabled', async () => {
          // Disable the experimental feature for cancel actions
          endpointContext.experimentalFeatures = {
            ...endpointContext.experimentalFeatures,
            microsoftDefenderEndpointCancelEnabled: false,
            responseActionsEndpointCancel: false,
          };

          await callRoute(CANCEL_ROUTE, {
            body: {
              endpoint_ids: ['test-endpoint-id'],
              parameters: { id: 'test-action-id' },
            } as CancelActionRequestBody,
            authz: { canIsolateHost: true },
            version: '2023-10-31',
          });

          expect(mockResponse.forbidden).toHaveBeenCalled();
        });
      });
    });
  });

  describe('Upload response action handler', () => {
    type UploadHttpApiTestSetupMock = HttpApiTestSetupMock<
      never,
      never,
      UploadActionApiRequestBody
    >;
    type UploadRequestHandler = RequestHandler<
      never,
      never,
      UploadActionApiRequestBody,
      SecuritySolutionRequestHandlerContext
    >;

    let testSetup: UploadHttpApiTestSetupMock;
    let httpRequestMock: ReturnType<UploadHttpApiTestSetupMock['createRequestMock']>;
    let httpHandlerContextMock: UploadHttpApiTestSetupMock['httpHandlerContextMock'];
    let httpResponseMock: UploadHttpApiTestSetupMock['httpResponseMock'];
    let fleetFilesClientMock: jest.Mocked<FleetToHostFileClientInterface>;
    let callHandler: () => ReturnType<UploadRequestHandler>;
    let fileContent: HapiReadableStream;
    let createdUploadAction: ActionDetails;

    beforeEach(async () => {
      testSetup = createHttpApiTestSetupMock<never, never, UploadActionApiRequestBody>();

      ({ httpHandlerContextMock, httpResponseMock } = testSetup);
      httpRequestMock = testSetup.createRequestMock();

      fleetFilesClientMock =
        (await testSetup.endpointAppContextMock.service.getFleetToHostFilesClient()) as jest.Mocked<FleetToHostFileClientInterface>;

      fileContent = createHapiReadableStreamMock();

      const reqBody: UploadActionApiRequestBody = {
        file: fileContent,
        endpoint_ids: ['123-456'],
        parameters: {
          overwrite: true,
        },
      };

      testSetup
        .getEsClientMock('internalUser')
        // @ts-expect-error issue with `index()` method being overloaded
        .index.mockResolvedValue(responseActionsClientMock.createIndexedResponse());

      httpRequestMock = testSetup.createRequestMock({ body: reqBody });
      registerResponseActionRoutes(testSetup.routerMock, testSetup.endpointAppContextMock);

      // Helper function to set up authorization - similar to callRoute pattern
      const setupAuthz = (authz: Partial<EndpointAuthz>) => {
        const currentSecuritySolution = testSetup.httpHandlerContextMock.securitySolution;
        testSetup.httpHandlerContextMock.securitySolution = currentSecuritySolution.then(
          (resolved) => ({
            ...resolved,
            getEndpointAuthz: jest.fn().mockResolvedValue(getEndpointAuthzInitialStateMock(authz)),
          })
        );
      };

      // Set up authorization for upload operations
      setupAuthz({ canWriteFileOperations: true });

      const actionsGenerator = new EndpointActionGenerator('seed');
      createdUploadAction = actionsGenerator.generateActionDetails({
        command: 'upload',
      });

      (testSetup.endpointAppContextMock.service.getEndpointMetadataService as jest.Mock) = jest
        .fn()
        .mockReturnValue({
          getMetadataForEndpoints: jest.fn().mockResolvedValue([
            {
              elastic: {
                agent: {
                  id: '123-456',
                },
              },
              agent: {
                id: '123-456',
              },
              host: {
                hostname: 'test-host',
              },
            },
          ]),
        });

      const handler = testSetup.getRegisteredVersionedRoute('post', UPLOAD_ROUTE, '2023-10-31')
        .routeHandler as UploadRequestHandler;

      callHandler = () => handler(httpHandlerContextMock, httpRequestMock, httpResponseMock);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should create a file', async () => {
      await callHandler();

      expect(fleetFilesClientMock.create).toHaveBeenCalledWith(fileContent, ['123-456']);
    });

    it('should create the action using parameters with stored file info', async () => {
      await callHandler();

      const createActionMock = testSetup.getEsClientMock();
      expect(createActionMock.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            EndpointActions: expect.objectContaining({
              data: expect.objectContaining({
                parameters: {
                  file_id: '123-456-789',
                  file_name: 'foo.txt',
                  file_sha256: '96b76a1a911662053a1562ac14c4ff1e87c2ff550d6fe52e1e0b3790526597d3',
                  file_size: 45632,
                  overwrite: true,
                },
              }),
            }),
          }),
        }),
        { meta: true }
      );
    });

    it('should delete file if creation of Action fails', async () => {
      testSetup.getEsClientMock('internalUser').index.mockImplementation(async () => {
        throw new CustomHttpRequestError('oh oh');
      });
      await callHandler();

      expect(fleetFilesClientMock.delete).toHaveBeenCalledWith('123-456-789');
    });

    it('should update file with action id', async () => {
      await callHandler();

      expect(fleetFilesClientMock.update).toHaveBeenCalledWith('123-456-789', {
        actionId: '123',
      });
    });

    it('should return expected response on success', async () => {
      getActionDetailsByIdSpy.mockResolvedValue(createdUploadAction);
      await callHandler();

      expect(httpResponseMock.ok).toHaveBeenCalledWith({
        body: {
          data: omit(createdUploadAction, 'action'),
        },
      });
    });
  });

  describe('and `responseActionsSentinelOneV1Enabled` feature flag is enabled', () => {
    let testSetup: HttpApiTestSetupMock;
    let httpRequestMock: ReturnType<HttpApiTestSetupMock['createRequestMock']>;
    let httpHandlerContextMock: HttpApiTestSetupMock['httpHandlerContextMock'];
    let httpResponseMock: HttpApiTestSetupMock['httpResponseMock'];
    let callHandler: () => ReturnType<RequestHandler>;

    beforeEach(async () => {
      testSetup = createHttpApiTestSetupMock();

      ({ httpHandlerContextMock, httpResponseMock } = testSetup);
      httpRequestMock = testSetup.createRequestMock();

      testSetup.endpointAppContextMock.experimentalFeatures = {
        ...testSetup.endpointAppContextMock.experimentalFeatures,
      };

      httpHandlerContextMock.actions = Promise.resolve({
        getActionsClient: () => sentinelOneMock.createConnectorActionsClient(),
      } as unknown as jest.Mocked<ActionsApiRequestHandlerContext>);

      // Set the esClient to be used in the handler context
      // eslint-disable-next-line require-atomic-updates
      httpHandlerContextMock.core = Promise.resolve(
        set(
          await httpHandlerContextMock.core,
          'elasticsearch.client.asInternalUser',
          responseActionsClientMock.createConstructorOptions().esClient
        )
      );

      httpRequestMock = testSetup.createRequestMock({
        body: {
          endpoint_ids: ['123-456'],
        },
      });
      registerResponseActionRoutes(testSetup.routerMock, testSetup.endpointAppContextMock);

      // Helper function to set up authorization - similar to callRoute pattern
      const setupAuthz = (authz: Partial<EndpointAuthz>) => {
        const currentSecuritySolution = testSetup.httpHandlerContextMock.securitySolution;
        testSetup.httpHandlerContextMock.securitySolution = currentSecuritySolution.then(
          (resolved) => ({
            ...resolved,
            getEndpointAuthz: jest.fn().mockResolvedValue(getEndpointAuthzInitialStateMock(authz)),
          })
        );
      };

      // Set up authorization for isolate operations
      setupAuthz({ canIsolateHost: true });

      (testSetup.endpointAppContextMock.service.getEndpointMetadataService as jest.Mock) = jest
        .fn()
        .mockReturnValue({
          getMetadataForEndpoints: jest.fn().mockResolvedValue([
            {
              elastic: { agent: { id: '123-456' } },
              agent: { id: '123-456', version: '8.0.0' },
              host: { hostname: 'test-host' },
              Endpoint: { capabilities: ['isolation'] },
            },
          ]),
          findHostMetadataForFleetAgents: jest.fn().mockResolvedValue([
            {
              elastic: { agent: { id: '123-456' } },
              agent: { id: '123-456', version: '8.0.0' },
              host: { hostname: 'test-host' },
              Endpoint: { capabilities: ['isolation'] },
            },
          ]),
        });

      const handler = testSetup.getRegisteredVersionedRoute(
        'post',
        ISOLATE_HOST_ROUTE_V2,
        '2023-10-31'
      ).routeHandler as RequestHandler;

      callHandler = () => handler(httpHandlerContextMock, httpRequestMock, httpResponseMock);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it.each([
      ['undefined', undefined],
      ['blank value', ''],
      ['endpoint', 'endpoint'],
    ])(
      'should use endpoint response actions client when agentType is: %s',
      async (_, agentTypeValue) => {
        if (agentTypeValue !== undefined) {
          httpRequestMock.body.agent_type = agentTypeValue as ResponseActionAgentType;
        }
        await callHandler();

        expect(getResponseActionsClientMock).toHaveBeenCalledWith('endpoint', expect.anything());
        expect(httpResponseMock.ok).toHaveBeenCalled();
      }
    );

    it('should use SentinelOne response actions client when agent type is sentinel_one', async () => {
      httpRequestMock.body.agent_type = 'sentinel_one';
      await callHandler();

      expect(getResponseActionsClientMock).toHaveBeenCalledWith('sentinel_one', expect.anything());
    });
  });

  describe('and agent type if Microsoft Defender', () => {
    let testSetup: HttpApiTestSetupMock;
    let httpRequestMock: ReturnType<HttpApiTestSetupMock['createRequestMock']>;
    let httpHandlerContextMock: HttpApiTestSetupMock['httpHandlerContextMock'];
    let httpResponseMock: HttpApiTestSetupMock['httpResponseMock'];
    let callHandler: () => ReturnType<RequestHandler>;

    beforeEach(async () => {
      testSetup = createHttpApiTestSetupMock();

      ({ httpHandlerContextMock, httpResponseMock } = testSetup);
      httpRequestMock = testSetup.createRequestMock();

      httpHandlerContextMock.actions = Promise.resolve({
        getActionsClient: () => sentinelOneMock.createConnectorActionsClient(),
      } as unknown as jest.Mocked<ActionsApiRequestHandlerContext>);

      // Set the esClient to be used in the handler context
      // eslint-disable-next-line require-atomic-updates
      httpHandlerContextMock.core = Promise.resolve(
        set(
          await httpHandlerContextMock.core,
          'elasticsearch.client.asInternalUser',
          responseActionsClientMock.createConstructorOptions().esClient
        )
      );

      httpRequestMock = testSetup.createRequestMock({
        body: {
          endpoint_ids: ['123-456'],
          agent_type: 'microsoft_defender_endpoint',
        },
      });
      registerResponseActionRoutes(testSetup.routerMock, testSetup.endpointAppContextMock);

      (testSetup.endpointAppContextMock.service.getEndpointMetadataService as jest.Mock) = jest
        .fn()
        .mockReturnValue({
          getMetadataForEndpoints: jest.fn().mockResolvedValue([
            {
              elastic: { agent: { id: '123-456' } },
              agent: { id: '123-456', version: '8.0.0' },
              host: { hostname: 'test-host' },
              Endpoint: { capabilities: ['isolation'] },
            },
          ]),
          findHostMetadataForFleetAgents: jest.fn().mockResolvedValue([
            {
              elastic: { agent: { id: '123-456' } },
              agent: { id: '123-456', version: '8.0.0' },
              host: { hostname: 'test-host' },
              Endpoint: { capabilities: ['isolation'] },
            },
          ]),
        });

      const handler = testSetup.getRegisteredVersionedRoute(
        'post',
        ISOLATE_HOST_ROUTE_V2,
        '2023-10-31'
      ).routeHandler as RequestHandler;

      callHandler = () => handler(httpHandlerContextMock, httpRequestMock, httpResponseMock);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should use the Microsoft Defender response actions client', async () => {
      await callHandler();
      expect(getResponseActionsClientMock).toHaveBeenCalledWith(
        'microsoft_defender_endpoint',
        expect.anything()
      );
    });
  });

  describe('memory dump response action route', () => {
    let testSetup: HttpApiTestSetupMock;
    let httpRequestMock: ReturnType<HttpApiTestSetupMock['createRequestMock']>;
    let httpHandlerContextMock: HttpApiTestSetupMock['httpHandlerContextMock'];
    let httpResponseMock: HttpApiTestSetupMock['httpResponseMock'];
    let callHandler: () => ReturnType<RequestHandler>;

    beforeEach(async () => {
      testSetup = createHttpApiTestSetupMock();

      // @ts-expect-error
      testSetup.endpointAppContextMock.experimentalFeatures.responseActionsEndpointMemoryDump =
        true;

      ({ httpHandlerContextMock, httpResponseMock } = testSetup);
      httpRequestMock = testSetup.createRequestMock();

      httpHandlerContextMock.actions = Promise.resolve({
        getActionsClient: () => actionsClientMock.create(),
      } as unknown as jest.Mocked<ActionsApiRequestHandlerContext>);

      // Set the esClient to be used in the handler context
      // eslint-disable-next-line require-atomic-updates
      httpHandlerContextMock.core = Promise.resolve(
        set(
          await httpHandlerContextMock.core,
          'elasticsearch.client.asInternalUser',
          responseActionsClientMock.createConstructorOptions().esClient
        )
      );

      httpRequestMock = testSetup.createRequestMock({
        body: {
          endpoint_ids: ['123-456'],
          agent_type: 'endpoint',
          parameters: {
            type: 'kernel',
          },
        },
      });
      registerResponseActionRoutes(testSetup.routerMock, testSetup.endpointAppContextMock);

      const handler = testSetup.getRegisteredVersionedRoute('post', MEMORY_DUMP_ROUTE, '2023-10-31')
        .routeHandler as RequestHandler;

      callHandler = () => handler(httpHandlerContextMock, httpRequestMock, httpResponseMock);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should error if feature flag is disabled', async () => {
      // @ts-expect-error
      testSetup.endpointAppContextMock.experimentalFeatures.responseActionsEndpointMemoryDump =
        false;
      await callHandler();

      expect(httpResponseMock.customError).toHaveBeenCalledWith({
        body: expect.objectContaining({
          message: '[request body.agent_type]: feature is disabled',
        }),
        statusCode: 400,
      });
    });

    it('should error if agentType is not Endpoint', async () => {
      httpRequestMock.body.agent_type = 'sentinel_one';
      await callHandler();

      expect(httpResponseMock.customError).toHaveBeenCalledWith({
        body: expect.objectContaining({
          message: '[request body.agent_type]: feature is disabled',
        }),
        statusCode: 400,
      });
    });

    it('should call memory dump client method', async () => {
      const mockEndpointCLient = { memoryDump: jest.fn().mockResolvedValue({}) };
      (getResponseActionsClientMock as jest.Mock).mockReturnValue(mockEndpointCLient);
      await callHandler();

      expect(mockEndpointCLient.memoryDump).toHaveBeenCalledWith({
        agent_type: 'endpoint',
        endpoint_ids: ['123-456'],
        parameters: { type: 'kernel' },
      });
    });

    it('should error if user does not have permissions to perform action', async () => {
      (
        (await httpHandlerContextMock.securitySolution).getEndpointAuthz as jest.Mock
      ).mockResolvedValue({
        canExecuteActions: false,
      });
      await callHandler();

      expect(httpResponseMock.forbidden).toHaveBeenCalled();
    });
  });
});
