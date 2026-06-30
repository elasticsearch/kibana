/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SingleCaseMetricsResponse } from '../../../../common/types/api';
import { CaseMetricsFeature } from '../../../../common/types/api';
import { Operations } from '../../../authorization';
import { getAttachmentAuthorizationFilter } from '../../../authorization/utils';
import { createCaseError } from '../../../common/error';
import { SingleCaseBaseHandler } from '../single_case_base_handler';
import type { SingleCaseBaseHandlerCommonOptions } from '../types';

export class AlertsCount extends SingleCaseBaseHandler {
  constructor(options: SingleCaseBaseHandlerCommonOptions) {
    super(options, [CaseMetricsFeature.ALERTS_COUNT]);
  }

  public async compute(): Promise<SingleCaseMetricsResponse> {
    const {
      authorization,
      services: { attachmentService },
      logger,
    } = this.options.clientArgs;

    const { casesClient } = this.options;

    try {
      // This will perform an authorization check to ensure the user has access to the parent case
      const theCase = await casesClient.cases.get({
        id: this.caseId,
        includeComments: false,
      });

      const { filter: authorizationFilter } = await getAttachmentAuthorizationFilter(
        authorization,
        Operations.getAttachmentMetrics
      );

      const alertsCount = await attachmentService.countAlertsAttachedToCase({
        caseId: theCase.id,
        filter: authorizationFilter,
      });

      return {
        alerts: {
          count: alertsCount ?? 0,
        },
      };
    } catch (error) {
      throw createCaseError({
        message: `Failed to count alerts attached case id: ${this.caseId}: ${error}`,
        error,
        logger,
      });
    }
  }
}
