/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { ServiceParams } from '@kbn/actions-plugin/server';
import { SubActionConnector } from '@kbn/actions-plugin/server';
import type { ConnectorUsageCollector } from '@kbn/actions-plugin/server/types';
import { createTaskRunError, TaskErrorSource } from '@kbn/task-manager-plugin/server';
import type { AxiosError } from 'axios';
import type {
  Config,
  Secrets,
  XSOARPlaybooksActionResponse,
  XSOARRunActionParams,
} from '@kbn/connector-schemas/xsoar';
import {
  SUB_ACTION,
  XSOARPlaybooksActionParamsSchema,
  XSOARPlaybooksActionResponseSchema,
  XSOARRunActionParamsSchema,
  XSOARRunActionResponseSchema,
} from '@kbn/connector-schemas/xsoar';

export const CLOUD_API_PATH = '/xsoar/public/v1';
export const INCIDENT_PATH = '/incident';
export const PLAYBOOKS_PATH = '/playbook/search';

export class XSOARConnector extends SubActionConnector<Config, Secrets> {
  private urls: {
    playbooks: string;
    incident: string;
  };
  private isCloud: boolean;
  private ConnectorId: string;

  constructor(params: ServiceParams<Config, Secrets>) {
    super(params);

    this.isCloud = this.secrets.apiKeyID !== null && this.secrets.apiKeyID !== '';
    this.urls = {
      playbooks: this.isCloud
        ? `${this.config.url}${CLOUD_API_PATH}${PLAYBOOKS_PATH}`
        : `${this.config.url}${PLAYBOOKS_PATH}`,
      incident: this.isCloud
        ? `${this.config.url}${CLOUD_API_PATH}${INCIDENT_PATH}`
        : `${this.config.url}${INCIDENT_PATH}`,
    };
    this.ConnectorId = params.connector.id;
    this.registerSubActions();
  }

  private registerSubActions() {
    this.registerSubAction({
      name: SUB_ACTION.PLAYBOOKS,
      method: 'getPlaybooks',
      schema: XSOARPlaybooksActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.RUN,
      method: 'run',
      schema: XSOARRunActionParamsSchema,
    });
  }

  private getAuthHeaders() {
    return this.isCloud
      ? { Authorization: this.secrets.apiKey, 'x-xdr-auth-id': this.secrets.apiKeyID }
      : { Authorization: this.secrets.apiKey };
  }

  protected getResponseErrorMessage(error: AxiosError): string {
    if (error.response?.statusText) {
      return `API Error: ${error.response?.statusText}`;
    }
    return error.toString();
  }

  private formatIncidentBody(incident: XSOARRunActionParams) {
    try {
      const { body, isRuleSeverity, ...incidentWithoutBody } = incident;
      const bodyJson = JSON.parse(body || '{}');
      const mergedIncident = { ...bodyJson, ...incidentWithoutBody };

      return mergedIncident;
    } catch (err) {
      const errMessage = i18n.translate('xpack.stackConnectors.xsoar.BodyParsingErrorMessage', {
        defaultMessage: 'error triggering XSOAR workflow, parsing body',
      });

      this.logger.error(`error on ${this.ConnectorId} XSOAR event: ${errMessage}: ${err.message}`);

      // The incident body is user-supplied input, so a JSON parsing failure here is always a
      // user error. Mark it as such so it does not count against the connector's execution
      // success rate. This is a SyntaxError with no HTTP status, so the createAndThrowUserError
      // helper (which keys off Axios response status codes) does not apply here.
      throw createTaskRunError(
        new Error(
          i18n.translate('xpack.stackConnectors.xsoar.incidentBodyParsingError', {
            defaultMessage: 'Error parsing Body: {err}',
            values: {
              err: err.toString(),
            },
          })
        ),
        TaskErrorSource.USER
      );
    }
  }

  public async run(
    incident: XSOARRunActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ) {
    const mergedIncident = this.formatIncidentBody(incident);
    await this.request(
      {
        method: 'post',
        url: `${this.urls.incident}`,
        data: mergedIncident,
        headers: this.getAuthHeaders(),
        responseSchema: XSOARRunActionResponseSchema,
      },
      connectorUsageCollector
    );
  }

  public async getPlaybooks(
    params: unknown,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<XSOARPlaybooksActionResponse> {
    const res = await this.request(
      {
        method: 'post',
        url: `${this.urls.playbooks}`,
        data: {},
        headers: this.getAuthHeaders(),
        responseSchema: XSOARPlaybooksActionResponseSchema,
        timeout: 15000,
      },
      connectorUsageCollector
    );

    return res.data;
  }
}
