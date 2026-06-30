/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import type { ILicense, LicenseType } from '@kbn/licensing-types';
import type { LicensingPluginSetup } from '@kbn/licensing-plugin/server';
import { allowedExperimentalValues } from '../../../../../common/experimental_features';
import type { ExperimentalFeatures } from '../../../../../common/experimental_features';
import { createNewTermsAlertType } from './create_new_terms_alert_type';
import { executeNewTermsEsqlApproach } from './execute_new_terms_esql_approach';
import { executeNewTermsAggregationApproach } from './execute_new_terms_aggregation_approach';

jest.mock('./execute_new_terms_esql_approach', () => ({
  executeNewTermsEsqlApproach: jest.fn().mockResolvedValue({ test: 'esql' }),
}));

jest.mock('./execute_new_terms_aggregation_approach', () => ({
  executeNewTermsAggregationApproach: jest.fn().mockResolvedValue({ test: 'aggregation' }),
}));

const esqlMock = executeNewTermsEsqlApproach as jest.MockedFunction<
  typeof executeNewTermsEsqlApproach
>;
const aggregationMock = executeNewTermsAggregationApproach as jest.MockedFunction<
  typeof executeNewTermsAggregationApproach
>;

const createLicensingMock = (hasAtLeastFn: ILicense['hasAtLeast']): LicensingPluginSetup =>
  ({
    license$: of({ hasAtLeast: hasAtLeastFn } as unknown as ILicense),
  } as unknown as LicensingPluginSetup);

const createExecOptions = ({
  inputIndex,
  experimentalFeatures,
  licensing,
  newTermsFields = ['user.name'],
  fieldCapsResponse = { fields: {} },
  runtimeMappings,
}: {
  inputIndex: string[];
  experimentalFeatures: ExperimentalFeatures;
  licensing: LicensingPluginSetup;
  newTermsFields?: string[];
  fieldCapsResponse?: Record<string, unknown>;
  runtimeMappings?: Record<string, unknown>;
}) =>
  ({
    sharedParams: {
      inputIndex,
      experimentalFeatures,
      licensing,
      runtimeMappings,
      ruleExecutionLogger: {
        debug: jest.fn(),
        warn: jest.fn(),
      },
    },
    params: {
      newTermsFields,
    },
    services: {
      scopedClusterClient: {
        asCurrentUser: {
          fieldCaps: jest.fn().mockResolvedValue(fieldCapsResponse),
        },
      },
    },
  } as unknown as Parameters<ReturnType<typeof createNewTermsAlertType>['executor']>[0]);

