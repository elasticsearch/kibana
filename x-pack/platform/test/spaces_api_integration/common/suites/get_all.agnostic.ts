/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type {
  DeploymentAgnosticFtrProviderContext,
  SupertestWithRoleScopeType,
} from '../../deployment_agnostic/ftr_provider_context';
import { getTestScenariosForSpace } from '../lib/space_test_utils';
import type { DescribeFn, TestDefinitionAuthentication } from '../lib/types';

interface GetAllTest {
  statusCode: number;
  response: (resp: { [key: string]: any }) => void;
}

interface GetAllTests {
  exists: GetAllTest;
  copySavedObjectsPurpose: GetAllTest;
  shareSavedObjectsPurpose: GetAllTest;
  includeAuthorizedPurposes: GetAllTest;
}

interface GetAllTestDefinition {
  user?: TestDefinitionAuthentication;
  spaceId: string;
  tests: GetAllTests;
}

interface AuthorizedPurposes {
  any: boolean;
  copySavedObjectsIntoSpace: boolean;
  findSavedObjects: boolean;
  shareSavedObjectsIntoSpace: boolean;
}

interface Space {
  id: string;
  name: string;
  color?: string;
  description: string;
  solution?: string;
  _reserved?: boolean;
  disabledFeatures: string[];
}

const ALL_SPACE_RESULTS: Space[] = [
  {
    id: 'default',
    name: 'Default',
    color: '#00bfb3',
    description: 'This is your default space!',
    disabledFeatures: [],
    _reserved: true,
  },
  {
    id: 'space_1',
    name: 'Space 1',
    description: 'This is the first test space',
    disabledFeatures: [],
  },
  {
    id: 'space_2',
    name: 'Space 2',
    description: 'This is the second test space',
    disabledFeatures: [],
  },
  {
    id: 'space_3',
    name: 'Space 3',
    description: 'This is the third test space',
    disabledFeatures: [
      // Disabled features are automatically added to the space when a solution is set
      'apm',
      'infrastructure',
      'logs',
      'observabilityAlerts',
      'observabilityCasesV3',
      'securitySolutionAlertsV1',
      'securitySolutionAssistant',
      'securitySolutionAttackDiscovery',
      'securitySolutionCasesV3',
      'securitySolutionNotes',
      'securitySolutionRulesV4',
      'securitySolutionSiemMigrations',
      'securitySolutionTimeline',
      'siemV5',
      'slo',
      'uptime',
    ],
    solution: 'es',
  },
];

