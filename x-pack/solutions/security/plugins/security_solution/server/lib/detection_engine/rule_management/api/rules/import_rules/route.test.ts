/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getImportRulesSchemaMock } from '../../../../../../../common/api/detection_engine/rule_management/mocks';
import { SecurityRuleChangeTrackingAction } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import { validateRuleImportResponseActions } from '../../../../../../endpoint/services';
import { configMock, requestContextMock, serverMock } from '../../../../routes/__mocks__';
import {
  getImportRulesRequest,
  getImportRulesRequestOverwriteTrue,
} from '../../../../routes/__mocks__/request_responses';
import { buildHapiStream } from '../../../../routes/__mocks__/utils';
import { createPrebuiltRuleAssetsClient } from '../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { ensureLatestRulesPackageInstalled } from '../../../../prebuilt_rules/logic/integrations/ensure_latest_rules_package_installed';
import { importRuleActionConnectors } from '../../../logic/import/action_connectors/import_rule_action_connectors';
import { validateRuleActions } from '../../../logic/import/action_connectors/validate_rule_actions';
import { createPromiseFromRuleImportStream } from '../../../logic/import/create_promise_from_rule_import_stream';
import { importRuleExceptions } from '../../../logic/import/import_rule_exceptions';
import { importRules } from '../../../logic/import/import_rules';
import {
  getTupleDuplicateErrorsAndUniqueRules,
  migrateLegacyActionsIds,
} from '../../../utils/utils';
import { importRulesRoute } from './route';

jest.mock('../../../../../../endpoint/services', () => ({
  validateRuleImportResponseActions: jest.fn(),
}));
jest.mock('../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client', () => ({
  createPrebuiltRuleAssetsClient: jest.fn(() => 'assets-client'),
}));
jest.mock('../../../../prebuilt_rules/logic/integrations/ensure_latest_rules_package_installed');
jest.mock('../../../logic/import/action_connectors/import_rule_action_connectors');
jest.mock('../../../logic/import/action_connectors/validate_rule_actions');
jest.mock('../../../logic/import/create_promise_from_rule_import_stream');
jest.mock('../../../logic/import/import_rule_exceptions');
jest.mock('../../../logic/import/import_rules');
jest.mock('../../../utils/utils');

const stream = createPromiseFromRuleImportStream as jest.MockedFunction<
  typeof createPromiseFromRuleImportStream
>;
const exceptions = importRuleExceptions as jest.MockedFunction<typeof importRuleExceptions>;
const connectors = importRuleActionConnectors as jest.MockedFunction<
  typeof importRuleActionConnectors
>;
const dedupe = getTupleDuplicateErrorsAndUniqueRules as jest.MockedFunction<
  typeof getTupleDuplicateErrorsAndUniqueRules
>;
const migrate = migrateLegacyActionsIds as jest.MockedFunction<typeof migrateLegacyActionsIds>;
const packageInstall = ensureLatestRulesPackageInstalled as jest.MockedFunction<
  typeof ensureLatestRulesPackageInstalled
>;
const actions = validateRuleActions as jest.MockedFunction<typeof validateRuleActions>;
const responseActions = validateRuleImportResponseActions as jest.MockedFunction<
  typeof validateRuleImportResponseActions
>;
const importBatch = importRules as jest.MockedFunction<typeof importRules>;

const emptyConnectors = {
  successCount: 0,
  success: true,
  warnings: [],
  errors: [],
};
const emptyExceptions = {
  errors: [],
  successCount: 0,
  success: true,
};