describe('createNewTermsAlertType executor approach selection', () => {
  const ruleType = createNewTermsAlertType();

  beforeEach(() => {
    esqlMock.mockClear();
    aggregationMock.mockClear();
  });

  describe('when newTermsEsqlApproachEnabled is true (default)', () => {
    const features: ExperimentalFeatures = {
      ...allowedExperimentalValues,
      newTermsEsqlApproachEnabled: true,
    };

    it('uses ES|QL approach for local-only indices on any license', async () => {
      const licensing = createLicensingMock(() => false);
      const execOptions = createExecOptions({
        inputIndex: ['logs-*', 'auditbeat-*'],
        experimentalFeatures: features,
        licensing,
      });

      await ruleType.executor(execOptions);

      expect(esqlMock).toHaveBeenCalledWith(execOptions);
      expect(aggregationMock).not.toHaveBeenCalled();
    });

    it('uses ES|QL approach for cross-cluster indices with enterprise license', async () => {
      const licensing = createLicensingMock((level: LicenseType) => level === 'enterprise');
      const execOptions = createExecOptions({
        inputIndex: ['logs-*', 'remote:logs-*'],
        experimentalFeatures: features,
        licensing,
      });

      await ruleType.executor(execOptions);

      expect(esqlMock).toHaveBeenCalledWith(execOptions);
      expect(aggregationMock).not.toHaveBeenCalled();
    });

    it('falls back to aggregation for cross-cluster indices without enterprise license', async () => {
      const licensing = createLicensingMock(() => false);
      const execOptions = createExecOptions({
        inputIndex: ['logs-*', 'remote:logs-*'],
        experimentalFeatures: features,
        licensing,
      });

      await ruleType.executor(execOptions);

      expect(aggregationMock).toHaveBeenCalledWith(execOptions);
      expect(esqlMock).not.toHaveBeenCalled();
    });

    it('falls back to aggregation when field_caps returns a flattened type', async () => {
      const licensing = createLicensingMock(() => false);
      const execOptions = createExecOptions({
        inputIndex: ['logs-*'],
        experimentalFeatures: features,
        licensing,
        newTermsFields: ['labels.env'],
        fieldCapsResponse: {
          fields: { labels: { flattened: { type: 'flattened', searchable: true } } },
        },
      });

      await ruleType.executor(execOptions);

      expect(aggregationMock).toHaveBeenCalledWith(execOptions);
      expect(esqlMock).not.toHaveBeenCalled();
    });

    it('falls back to aggregation when field_caps returns a nested type', async () => {
      const licensing = createLicensingMock(() => false);
      const execOptions = createExecOptions({
        inputIndex: ['logs-*'],
        experimentalFeatures: features,
        licensing,
        newTermsFields: ['nested_field'],
        fieldCapsResponse: {
          fields: { nested_field: { nested: { type: 'nested' } } },
        },
      });

      await ruleType.executor(execOptions);

      expect(aggregationMock).toHaveBeenCalledWith(execOptions);
      expect(esqlMock).not.toHaveBeenCalled();
    });

    it('falls back to aggregation when a new terms field is a data view runtime field', async () => {
      const licensing = createLicensingMock(() => false);
      const execOptions = createExecOptions({
        inputIndex: ['logs-*'],
        experimentalFeatures: features,
        licensing,
        newTermsFields: ['host_name_runtime'],
        runtimeMappings: {
          host_name_runtime: { type: 'keyword', script: { source: `emit('x')` } },
        },
      });

      await ruleType.executor(execOptions);

      expect(aggregationMock).toHaveBeenCalledWith(execOptions);
      expect(esqlMock).not.toHaveBeenCalled();
    });

    it('does not call field_caps when a new terms field is a data view runtime field', async () => {
      const licensing = createLicensingMock(() => false);
      const execOptions = createExecOptions({
        inputIndex: ['logs-*'],
        experimentalFeatures: features,
        licensing,
        newTermsFields: ['host_name_runtime'],
        runtimeMappings: {
          host_name_runtime: { type: 'keyword', script: { source: `emit('x')` } },
        },
      });

      await ruleType.executor(execOptions);

      const fieldCapsMock = execOptions.services.scopedClusterClient.asCurrentUser
        .fieldCaps as jest.Mock;
      expect(fieldCapsMock).not.toHaveBeenCalled();
    });

    it('falls back to aggregation when field_caps throws', async () => {
      const licensing = createLicensingMock(() => false);
      const execOptions = createExecOptions({
        inputIndex: ['logs-*'],
        experimentalFeatures: features,
        licensing,
      });

      const fieldCapsMock = execOptions.services.scopedClusterClient.asCurrentUser
        .fieldCaps as jest.Mock;
      fieldCapsMock.mockRejectedValueOnce(new Error('index_not_found'));

      await ruleType.executor(execOptions);

      expect(aggregationMock).toHaveBeenCalledWith(execOptions);
      expect(esqlMock).not.toHaveBeenCalled();
    });
  });

  describe('when newTermsEsqlApproachEnabled is false', () => {
    const features: ExperimentalFeatures = {
      ...allowedExperimentalValues,
      newTermsEsqlApproachEnabled: false,
    };

    it('always uses aggregation approach for local indices', async () => {
      const licensing = createLicensingMock(() => true);
      const execOptions = createExecOptions({
        inputIndex: ['logs-*'],
        experimentalFeatures: features,
        licensing,
      });

      await ruleType.executor(execOptions);

      expect(aggregationMock).toHaveBeenCalledWith(execOptions);
      expect(esqlMock).not.toHaveBeenCalled();
    });

    it('always uses aggregation approach for cross-cluster indices even with enterprise license', async () => {
      const licensing = createLicensingMock(() => true);
      const execOptions = createExecOptions({
        inputIndex: ['logs-*', 'remote:logs-*'],
        experimentalFeatures: features,
        licensing,
      });

      await ruleType.executor(execOptions);

      expect(aggregationMock).toHaveBeenCalledWith(execOptions);
      expect(esqlMock).not.toHaveBeenCalled();
    });
  });
});
