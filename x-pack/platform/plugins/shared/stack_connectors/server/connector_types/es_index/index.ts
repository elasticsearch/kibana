/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { get } from 'lodash';
import { i18n } from '@kbn/i18n';
import type { Logger } from '@kbn/core/server';
import type {
  ClassicActionType as ConnectorType,
  ActionTypeExecutorOptions as ConnectorTypeExecutorOptions,
  ActionTypeExecutorResult as ConnectorTypeExecutorResult,
} from '@kbn/actions-plugin/server/types';
import { renderMustacheObject } from '@kbn/actions-plugin/server/lib/mustache_renderer';
import {
  AlertHistoryEsIndexConnectorId,
  buildAlertHistoryDocument,
  AlertingConnectorFeatureId,
  UptimeConnectorFeatureId,
  SecurityConnectorFeatureId,
} from '@kbn/actions-plugin/common';
import type { BulkOperationType, BulkResponseItem } from '@elastic/elasticsearch/lib/api/types';
import {
  CONNECTOR_ID,
  CONNECTOR_NAME,
  ConfigSchema,
  ParamsSchema,
  SecretsSchema,
} from '@kbn/connector-schemas/es_index';
import type {
  ActionParamsType,
  ConnectorTypeConfigType,
  ConnectorTypeSecretsType,
} from '@kbn/connector-schemas/es_index';

import { TaskErrorSource } from '@kbn/task-manager-plugin/common';

export type ESIndexConnectorType = ConnectorType<
  ConnectorTypeConfigType,
  ConnectorTypeSecretsType,
  ActionParamsType,
  unknown
>;

export type ESIndexConnectorTypeExecutorOptions = ConnectorTypeExecutorOptions<
  ConnectorTypeConfigType,
  ConnectorTypeSecretsType,
  ActionParamsType
>;

// config definition

// connector type definition
export function getConnectorType(): ESIndexConnectorType {
  return {
    id: CONNECTOR_ID,
    minimumLicenseRequired: 'basic',
    name: CONNECTOR_NAME,
    supportedFeatureIds: [
      AlertingConnectorFeatureId,
      UptimeConnectorFeatureId,
      SecurityConnectorFeatureId,
    ],
    validate: {
      secrets: {
        schema: SecretsSchema,
      },
      config: {
        schema: ConfigSchema,
      },
      params: {
        schema: ParamsSchema,
      },
    },
    executor,
    renderParameterTemplates,
  };
}

// action executor

async function executor(
  execOptions: ESIndexConnectorTypeExecutorOptions
): Promise<ConnectorTypeExecutorResult<unknown>> {
  const { actionId, config, params, services, logger } = execOptions;
  const index = params.indexOverride || config.index;

  const bulkBody = [];
  for (const document of params.documents) {
    let jsonDocument: Record<string, unknown>;
    if (typeof document === 'string') {
      try {
        jsonDocument = JSON.parse(document);
      } catch (err) {
        return wrapErr(`error parsing document: ${err.message}`, actionId, logger, true);
      }
    } else {
      jsonDocument = document;
    }

    const timeField = config.executionTimeField == null ? '' : config.executionTimeField.trim();
    if (timeField !== '') {
      jsonDocument[timeField] = new Date();
    }

    bulkBody.push({ index: { op_type: 'create' } });
    bulkBody.push(jsonDocument);
  }

  const bulkParams = {
    index,
    body: bulkBody,
    refresh: config.refresh,
  };

  try {
    const result = await services.scopedClusterClient.bulk(bulkParams);

    if (result.errors) {
      const errReason: string[] = [];
      const errCausedBy: string[] = [];
      // extract error reason and caused by
      (result.items ?? []).forEach((item: Partial<Record<BulkOperationType, BulkResponseItem>>) => {
        for (const [_, responseItem] of Object.entries(item)) {
          const reason = get(responseItem, 'error.reason');
          const causedBy = get(responseItem, 'error.caused_by.reason');
          if (reason) {
            errReason.push(reason);
          }
          if (causedBy) {
            errCausedBy.push(causedBy);
          }
        }
      });

      const errMessage =
        errReason.length > 0
          ? `${errReason.join(';')}${errCausedBy.length > 0 ? ` (${errCausedBy.join(';')})` : ''}`
          : `Indexing error but no reason returned.`;

      return wrapErr(errMessage, actionId, logger);
    }

    return { status: 'ok', data: result, actionId };
  } catch (err) {
    return wrapErr(err.message, actionId, logger);
  }
}

function renderParameterTemplates(
  logger: Logger,
  params: ActionParamsType,
  variables: Record<string, unknown>,
  actionId?: string
): ActionParamsType {
  const { documents, indexOverride } = renderMustacheObject<ActionParamsType>(
    logger,
    params,
    variables
  );

  if (actionId === AlertHistoryEsIndexConnectorId) {
    const alertHistoryDoc = buildAlertHistoryDocument(variables);
    if (!alertHistoryDoc) {
      throw new Error(`error creating alert history document for ${actionId} connector`);
    }
    return { documents: [alertHistoryDoc], indexOverride };
  }

  return { documents, indexOverride: null };
}

function wrapErr(
  errMessage: string,
  actionId: string,
  logger: Logger,
  isUserError: boolean = false
): ConnectorTypeExecutorResult<unknown> {
  const message = i18n.translate('xpack.stackConnectors.esIndex.errorIndexingErrorMessage', {
    defaultMessage: 'error indexing documents',
  });
  logger.error(`error indexing documents: ${errMessage}`);
  return {
    status: 'error',
    actionId,
    message,
    serviceMessage: errMessage,
    ...(isUserError ? { errorSource: TaskErrorSource.USER } : {}),
  };
}
