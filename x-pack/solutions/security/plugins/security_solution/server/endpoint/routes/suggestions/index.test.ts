/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import type { ScopedClusterClientMock } from '@kbn/core/server/mocks';
import {
  elasticsearchServiceMock,
  savedObjectsClientMock,
  httpServerMock,
  httpServiceMock,
} from '@kbn/core/server/mocks';
import type {
  KibanaResponseFactory,
  RequestHandlerContext,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { ConfigSchema } from '@kbn/kql/server/config';
import type { Observable } from 'rxjs';
import { dataPluginMock } from '@kbn/kql/server/mocks';
import { termsEnumSuggestions } from '@kbn/kql/server/autocomplete/terms_enum';
import { termsAggSuggestions } from '@kbn/kql/server/autocomplete/terms_agg';
import {
  createMockEndpointAppContext,
  createMockEndpointAppContextServiceStartContract,
  createRouteHandlerContext,
  getRegisteredVersionedRouteMock,
} from '../../mocks';
import type { EndpointAuthz } from '../../../../common/endpoint/types/authz';
import { applyActionsEsSearchMock } from '../../services/actions/mocks';
import { requestContextMock } from '../../../lib/detection_engine/routes/__mocks__';
import type { EndpointSuggestionsSchema } from '../../../../common/api/endpoint';
import { getEndpointSuggestionsRequestHandler, registerEndpointSuggestionsRoutes } from '.';
import { getEndpointAuthzInitialStateMock } from '../../../../common/endpoint/service/authz/mocks';
import {
  eventsIndexPattern,
  DEVICE_EVENTS_INDEX_PATTERN,
  SUGGESTIONS_INTERNAL_ROUTE,
  METADATA_UNITED_INDEX,
  alertsIndexPattern,
} from '../../../../common/endpoint/constants';
import { EndpointAppContextService } from '../../endpoint_app_context_services';
import { buildIndexNameWithNamespace } from '../../../../common/endpoint/utils/index_name_utilities';
import { PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import { resetCcsCache } from '../../utils/ccs_utils';
import type { DeepMutable } from '../../../../common/endpoint/types/utility_types';
import type { ExperimentalFeatures } from '../../../../common/experimental_features';

jest.mock('@kbn/kql/server/autocomplete/terms_enum', () => {
  return {
    termsEnumSuggestions: jest.fn(),
  };
});

jest.mock('@kbn/kql/server/autocomplete/terms_agg', () => {
  return {
    termsAggSuggestions: jest.fn(),
  };
});

jest.mock('../../../../common/endpoint/utils/index_name_utilities', () => ({
  buildIndexNameWithNamespace: jest.fn(),
}));

const termsEnumSuggestionsMock = termsEnumSuggestions as jest.MockedFunction<
  typeof termsEnumSuggestions
>;
const termsAggSuggestionsMock = termsAggSuggestions as jest.MockedFunction<
  typeof termsAggSuggestions
>;
const buildIndexNameWithNamespaceMock = buildIndexNameWithNamespace as jest.MockedFunction<
  typeof buildIndexNameWithNamespace
>;

interface CallRouteInterface {
  params: TypeOf<typeof EndpointSuggestionsSchema.params>;
  authz?: Partial<EndpointAuthz>;
}

describe('when calling the Suggestions route handler', () => {
  let mockScopedEsClient: ScopedClusterClientMock;
  let mockSavedObjectClient: jest.Mocked<SavedObjectsClientContract>;
  let mockResponse: jest.Mocked<KibanaResponseFactory>;
  let suggestionsRouteHandler: ReturnType<typeof getEndpointSuggestionsRequestHandler>;
  let callRoute: (
    routePrefix: string,
    opts: CallRouteInterface,
    indexExists?: { endpointDsExists: boolean }
  ) => Promise<void>;
  let mockEndpointContext: ReturnType<typeof createMockEndpointAppContext>;
  let config$: Observable<ConfigSchema>;

  beforeEach(() => {
    resetCcsCache();
    mockEndpointContext = createMockEndpointAppContext();
    (mockEndpointContext.service.getEndpointMetadataService as jest.Mock) = jest
      .fn()
      .mockReturnValue({
        findHostMetadataForFleetAgents: jest.fn().mockResolvedValue([]),
      });
    mockScopedEsClient = elasticsearchServiceMock.createScopedClusterClient();
    (
      mockScopedEsClient.asInternalUser.cluster.remoteInfo as unknown as jest.Mock
    ).mockResolvedValue({});
    mockSavedObjectClient = savedObjectsClientMock.create();
    mockResponse = httpServerMock.createResponseFactory();

    config$ = dataPluginMock
      .createSetupContract()
      .autocomplete.getInitializerContextConfig()
      .create();

    // Reset mocks
    termsEnumSuggestionsMock.mockClear().mockResolvedValue([]);
    termsAggSuggestionsMock.mockClear().mockResolvedValue(['suggestion1', 'suggestion2']);
    buildIndexNameWithNamespaceMock.mockClear();
  });

  describe('having right privileges', () => {
    describe('when space awareness feature is enabled', () => {
      beforeEach(() => {
        suggestionsRouteHandler = getEndpointSuggestionsRequestHandler(
          config$,
          mockEndpointContext
        );
      });

      it('should use space-aware index pattern successfully', async () => {
        const spaceId = 'custom-space';
        const mockIntegrationNamespaces = { endpoint: ['custom-namespace'] };
        const mockIndexPattern = 'logs-endpoint.events.*-custom-namespace';

        applyActionsEsSearchMock(mockScopedEsClient.asInternalUser);

        const mockContext = requestContextMock.convertContext(
          createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
        );

        // Mock the space ID retrieval using the correct pattern
        ((await mockContext.securitySolution).getSpaceId as jest.Mock).mockReturnValue(spaceId);

        // Mock the fleet services
        const mockFleetServices = {
          getIntegrationNamespaces: jest.fn().mockResolvedValue(mockIntegrationNamespaces),
        };
        mockEndpointContext.service.getInternalFleetServices = jest
          .fn()
          .mockReturnValue(mockFleetServices);

        // Mock the buildIndexNameWithNamespace function
        buildIndexNameWithNamespaceMock.mockReturnValue(mockIndexPattern);

        const fieldName = 'process.id';
        const mockRequest = httpServerMock.createKibanaRequest<
          TypeOf<typeof EndpointSuggestionsSchema.params>,
          never,
          never
        >({
          params: { suggestion_type: 'eventFilters' },
          body: {
            field: 'process.id',
            query: 'test-query',
            filters: [{ term: { 'test.field': 'test-value' } }],
            fieldMeta: 'test-field-meta',
          },
        });

        await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

        expect((await mockContext.securitySolution).getSpaceId as jest.Mock).toHaveBeenCalled();
        expect(mockEndpointContext.service.getInternalFleetServices).toHaveBeenCalledWith(spaceId);
        expect(mockFleetServices.getIntegrationNamespaces).toHaveBeenCalledWith(['endpoint']);
        expect(buildIndexNameWithNamespaceMock).toHaveBeenCalledWith(
          eventsIndexPattern,
          'custom-namespace',
          { preserveWildcard: true }
        );
        expect(termsEnumSuggestionsMock).toHaveBeenNthCalledWith(
          1,
          expect.any(Object),
          expect.any(Object),
          mockScopedEsClient.asInternalUser,
          mockIndexPattern,
          fieldName,
          'test-query',
          [{ term: { 'test.field': 'test-value' } }],
          'test-field-meta',
          expect.any(Object)
        );

        expect(mockResponse.ok).toHaveBeenCalled();
      });

      it('should return bad request when space-aware index pattern retrieval fails', async () => {
        const spaceId = 'custom-space';
        const mockIntegrationNamespaces = { endpoint: [] }; // Empty array to simulate failure

        applyActionsEsSearchMock(mockScopedEsClient.asInternalUser);

        const mockContext = requestContextMock.convertContext(
          createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
        );

        // Mock the space ID retrieval using the correct pattern
        ((await mockContext.securitySolution).getSpaceId as jest.Mock).mockReturnValue(spaceId);

        // Mock the fleet services
        const mockFleetServices = {
          getIntegrationNamespaces: jest.fn().mockResolvedValue(mockIntegrationNamespaces),
        };
        mockEndpointContext.service.getInternalFleetServices = jest
          .fn()
          .mockReturnValue(mockFleetServices);

        // Mock the buildIndexNameWithNamespace function to return null (indicating failure)
        buildIndexNameWithNamespaceMock.mockReturnValue(null as unknown as string);

        const mockRequest = httpServerMock.createKibanaRequest<
          TypeOf<typeof EndpointSuggestionsSchema.params>,
          never,
          never
        >({
          params: { suggestion_type: 'eventFilters' },
          body: {
            field: 'process.id',
            query: 'test-query',
            filters: [{ term: { 'test.field': 'test-value' } }],
            fieldMeta: 'test-field-meta',
          },
        });

        await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

        expect((await mockContext.securitySolution).getSpaceId as jest.Mock).toHaveBeenCalled();
        expect(mockEndpointContext.service.getInternalFleetServices).toHaveBeenCalledWith(spaceId);
        expect(mockFleetServices.getIntegrationNamespaces).toHaveBeenCalledWith(['endpoint']);
        // buildIndexNameWithNamespace should not be called when namespaces array is empty
        expect(buildIndexNameWithNamespaceMock).not.toHaveBeenCalled();
        expect(mockResponse.badRequest).toHaveBeenCalledWith({
          body: 'Failed to retrieve current space index patterns',
        });
      });

      it('should handle errors during space-aware processing gracefully', async () => {
        const spaceId = 'custom-space';
        const mockIntegrationNamespaces = { endpoint: ['custom-namespace'] };
        const mockIndexPattern = 'logs-endpoint.events.*-custom-namespace';

        applyActionsEsSearchMock(mockScopedEsClient.asInternalUser);

        const mockContext = requestContextMock.convertContext(
          createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
        );

        // Mock the space ID retrieval using the correct pattern
        ((await mockContext.securitySolution).getSpaceId as jest.Mock).mockReturnValue(spaceId);

        // Mock the fleet services
        const mockFleetServices = {
          getIntegrationNamespaces: jest.fn().mockResolvedValue(mockIntegrationNamespaces),
        };
        mockEndpointContext.service.getInternalFleetServices = jest
          .fn()
          .mockReturnValue(mockFleetServices);

        // Mock the buildIndexNameWithNamespace function successfully
        buildIndexNameWithNamespaceMock.mockReturnValue(mockIndexPattern);

        // Mock termsEnumSuggestions to throw an error (this is inside the try-catch block)
        termsEnumSuggestionsMock.mockRejectedValue(new Error('Search service error'));

        const mockRequest = httpServerMock.createKibanaRequest<
          TypeOf<typeof EndpointSuggestionsSchema.params>,
          never,
          never
        >({
          params: { suggestion_type: 'eventFilters' },
          body: {
            field: 'process.id',
            query: 'test-query',
            filters: [{ term: { 'test.field': 'test-value' } }],
            fieldMeta: 'test-field-meta',
          },
        });

        await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

        expect(mockEndpointContext.service.getInternalFleetServices).toHaveBeenCalledWith(spaceId);
        expect(mockFleetServices.getIntegrationNamespaces).toHaveBeenCalledWith(['endpoint']);
        expect(buildIndexNameWithNamespaceMock).toHaveBeenCalledWith(
          eventsIndexPattern,
          'custom-namespace',
          { preserveWildcard: true }
        );

        // Verify that the error was handled gracefully
        expect(mockResponse.customError).toHaveBeenCalledWith({
          statusCode: 500,
          body: expect.objectContaining({
            message: expect.stringContaining('Search service error'),
          }),
        });
      });
    });

    describe('when suggestion_type is endpoints', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mockFleetServices: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mockSecuritySolutionContext: any;

      beforeEach(() => {
        mockFleetServices = {
          packagePolicy: {
            fetchAllItems: jest.fn(),
          },
        };

        mockSecuritySolutionContext = {
          getInternalFleetServices: jest.fn().mockReturnValue(mockFleetServices),
          getSpaceId: jest.fn().mockReturnValue('default'),
        };

        applyActionsEsSearchMock(mockScopedEsClient.asInternalUser);
      });

      describe('when space awareness is enabled', () => {
        beforeEach(() => {
          mockEndpointContext.experimentalFeatures = {
            ...mockEndpointContext.experimentalFeatures,
          };
          suggestionsRouteHandler = getEndpointSuggestionsRequestHandler(
            config$,
            mockEndpointContext
          );
        });

        it('should use metadata united index and call termsAggSuggestions with agent policy filters', async () => {
          const mockPackagePolicies = [{ policy_ids: ['policy-1', 'policy-2'] }];
          const mockAsyncIterable = {
            async *[Symbol.asyncIterator]() {
              yield mockPackagePolicies;
            },
          };
          mockFleetServices.packagePolicy.fetchAllItems.mockResolvedValue(mockAsyncIterable);

          const mockContext = requestContextMock.convertContext(
            createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
          );

          mockContext.securitySolution = mockSecuritySolutionContext;

          const fieldName = 'united.agent.policy_id';
          const mockRequest = httpServerMock.createKibanaRequest<
            TypeOf<typeof EndpointSuggestionsSchema.params>,
            never,
            never
          >({
            params: { suggestion_type: 'endpoints' },
            body: {
              field: fieldName,
              query: 'test-query',
              filters: [{ term: { 'some.field': 'some-value' } }],
              fieldMeta: 'test-field-meta',
            },
          });

          await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

          expect(mockFleetServices.packagePolicy.fetchAllItems).toHaveBeenCalledWith(
            mockSavedObjectClient,
            {
              kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name:endpoint`,
              spaceIds: ['default'],
            }
          );

          const expectedFilters = [
            { term: { 'some.field': 'some-value' } },
            {
              bool: {
                must_not: {
                  terms: {
                    'agent.id': [
                      '00000000-0000-0000-0000-000000000000',
                      '11111111-1111-1111-1111-111111111111',
                    ],
                  },
                },
                filter: [
                  { exists: { field: 'united.endpoint.agent.id' } },
                  { exists: { field: 'united.agent.agent.id' } },
                  {
                    term: {
                      'united.agent.active': {
                        value: true,
                      },
                    },
                  },
                  {
                    terms: {
                      'united.agent.policy_id': ['policy-1', 'policy-2'],
                    },
                  },
                ],
              },
            },
          ];

          expect(termsAggSuggestionsMock).toHaveBeenCalledWith(
            expect.any(Object), // config
            expect.any(Object), // savedObjects.client
            expect.any(Object), // elasticsearch.client.asInternalUser
            METADATA_UNITED_INDEX,
            fieldName,
            'test-query',
            expectedFilters,
            'test-field-meta',
            expect.any(Object) // abortSignal
          );

          expect(mockResponse.ok).toHaveBeenCalled();
        });

        it('should handle empty agent policies list when space awareness is enabled', async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mockPackagePolicies: any[] = [];
          const mockAsyncIterable = {
            async *[Symbol.asyncIterator]() {
              yield mockPackagePolicies;
            },
          };
          mockFleetServices.packagePolicy.fetchAllItems.mockResolvedValue(mockAsyncIterable);

          const mockContext = requestContextMock.convertContext(
            createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
          );

          mockContext.securitySolution = mockSecuritySolutionContext;

          const fieldName = 'united.agent.policy_id';
          const mockRequest = httpServerMock.createKibanaRequest<
            TypeOf<typeof EndpointSuggestionsSchema.params>,
            never,
            never
          >({
            params: { suggestion_type: 'endpoints' },
            body: {
              field: fieldName,
              query: 'test-query',
              filters: [],
              fieldMeta: 'test-field-meta',
            },
          });

          await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

          expect(mockFleetServices.packagePolicy.fetchAllItems).toHaveBeenCalledWith(
            mockSavedObjectClient,
            {
              kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name:endpoint`,
              spaceIds: ['default'],
            }
          );

          const expectedFilters = [
            {
              bool: {
                must_not: {
                  terms: {
                    'agent.id': [
                      '00000000-0000-0000-0000-000000000000',
                      '11111111-1111-1111-1111-111111111111',
                    ],
                  },
                },
                filter: [
                  { exists: { field: 'united.endpoint.agent.id' } },
                  { exists: { field: 'united.agent.agent.id' } },
                  {
                    term: {
                      'united.agent.active': {
                        value: true,
                      },
                    },
                  },
                  {
                    terms: {
                      'united.agent.policy_id': [],
                    },
                  },
                ],
              },
            },
          ];

          expect(termsAggSuggestionsMock).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            expect.any(Object),
            METADATA_UNITED_INDEX,
            fieldName,
            'test-query',
            expectedFilters,
            'test-field-meta',
            expect.any(Object)
          );

          expect(mockResponse.ok).toHaveBeenCalled();
        });

        it('should handle fleet service errors gracefully when space awareness is enabled', async () => {
          mockFleetServices.packagePolicy.fetchAllItems.mockRejectedValue(
            new Error('Fleet service error')
          );

          const mockContext = requestContextMock.convertContext(
            createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
          );

          mockContext.securitySolution = mockSecuritySolutionContext;

          const mockRequest = httpServerMock.createKibanaRequest<
            TypeOf<typeof EndpointSuggestionsSchema.params>,
            never,
            never
          >({
            params: { suggestion_type: 'endpoints' },
            body: {
              field: 'united.agent.policy_id',
              query: 'test-query',
              filters: [],
              fieldMeta: 'test-field-meta',
            },
          });

          await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

          expect(mockResponse.customError).toHaveBeenCalledWith({
            statusCode: 500,
            body: expect.objectContaining({
              message: expect.stringContaining('Fleet service error'),
            }),
          });
        });

        it('should work with different space IDs when space awareness is enabled', async () => {
          const customSpaceId = 'custom-space-123';
          mockSecuritySolutionContext.getSpaceId.mockReturnValue(customSpaceId);

          const mockPackagePolicies = [{ policy_ids: ['space-policy-1'] }];
          const mockAsyncIterable = {
            async *[Symbol.asyncIterator]() {
              yield mockPackagePolicies;
            },
          };
          mockFleetServices.packagePolicy.fetchAllItems.mockResolvedValue(mockAsyncIterable);

          const mockContext = requestContextMock.convertContext(
            createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
          );

          mockContext.securitySolution = mockSecuritySolutionContext;

          const fieldName = 'united.agent.policy_id';
          const mockRequest = httpServerMock.createKibanaRequest<
            TypeOf<typeof EndpointSuggestionsSchema.params>,
            never,
            never
          >({
            params: { suggestion_type: 'endpoints' },
            body: {
              field: fieldName,
              query: 'custom-query',
              filters: [{ range: { '@timestamp': { gte: 'now-1d' } } }],
              fieldMeta: 'custom-field-meta',
            },
          });

          await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

          expect(mockFleetServices.packagePolicy.fetchAllItems).toHaveBeenCalledWith(
            mockSavedObjectClient,
            {
              kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name:endpoint`,
              spaceIds: [customSpaceId],
            }
          );

          const expectedFilters = [
            { range: { '@timestamp': { gte: 'now-1d' } } },
            {
              bool: {
                must_not: {
                  terms: {
                    'agent.id': [
                      '00000000-0000-0000-0000-000000000000',
                      '11111111-1111-1111-1111-111111111111',
                    ],
                  },
                },
                filter: [
                  { exists: { field: 'united.endpoint.agent.id' } },
                  { exists: { field: 'united.agent.agent.id' } },
                  {
                    term: {
                      'united.agent.active': {
                        value: true,
                      },
                    },
                  },
                  {
                    terms: {
                      'united.agent.policy_id': ['space-policy-1'],
                    },
                  },
                ],
              },
            },
          ];

          expect(termsAggSuggestionsMock).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            expect.any(Object),
            METADATA_UNITED_INDEX,
            fieldName,
            'custom-query',
            expectedFilters,
            'custom-field-meta',
            expect.any(Object)
          );

          expect(mockResponse.ok).toHaveBeenCalled();
        });
      });
    });

    describe('when suggestion_type is trustedDevices', () => {
      beforeEach(() => {
        mockEndpointContext.experimentalFeatures = {
          ...mockEndpointContext.experimentalFeatures,
        };
        suggestionsRouteHandler = getEndpointSuggestionsRequestHandler(
          config$,
          mockEndpointContext
        );
      });

      it('should use space-aware device events index pattern', async () => {
        const spaceId = 'custom-space';
        const mockIntegrationNamespaces = { endpoint: ['custom-namespace'] };
        const mockIndexPattern = 'logs-endpoint.events.device-*-custom-namespace';

        applyActionsEsSearchMock(mockScopedEsClient.asInternalUser);

        const mockContext = requestContextMock.convertContext(
          createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
        );

        ((await mockContext.securitySolution).getSpaceId as jest.Mock).mockReturnValue(spaceId);

        const mockFleetServices = {
          getIntegrationNamespaces: jest.fn().mockResolvedValue(mockIntegrationNamespaces),
        };
        mockEndpointContext.service.getInternalFleetServices = jest
          .fn()
          .mockReturnValue(mockFleetServices);

        buildIndexNameWithNamespaceMock.mockReturnValue(mockIndexPattern);

        const fieldName = 'device.manufacturer';
        const mockRequest = httpServerMock.createKibanaRequest<
          TypeOf<typeof EndpointSuggestionsSchema.params>,
          never,
          never
        >({
          params: { suggestion_type: 'trustedDevices' },
          body: {
            field: fieldName,
            query: 'test-query',
            filters: [{ term: { 'test.field': 'test-value' } }],
            fieldMeta: 'test-field-meta',
          },
        });

        await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

        expect((await mockContext.securitySolution).getSpaceId as jest.Mock).toHaveBeenCalled();
        expect(mockEndpointContext.service.getInternalFleetServices).toHaveBeenCalledWith(spaceId);
        expect(mockFleetServices.getIntegrationNamespaces).toHaveBeenCalledWith(['endpoint']);
        expect(buildIndexNameWithNamespaceMock).toHaveBeenCalledWith(
          DEVICE_EVENTS_INDEX_PATTERN,
          'custom-namespace',
          { preserveWildcard: true }
        );
        expect(termsEnumSuggestionsMock).toHaveBeenNthCalledWith(
          1,
          expect.any(Object),
          expect.any(Object),
          mockScopedEsClient.asInternalUser,
          mockIndexPattern,
          fieldName,
          'test-query',
          [{ term: { 'test.field': 'test-value' } }],
          'test-field-meta',
          expect.any(Object)
        );

        expect(mockResponse.ok).toHaveBeenCalled();
      });
    });

    describe('when suggestion_type is endpointExceptions', () => {
      beforeEach(() => {
        mockEndpointContext.experimentalFeatures = {
          ...mockEndpointContext.experimentalFeatures,
          endpointExceptionsMovedUnderManagement: true,
        };
        suggestionsRouteHandler = getEndpointSuggestionsRequestHandler(
          config$,
          mockEndpointContext
        );
      });

      it('should use space-aware alerts index pattern for endpoint exceptions, through current user es client', async () => {
        const spaceId = 'custom-space';
        const mockIntegrationNamespaces = { endpoint: ['custom-namespace'] };
        const mockIndexPattern = 'logs-endpoint.alerts.*-custom-namespace';

        const mockContext = requestContextMock.convertContext(
          createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
        );

        ((await mockContext.securitySolution).getSpaceId as jest.Mock).mockReturnValue(spaceId);

        const mockFleetServices = {
          getIntegrationNamespaces: jest.fn().mockResolvedValue(mockIntegrationNamespaces),
        };
        mockEndpointContext.service.getInternalFleetServices = jest
          .fn()
          .mockReturnValue(mockFleetServices);

        buildIndexNameWithNamespaceMock.mockReturnValue(mockIndexPattern);

        const fieldName = 'process.id';
        const mockRequest = httpServerMock.createKibanaRequest<
          TypeOf<typeof EndpointSuggestionsSchema.params>,
          never,
          never
        >({
          params: { suggestion_type: 'endpointExceptions' },
          body: {
            field: fieldName,
            query: 'test-query',
            filters: [{ term: { 'test.field': 'test-value' } }],
            fieldMeta: 'test-field-meta',
          },
        });

        await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

        expect((await mockContext.securitySolution).getSpaceId as jest.Mock).toHaveBeenCalled();
        expect(mockEndpointContext.service.getInternalFleetServices).toHaveBeenCalledWith(spaceId);
        expect(mockFleetServices.getIntegrationNamespaces).toHaveBeenCalledWith(['endpoint']);
        expect(buildIndexNameWithNamespaceMock).toHaveBeenCalledWith(
          alertsIndexPattern,
          'custom-namespace',
          { preserveWildcard: true }
        );
        expect(termsEnumSuggestionsMock).toHaveBeenNthCalledWith(
          1,
          expect.any(Object),
          expect.any(Object),
          mockScopedEsClient.asCurrentUser, // called with current user esClient
          mockIndexPattern,
          fieldName,
          'test-query',
          [{ term: { 'test.field': 'test-value' } }],
          'test-field-meta',
          expect.any(Object)
        );

        expect(mockResponse.ok).toHaveBeenCalled();
      });

      it('should return bad request when space-aware index pattern retrieval fails for endpoint exceptions', async () => {
        const spaceId = 'custom-space';
        const mockIntegrationNamespaces = { endpoint: [] };

        const mockContext = requestContextMock.convertContext(
          createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
        );

        ((await mockContext.securitySolution).getSpaceId as jest.Mock).mockReturnValue(spaceId);

        const mockFleetServices = {
          getIntegrationNamespaces: jest.fn().mockResolvedValue(mockIntegrationNamespaces),
        };
        mockEndpointContext.service.getInternalFleetServices = jest
          .fn()
          .mockReturnValue(mockFleetServices);

        // Mock the buildIndexNameWithNamespace function to return null (indicating failure)
        buildIndexNameWithNamespaceMock.mockReturnValue(null as unknown as string);

        const mockRequest = httpServerMock.createKibanaRequest<
          TypeOf<typeof EndpointSuggestionsSchema.params>,
          never,
          never
        >({
          params: { suggestion_type: 'endpointExceptions' },
          body: {
            field: 'process.executable',
            query: 'test-query',
            filters: [{ term: { 'test.field': 'test-value' } }],
            fieldMeta: 'test-field-meta',
          },
        });

        await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

        expect((await mockContext.securitySolution).getSpaceId as jest.Mock).toHaveBeenCalled();
        expect(mockEndpointContext.service.getInternalFleetServices).toHaveBeenCalledWith(spaceId);
        expect(mockFleetServices.getIntegrationNamespaces).toHaveBeenCalledWith(['endpoint']);
        expect(buildIndexNameWithNamespaceMock).not.toHaveBeenCalled();
        expect(mockResponse.badRequest).toHaveBeenCalledWith({
          body: 'Failed to retrieve current space index patterns',
        });
      });

      it('should handle errors during space-aware processing for endpoint exceptions gracefully', async () => {
        const spaceId = 'custom-space';
        const mockIntegrationNamespaces = { endpoint: ['custom-namespace'] };
        const mockIndexPattern = 'logs-endpoint.alerts.*-custom-namespace';

        const mockContext = requestContextMock.convertContext(
          createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
        );

        ((await mockContext.securitySolution).getSpaceId as jest.Mock).mockReturnValue(spaceId);

        const mockFleetServices = {
          getIntegrationNamespaces: jest.fn().mockResolvedValue(mockIntegrationNamespaces),
        };
        mockEndpointContext.service.getInternalFleetServices = jest
          .fn()
          .mockReturnValue(mockFleetServices);

        buildIndexNameWithNamespaceMock.mockReturnValue(mockIndexPattern);

        termsEnumSuggestionsMock.mockRejectedValue(new Error('Search service error'));

        const mockRequest = httpServerMock.createKibanaRequest<
          TypeOf<typeof EndpointSuggestionsSchema.params>,
          never,
          never
        >({
          params: { suggestion_type: 'endpointExceptions' },
          body: {
            field: 'process.executable',
            query: 'test-query',
            filters: [{ term: { 'test.field': 'test-value' } }],
            fieldMeta: 'test-field-meta',
          },
        });

        await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

        expect(mockEndpointContext.service.getInternalFleetServices).toHaveBeenCalledWith(spaceId);
        expect(mockFleetServices.getIntegrationNamespaces).toHaveBeenCalledWith(['endpoint']);
        expect(buildIndexNameWithNamespaceMock).toHaveBeenCalledWith(
          alertsIndexPattern,
          'custom-namespace',
          { preserveWildcard: true }
        );
        expect(mockResponse.customError).toHaveBeenCalledWith({
          statusCode: 500,
          body: expect.objectContaining({
            message: expect.stringContaining('Search service error'),
          }),
        });
      });
    });

    describe('when CCS is enabled', () => {
      beforeEach(() => {
        (
          mockEndpointContext.experimentalFeatures as DeepMutable<ExperimentalFeatures>
        ).defendRemoteOutputCcs = true;
        (
          mockScopedEsClient.asInternalUser.cluster.remoteInfo as unknown as jest.Mock
        ).mockResolvedValue({
          cluster_a: { connected: true },
        });
        suggestionsRouteHandler = getEndpointSuggestionsRequestHandler(
          config$,
          mockEndpointContext
        );
      });

      it('should pass a CCS-prefixed index pattern to the suggestion method when remotes are connected', async () => {
        const spaceId = 'default';
        const mockIntegrationNamespaces = { endpoint: ['default'] };
        const mockIndexPattern = 'logs-endpoint.events.process-default';

        applyActionsEsSearchMock(mockScopedEsClient.asInternalUser);

        const mockContext = requestContextMock.convertContext(
          createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient)
        );

        ((await mockContext.securitySolution).getSpaceId as jest.Mock).mockReturnValue(spaceId);

        const mockFleetServices = {
          getIntegrationNamespaces: jest.fn().mockResolvedValue(mockIntegrationNamespaces),
        };
        mockEndpointContext.service.getInternalFleetServices = jest
          .fn()
          .mockReturnValue(mockFleetServices);

        buildIndexNameWithNamespaceMock.mockReturnValue(mockIndexPattern);

        const mockRequest = httpServerMock.createKibanaRequest<
          TypeOf<typeof EndpointSuggestionsSchema.params>,
          never,
          never
        >({
          params: { suggestion_type: 'eventFilters' },
          body: {
            field: 'process.id',
            query: 'test-query',
            filters: [],
            fieldMeta: 'test-field-meta',
          },
        });

        await suggestionsRouteHandler(mockContext, mockRequest, mockResponse);

        expect(termsEnumSuggestionsMock).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Object),
          mockScopedEsClient.asInternalUser,
          `${mockIndexPattern},*:${mockIndexPattern}`,
          'process.id',
          'test-query',
          [],
          'test-field-meta',
          expect.any(Object)
        );
        expect(mockResponse.ok).toHaveBeenCalled();
      });
    });

    describe('without having right privileges', () => {
      beforeEach(() => {
        const startContract = createMockEndpointAppContextServiceStartContract();
        const routerMock = httpServiceMock.createRouter();
        const endpointAppContextService = new EndpointAppContextService();
        // add the suggestions route handlers to routerMock
        registerEndpointSuggestionsRoutes(routerMock, config$, {
          ...createMockEndpointAppContext(),
          service: endpointAppContextService,
        });

        // define a convenience function to execute an API call for a given route
        callRoute = async (
          routePrefix: string,
          { params, authz = {} }: CallRouteInterface
        ): Promise<void> => {
          const superUser = {
            username: 'superuser',
            roles: ['superuser'],
          };
          (startContract.security.authc.getCurrentUser as jest.Mock).mockImplementationOnce(
            () => superUser
          );

          const ctx = createRouteHandlerContext(mockScopedEsClient, mockSavedObjectClient);

          ctx.securitySolution.getEndpointAuthz.mockResolvedValue(
            getEndpointAuthzInitialStateMock(authz)
          );

          const mockRequest = httpServerMock.createKibanaRequest({ params });
          const { routeHandler } = getRegisteredVersionedRouteMock(
            routerMock,
            'post',
            routePrefix,
            '1'
          );

          await routeHandler(ctx as unknown as RequestHandlerContext, mockRequest, mockResponse);
        };
      });

      it('should respond with forbidden for event filters', async () => {
        await callRoute(SUGGESTIONS_INTERNAL_ROUTE, {
          params: { suggestion_type: 'eventFilters' },
          authz: {
            canReadEventFilters: true,
            canWriteEventFilters: false,
            canReadTrustedApplications: true,
            canWriteTrustedApplications: false,
            canWriteTrustedDevices: false,
            canReadEndpointExceptions: true,
            canWriteEndpointExceptions: false,
          },
        });

        expect(mockResponse.forbidden).toBeCalled();
      });

      it('should respond with forbidden for trusted apps', async () => {
        await callRoute(SUGGESTIONS_INTERNAL_ROUTE, {
          params: { suggestion_type: 'trustedApps' },
          authz: {
            canReadEventFilters: true,
            canWriteEventFilters: false,
            canReadTrustedApplications: true,
            canWriteTrustedApplications: false,
            canWriteTrustedDevices: false,
            canReadEndpointExceptions: true,
            canWriteEndpointExceptions: false,
          },
        });

        expect(mockResponse.forbidden).toBeCalled();
      });

      it('should respond with forbidden for trusted devices', async () => {
        await callRoute(SUGGESTIONS_INTERNAL_ROUTE, {
          params: { suggestion_type: 'trustedDevices' },
          authz: {
            canReadEventFilters: true,
            canWriteEventFilters: false,
            canReadTrustedApplications: true,
            canWriteTrustedApplications: false,
            canReadTrustedDevices: true,
            canWriteTrustedDevices: false,
            canReadEndpointExceptions: true,
            canWriteEndpointExceptions: false,
          },
        });

        expect(mockResponse.forbidden).toBeCalled();
      });

      it('should respond with forbidden for endpoint exceptions', async () => {
        await callRoute(SUGGESTIONS_INTERNAL_ROUTE, {
          params: { suggestion_type: 'endpointExceptions' },
          authz: {
            canReadEventFilters: true,
            canWriteEventFilters: false,
            canReadTrustedApplications: true,
            canWriteTrustedApplications: false,
            canReadTrustedDevices: true,
            canWriteTrustedDevices: false,
            canReadEndpointExceptions: true,
            canWriteEndpointExceptions: false,
          },
        });

        expect(mockResponse.forbidden).toBeCalled();
      });
    });
  });
});