describe('Import rules route', () => {
  const rule = getImportRulesSchemaMock();
  let config: ReturnType<typeof configMock.createDefault>;
  let server: ReturnType<typeof serverMock.create>;
  let clients: ReturnType<typeof requestContextMock.createTools>['clients'];
  let context: ReturnType<typeof requestContextMock.createTools>['context'];

  const inject = (request = getImportRulesRequest(buildHapiStream(''))) =>
    server.inject(request, requestContextMock.convertContext(context));

  beforeEach(() => {
    jest.clearAllMocks();
    server = serverMock.create();
    ({ clients, context } = requestContextMock.createTools());
    config = configMock.createDefault();

    context.securitySolution.getEndpointService.mockReturnValue({} as never);

    stream.mockResolvedValue([{ exceptions: [], rules: [rule], actionConnectors: [] }]);
    exceptions.mockResolvedValue(emptyExceptions);
    connectors.mockResolvedValue(emptyConnectors);
    dedupe.mockReturnValue([[], [rule]]);
    migrate.mockResolvedValue([rule]);
    packageInstall.mockResolvedValue(undefined);
    actions.mockResolvedValue({ validatedActionRules: [rule], missingActionErrors: [] });
    responseActions.mockResolvedValue({ valid: [rule], errors: [] });
    importBatch.mockResolvedValue({ successes: [{ rule_id: rule.rule_id }], errors: [] });

    importRulesRoute(server.router, config, clients.logger);
  });

  it('returns 400 when the file is not ndjson', async () => {
    const response = await inject(getImportRulesRequest(buildHapiStream('', 'wrong.html')));

    expect(response.status).toEqual(400);
    expect(response.body).toEqual({ message: 'Invalid file extension .html', status_code: 400 });
    expect(importBatch).not.toHaveBeenCalled();
  });

  it('returns 500 when a collaborator throws', async () => {
    stream.mockRejectedValue(new Error('parse failed'));

    const response = await inject();

    expect(response.status).toEqual(500);
    expect(response.body).toEqual({ message: 'parse failed', status_code: 500 });
  });

  it('installs the prebuilt package and forwards import options', async () => {
    const response = await inject(getImportRulesRequestOverwriteTrue(buildHapiStream('')));

    expect(response.status).toEqual(200);
    expect(createPrebuiltRuleAssetsClient).toHaveBeenCalled();
    expect(packageInstall).toHaveBeenCalledWith(
      'assets-client',
      context.securitySolution,
      clients.logger
    );
    expect(importBatch).toHaveBeenCalledWith({
      rules: [rule],
      changeTracking: {
        action: SecurityRuleChangeTrackingAction.ruleImport,
        metadata: { bulkCount: 1 },
      },
      overwriteRules: true,
      allowMissingConnectorSecrets: false,
      detectionRulesClient: clients.detectionRulesClient,
    });
    expect(response.body).toEqual({
      success: true,
      success_count: 1,
      rules_count: 1,
      errors: [],
      exceptions_errors: [],
      exceptions_success: true,
      exceptions_success_count: 0,
      action_connectors_success: true,
      action_connectors_success_count: 0,
      action_connectors_errors: [],
      action_connectors_warnings: [],
    });
  });

  it('sets allowMissingConnectorSecrets when connectors were in the file', async () => {
    stream.mockResolvedValue([
      { exceptions: [], rules: [rule], actionConnectors: [{ id: 'connector-1' } as never] },
    ]);

    await inject();

    expect(importBatch).toHaveBeenCalledWith(
      expect.objectContaining({ allowMissingConnectorSecrets: true })
    );
  });

  it('concatenates parse, duplicate, import, and action errors', async () => {
    migrate.mockResolvedValue([new Error('bad json'), rule]);
    dedupe.mockReturnValue([
      [{ rule_id: 'rule-1', error: { status_code: 400, message: 'duplicate' } }],
      [rule],
    ]);
    actions.mockResolvedValue({
      validatedActionRules: [rule],
      missingActionErrors: [
        { rule_id: 'rule-1', error: { status_code: 400, message: 'missing action' } },
      ],
    });
    responseActions.mockResolvedValue({
      valid: [rule],
      errors: [{ rule_id: 'rule-1', error: { status_code: 400, message: 'bad response action' } }],
    });
    importBatch.mockResolvedValue({
      successes: [],
      errors: [{ rule_id: 'rule-1', error: { status_code: 400, message: 'import failed' } }],
    });

    const response = await inject();

    expect(response.status).toEqual(200);
    expect(response.body.success).toEqual(false);
    expect(response.body.success_count).toEqual(0);
    expect(response.body.errors).toEqual([
      { error: { status_code: 400, message: 'bad json' } },
      { rule_id: 'rule-1', error: { status_code: 400, message: 'duplicate' } },
      { rule_id: 'rule-1', error: { status_code: 400, message: 'import failed' } },
      { rule_id: 'rule-1', error: { status_code: 400, message: 'missing action' } },
      { rule_id: 'rule-1', error: { status_code: 400, message: 'bad response action' } },
    ]);
  });
});