export function getAllTestSuiteFactory(context: DeploymentAgnosticFtrProviderContext) {
  const config = context.getService('config');
  const isServerless = config.get('serverless');
  const kbnClient = context.getService('kibanaServer');

  const loadSavedObjects = async () => {
    for (const space of ['default', 'space_1', 'space_2', 'space_3', 'other_space']) {
      await kbnClient.importExport.load(
        `x-pack/platform/test/spaces_api_integration/common/fixtures/kbn_archiver/${space}_objects.json`,
        { space }
      );
    }
  };

  const unloadSavedObjects = async () => {
    for (const space of ['default', 'space_1', 'space_2', 'space_3', 'other_space']) {
      await kbnClient.importExport.unload(
        `x-pack/platform/test/spaces_api_integration/common/fixtures/kbn_archiver/${space}_objects.json`,
        { space }
      );
    }
  };

  const maybeNormalizeSpace = (space: Space) => {
    if (isServerless && space.solution) {
      const { id, name, description } = space;

      return { id, name, description, disabledFeatures: [] };
    }
    return space;
  };

  const createExpectResults =
    (...spaceIds: string[]) =>
    (resp: { [key: string]: any }) => {
      const expectedBody = ALL_SPACE_RESULTS.filter((entry) => spaceIds.includes(entry.id)).map(
        maybeNormalizeSpace
      );

      for (const space of resp.body) {
        const expectedSpace = expectedBody.find((x) => x.id === space.id);
        expect(space.name).to.eql(expectedSpace?.name);
        expect(space.description).to.eql(expectedSpace?.description);
        expect(space.color).to.eql(expectedSpace?.color);
        expect(space.solution).to.eql(expectedSpace?.solution);
        expect(space.disabledFeatures.sort()).to.eql(expectedSpace?.disabledFeatures.sort());
      }
    };

  const createExpectAllPurposesResults =
    (authorizedPurposes: AuthorizedPurposes, ...spaceIds: string[]) =>
    (resp: { [key: string]: any }) => {
      const expectedBody = ALL_SPACE_RESULTS.filter((entry) => spaceIds.includes(entry.id)).map(
        (entry) => {
          const space = maybeNormalizeSpace(entry);

          return { ...space, authorizedPurposes };
        }
      );

      for (const space of resp.body) {
        const expectedSpace = expectedBody.find((x) => x.id === space.id);
        expect(space.name).to.eql(expectedSpace?.name);
        expect(space.description).to.eql(expectedSpace?.description);
        expect(space.color).to.eql(expectedSpace?.color);
        expect(space.solution).to.eql(expectedSpace?.solution);
        expect(space.disabledFeatures.sort()).to.eql(expectedSpace?.disabledFeatures.sort());
        expect(space.authorizedPurposes).to.eql(expectedSpace?.authorizedPurposes);
      }
    };

  const expectEmptyResult = (resp: { [key: string]: any }) => {
    expect(resp.body).to.eql('');
  };

  const expectRbacForbidden = (resp: { [key: string]: any }) => {
    expect(resp.body).to.eql({
      error: 'Forbidden',
      message: 'Forbidden',
      statusCode: 403,
    });
  };

  const makeGetAllTest =
    (describeFn: DescribeFn) =>
    (description: string, { user, spaceId, tests }: GetAllTestDefinition) => {
      describeFn(description, () => {
        const spacesSupertest = context.getService('spacesSupertest');
        let supertest: SupertestWithRoleScopeType;

        before(async () => {
          supertest = await spacesSupertest.getSupertestWithRoleScope(user!);
          await loadSavedObjects();
        });

        after(async () => {
          await unloadSavedObjects();
          await supertest.destroy();
        });

        getTestScenariosForSpace(spaceId).forEach(({ scenario, urlPrefix }) => {
          describe('undefined purpose', () => {
            it(`should return ${tests.exists.statusCode} ${scenario}`, async () => {
              return supertest
                .get(`${urlPrefix}/api/spaces/space`)
                .expect(tests.exists.statusCode)
                .then(tests.exists.response);
            });
          });

          describe('copySavedObjectsIntoSpace purpose', () => {
            it(`should return ${tests.copySavedObjectsPurpose.statusCode} ${scenario}`, async () => {
              return supertest
                .get(`${urlPrefix}/api/spaces/space`)
                .query({ purpose: 'copySavedObjectsIntoSpace' })
                .expect(tests.copySavedObjectsPurpose.statusCode)
                .then(tests.copySavedObjectsPurpose.response);
            });
          });

          describe('shareSavedObjectsIntoSpace purpose', () => {
            it(`should return ${tests.shareSavedObjectsPurpose.statusCode} ${scenario}`, async () => {
              return supertest
                .get(`${urlPrefix}/api/spaces/space`)
                .query({ purpose: 'shareSavedObjectsIntoSpace' })
                .expect(tests.copySavedObjectsPurpose.statusCode)
                .then(tests.copySavedObjectsPurpose.response);
            });
          });

          describe('include_authorized_purposes=true', () => {
            it(`should return ${tests.includeAuthorizedPurposes.statusCode} ${scenario}`, async () => {
              return supertest
                .get(`${urlPrefix}/api/spaces/space`)
                .query({ include_authorized_purposes: true })
                .expect(tests.includeAuthorizedPurposes.statusCode)
                .then(tests.includeAuthorizedPurposes.response);
            });
          });
        });
      });
    };

  const getAllTest = makeGetAllTest(describe);
  // @ts-ignore
  getAllTest.only = makeGetAllTest(describe.only);

  return {
    createExpectResults,
    createExpectAllPurposesResults,
    expectRbacForbidden,
    getAllTest,
    expectEmptyResult,
  };
}
