/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import type { DetectionRulesAuthz } from '../../../../../common/detection_engine/rule_management/authz';
import { getQueryRuleParams } from '../../rule_schema/model/rule_schemas.mock';
import type { RuleParams } from '../../rule_schema';
import { createSecurityRuleParamsAuthorizer } from './authorize_rule_response_actions';

// Authorization of the read-auth-editable rule params (exception lists, investigation
// guide, investigation fields) through the generic Alerting write paths. Response
// action authorization lives in authorize_rule_response_actions.test.ts.

const allowAllRulesAuthz: DetectionRulesAuthz = {
  canReadRules: true,
  canEditRules: true,
  canReadExceptions: true,
  canEditExceptions: true,
  canEnableDisableRules: true,
  canManualRunRules: true,
  canEditCustomHighlightedFields: true,
  canEditInvestigationGuides: true,
  canAccessRulesManagementSettings: true,
};

const buildParams = (overrides: Record<string, unknown> = {}): RuleParams =>
  ({ ...getQueryRuleParams(), ...overrides } as unknown as RuleParams);

const exceptionListItem = () => ({
  id: 'exc-1',
  list_id: 'list-1',
  type: 'detection',
  namespace_type: 'single',
});
const exceptionListItemModified = () => ({
  id: 'exc-2',
  list_id: 'list-2',
  type: 'detection',
  namespace_type: 'single',
});

interface FieldFixture {
  title: string;
  // Rule params key (camelCase) the authorizer reads.
  key: string;
  // Capability that authorizes editing the field.
  capability: keyof DetectionRulesAuthz;
  // Field name expected in the 403 message (snake_case).
  errorField: string;
  value: unknown;
  modified: unknown;
  // The "no value" state: `[]` for exception lists, `undefined` for the others.
  empty: unknown;
}

const FIELDS: FieldFixture[] = [
  {
    title: 'exception lists',
    key: 'exceptionsList',
    capability: 'canEditExceptions',
    errorField: 'exceptions_list',
    value: [exceptionListItem()],
    modified: [exceptionListItemModified()],
    empty: [],
  },
  {
    title: 'the investigation guide (note)',
    key: 'note',
    capability: 'canEditInvestigationGuides',
    errorField: 'note',
    value: 'investigate me',
    modified: 'investigate me differently',
    empty: undefined,
  },
  {
    title: 'investigation fields',
    key: 'investigationFields',
    capability: 'canEditCustomHighlightedFields',
    errorField: 'investigation_fields',
    value: { field_names: ['host.name'] },
    modified: { field_names: ['user.name'] },
    empty: undefined,
  },
];

describe('createSecurityRuleParamsAuthorizer read-auth editable params', () => {
  let endpointAppContextService: ReturnType<typeof createMockEndpointAppContextService>;
  const request = httpServerMock.createKibanaRequest();
  const getRulesAuthz = jest.fn<Promise<DetectionRulesAuthz>, [unknown]>();

  const buildAuthorizer = () =>
    createSecurityRuleParamsAuthorizer({ endpointAppContextService, getRulesAuthz });

  beforeEach(() => {
    endpointAppContextService = createMockEndpointAppContextService();
    getRulesAuthz.mockReset();
    getRulesAuthz.mockResolvedValue(allowAllRulesAuthz);
  });

  const withoutCapability = (capability: keyof DetectionRulesAuthz) => {
    getRulesAuthz.mockResolvedValue({ ...allowAllRulesAuthz, [capability]: false });
  };

  const authorizeUpdate = (next: Record<string, unknown>, previous: Record<string, unknown>) =>
    buildAuthorizer().authorize(buildParams(next), {
      request,
      previousParams: buildParams(previous),
    });

  const authorizeCreate = (next: Record<string, unknown>) =>
    buildAuthorizer().authorize(buildParams(next), { request });

  const expectForbidden = async (promise: Promise<unknown>, errorField: string) => {
    const error = (await promise.catch((e) => e)) as Boom.Boom;
    expect(Boom.isBoom(error)).toBe(true);
    expect(error.output.statusCode).toBe(403);
    expect(error.message).toContain(errorField);
  };

  for (const f of FIELDS) {
    describe(f.title, () => {
      it('allows attaching with the sub-feature privilege', async () => {
        await expect(
          authorizeUpdate({ [f.key]: f.value }, { [f.key]: f.empty })
        ).resolves.toBeUndefined();
      });

      it('rejects attaching without the sub-feature privilege', async () => {
        withoutCapability(f.capability);
        await expectForbidden(
          authorizeUpdate({ [f.key]: f.value }, { [f.key]: f.empty }),
          f.errorField
        );
      });

      it('allows modifying with the sub-feature privilege', async () => {
        await expect(
          authorizeUpdate({ [f.key]: f.modified }, { [f.key]: f.value })
        ).resolves.toBeUndefined();
      });

      it('rejects modifying without the sub-feature privilege', async () => {
        withoutCapability(f.capability);
        await expectForbidden(
          authorizeUpdate({ [f.key]: f.modified }, { [f.key]: f.value }),
          f.errorField
        );
      });

      it('allows removing with the sub-feature privilege', async () => {
        await expect(
          authorizeUpdate({ [f.key]: f.empty }, { [f.key]: f.value })
        ).resolves.toBeUndefined();
      });

      it('rejects removing without the sub-feature privilege', async () => {
        // Unsetting a value (clearing to `[]`, or omitting a note/investigation
        // fields on a PUT) is a privileged edit too, not just setting or replacing.
        withoutCapability(f.capability);
        await expectForbidden(
          authorizeUpdate({ [f.key]: f.empty }, { [f.key]: f.value }),
          f.errorField
        );
      });

      it('does not require the sub-feature privilege when the field is unchanged', async () => {
        withoutCapability(f.capability);
        await expect(
          authorizeUpdate({ [f.key]: f.value, name: 'renamed' }, { [f.key]: f.value })
        ).resolves.toBeUndefined();
      });

      it('does not gate the create path (no previous params)', async () => {
        // Create is not gated, matching the DE routes and allowing import/duplication.
        withoutCapability(f.capability);
        await expect(authorizeCreate({ [f.key]: f.value })).resolves.toBeUndefined();
      });
    });
  }

  it('throws a 403 listing every changed field the user is not privileged to edit', async () => {
    getRulesAuthz.mockResolvedValue({
      ...allowAllRulesAuthz,
      canEditExceptions: false,
      canEditInvestigationGuides: false,
      canEditCustomHighlightedFields: false,
    });

    const error = await authorizeUpdate(
      {
        exceptionsList: [exceptionListItem()],
        note: 'changed guide',
        investigationFields: { field_names: ['host.name'] },
      },
      {
        exceptionsList: [],
        note: 'original',
        investigationFields: undefined,
      }
    ).catch((e) => e);

    expect(Boom.isBoom(error)).toBe(true);
    expect(error.output.statusCode).toBe(403);
    expect(error.message).toContain('exceptions_list');
    expect(error.message).toContain('note');
    expect(error.message).toContain('investigation_fields');
  });
});
