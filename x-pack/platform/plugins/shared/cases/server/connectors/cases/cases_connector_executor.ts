/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import { get, partition, pick } from 'lodash';
import dateMath from '@kbn/datemath';
import { CaseStatuses } from '@kbn/cases-components';
import type { SavedObjectError } from '@kbn/core-saved-objects-common';
import type { Logger } from '@kbn/core/server';
import { getFlattenedObject, stableStringify } from '@kbn/std';
import type {
  CustomFieldsConfiguration,
  TemplatesConfiguration,
} from '../../../common/types/domain';
import {
  CASE_EXTENDED_FIELDS,
  MAX_ALERTS_PER_CASE,
  MAX_LENGTH_PER_TAG,
  MAX_TAGS_PER_CASE,
  MAX_TITLE_LENGTH,
  MAX_RULE_NAME_LENGTH,
  MAX_SUFFIX_LENGTH,
} from '../../../common/constants';
import { COMMENT_ATTACHMENT_TYPE } from '../../../common/constants/attachments';
import { hasOwnerUnifiedPrefix, toUnifiedAttachmentType } from '../../../common/utils/attachments';
import type { AttachmentRequestV2, BulkCreateCasesRequest } from '../../../common/types/api';
import type { Case, CaseSeverity } from '../../../common';
import { ConnectorTypes, AttachmentType } from '../../../common';
import { INITIAL_ORACLE_RECORD_COUNTER, MAX_CONCURRENT_ES_REQUEST } from './constants';
import type {
  BulkCreateOracleRecordRequest,
  CasesConnectorRunParams,
  CasesGroupedAlerts,
  OracleRecord,
} from './types';
import type { CasesOracleService } from './cases_oracle_service';
import {
  convertValueToString,
  partitionByNonFoundErrors,
  partitionRecordsByError,
  buildCustomFieldsForRequest,
} from './utils';
import type { CasesService } from './cases_service';
import type { CasesClient } from '../../client';
import type { BulkCreateArgs as BulkCreateAlertsReq } from '../../client/attachments/types';
import { CasesConnectorError } from './cases_connector_error';
import {
  AUTO_CREATED_TITLE,
  CASE_CREATED_BY_RULE_DESC,
  GROUPED_BY_DESC,
  GROUPED_BY_TITLE,
} from './translations';
import { toStringArray } from '../../../common/utils/attachments/string_utils';
import { buildExtendedFieldsFromTemplate, resolveV2Template } from './v2_template_utils';
import type { ParsedTemplateDefinition } from './v2_template_utils';

interface CasesConnectorExecutorParams {
  logger: Logger;
  casesOracleService: CasesOracleService;
  casesService: CasesService;
  casesClient: CasesClient;
  spaceId: string;
  isCasesAttachmentsEnabled?: boolean;
}

type GroupedAlertsWithOracleKey = CasesGroupedAlerts & { oracleKey: string };
type GroupedAlertsWithOracleRecords = GroupedAlertsWithOracleKey & { oracleRecord: OracleRecord };
type GroupedAlertsWithCaseId = GroupedAlertsWithOracleRecords & { caseId: string };
type GroupedAlertsWithCases = GroupedAlertsWithCaseId & { theCase: Case };

export class CasesConnectorExecutor {
  private readonly logger: Logger;
  private readonly casesOracleService: CasesOracleService;
  private readonly casesService: CasesService;
  private readonly casesClient: CasesClient;
  private readonly spaceId: string;
  private readonly isCasesAttachmentsEnabled: boolean;

  constructor({
    logger,
    casesOracleService,
    casesService,
    casesClient,
    spaceId,
    isCasesAttachmentsEnabled = false,
  }: CasesConnectorExecutorParams) {
    this.logger = logger;
    this.casesOracleService = casesOracleService;
    this.casesService = casesService;
    this.casesClient = casesClient;
    this.spaceId = spaceId;
    this.isCasesAttachmentsEnabled = isCasesAttachmentsEnabled;
  }

  public async execute(params: CasesConnectorRunParams) {
    const { alerts, groupedAlerts: casesGroupedAlerts, groupingBy } = params;

    const groupedAlerts = casesGroupedAlerts ?? this.groupAlerts({ params, alerts, groupingBy });
    const groupedAlertsWithCircuitBreakers = this.applyCircuitBreakers(params, groupedAlerts);

    if (groupedAlertsWithCircuitBreakers.length === 0) {
      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor] Grouping did not produce any alerts. Skipping execution.`,
        this.getLogMetadata(params)
      );

      return;
    }

    /**
     * Based on the rule ID, the grouping, the owner, the space ID,
     * the oracle record ID is generated
     */
    const groupedAlertsWithOracleKey = this.generateOracleKeys(
      params,
      groupedAlertsWithCircuitBreakers
    );

    /**
     * Gets all records by the IDs that produces in generateOracleKeys.
     * If a record does not exist it will create the record.
     * A record does not exist if it is the first time the connector run for a specific grouping.
     * The returned map will contain all records old and new.
     */
    const oracleRecordsMap = await this.upsertOracleRecords(params, groupedAlertsWithOracleKey);

    /**
     * If the time window has passed for a case we need to create a new case.
     * To do that we need to increase the record counter by one. Increasing the
     * counter will generate a new case ID for the same grouping.
     * The returned map contain all records with their counters updated correctly
     */
    const oracleRecordMapWithTimeWindowHandled = await this.handleTimeWindow(
      params,
      oracleRecordsMap
    );

    /**
     * Based on the rule ID, the grouping, the owner, the space ID,
     * and the counter of the oracle record the case ID is generated
     */
    const groupedAlertsWithCaseId = this.generateCaseIds(
      params,
      oracleRecordMapWithTimeWindowHandled
    );

    /**
     * Gets all records by the IDs that produces in generateCaseIds.
     * If a case does not exist it will create the case.
     * A case does not exist if it is the first time the connector run for a specific grouping
     * or the time window has elapsed and a new one should be created for the same grouping.
     * The returned map will contain all cases old and new.
     */
    const groupedAlertsWithCases = await this.upsertCases(params, groupedAlertsWithCaseId);

    /**
     * A user can configure how to handle closed cases. Based on the configuration
     * we open the closed cases by updating their status or we create new cases by
     * increasing the counter of the corresponding oracle record, generating the new
     * case ID, and creating the new case.
     * The map contains all cases updated and new without any remaining closed case.
     */
    const groupedAlertsWithClosedCasesHandled = await this.handleClosedCases(
      params,
      groupedAlertsWithCases
    );

    /**
     * Now that all cases are fetched or created per grouping, we attach
     * comments (if available) and alerts to the corresponding cases.
     */
    await this.attachCommentAndAlertsToCases(groupedAlertsWithClosedCasesHandled, params);

    /**
     * Now that all cases have been updated, we can push updates to external connectors
     */
    if (params.autoPushCase) {
      await this.pushCaseUpdates(groupedAlertsWithClosedCasesHandled, params);
    }
  }

  private async pushCaseUpdates(
    groupedAlertsWithCases: Map<string, GroupedAlertsWithCases>,
    params: CasesConnectorRunParams
  ) {
    return pMap(
      Array.from(groupedAlertsWithCases.values()),
      /**
       * attachments.bulkCreate throws an error on errors
       */
      async (groupedAlertsWithCase) => {
        const { theCase } = groupedAlertsWithCase;
        if (theCase.connector && params.autoPushCase) {
          return this.casesClient.cases
            .push({
              caseId: theCase.id,
              connectorId: theCase.connector.id,
              pushType: 'automatic',
            })
            .catch((error) => {
              this.logger.debug(
                `[CasesConnector][CasesConnectorExecutor][pushCaseUpdates] Failed to auto-push case (id: ${theCase.id}): ${error}`
              );
            });
        }
        return Promise.resolve();
      },
      {
        concurrency: MAX_CONCURRENT_ES_REQUEST,
      }
    );
  }

  private groupAlerts({
    params,
    alerts,
    groupingBy,
  }: Pick<CasesConnectorRunParams, 'alerts' | 'groupingBy'> & {
    params: CasesConnectorRunParams;
  }): CasesGroupedAlerts[] {
    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor][groupAlerts] Grouping ${alerts.length} alerts`,
        this.getLogMetadata(params, {
          labels: { groupingBy },
          tags: ['case-connector:groupAlerts'],
        })
      );
    }

    const uniqueGroupingByFields = Array.from(new Set<string>(groupingBy));
    const groupingMap = new Map<string, CasesGroupedAlerts>();

    /**
     * We are interested in alerts that have a value for any
     * of the groupingBy fields defined by the users. All other
     * alerts will not be attached to any case.
     */
    const [alertsWithAllGroupingFields, noGroupedAlerts] = partition(alerts, (alert) =>
      uniqueGroupingByFields.every((groupingByField) => Boolean(get(alert, groupingByField, null)))
    );

    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor][groupAlerts] Total alerts to be grouped: ${alertsWithAllGroupingFields.length} out of ${alerts.length}`,
        this.getLogMetadata(params, { tags: ['case-connector:groupAlerts'] })
      );
    }

    for (const alert of alertsWithAllGroupingFields) {
      const alertWithOnlyTheGroupingFields = pick(alert, uniqueGroupingByFields);
      const groupingKey = stableStringify(alertWithOnlyTheGroupingFields);

      if (this.logger.isLevelEnabled('debug')) {
        this.logger.debug(
          `[CasesConnector][CasesConnectorExecutor][groupAlerts] Alert ${alert._id} got grouped into bucket with ID ${groupingKey}`,
          this.getLogMetadata(params, { tags: ['case-connector:groupAlerts', groupingKey] })
        );
      }

      if (groupingMap.has(groupingKey)) {
        groupingMap.get(groupingKey)?.alerts.push(alert);
      } else {
        groupingMap.set(groupingKey, { alerts: [alert], grouping: alertWithOnlyTheGroupingFields });
      }
    }

    if (noGroupedAlerts.length > 0) {
      const noGroupedGrouping = this.generateNoGroupAlertGrouping(params.groupingBy);

      groupingMap.set(stableStringify(noGroupedGrouping), {
        alerts: noGroupedAlerts,
        grouping: noGroupedGrouping,
      });
    }

    return Array.from(groupingMap.values());
  }

  private generateNoGroupAlertGrouping = (groupingBy: string[]) => {
    const noGroupedGrouping = groupingBy.reduce((acc, field) => {
      acc[field] = 'unknown';

      return acc;
    }, {} as Record<string, string>);

    return noGroupedGrouping;
  };

  private applyCircuitBreakers(
    params: CasesConnectorRunParams,
    groupedAlerts: CasesGroupedAlerts[]
  ): CasesGroupedAlerts[] {
    const groupSize = groupedAlerts.length;
    if (groupSize > params.maximumCasesToOpen) {
      this.logger.warn(
        `[CasesConnector][CasesConnectorExecutor][applyCircuitBreakers] Circuit breaker: Grouping definition would create more (${groupSize}) than the maximum number of allowed cases (${params.maximumCasesToOpen}). Falling back to one case.`,
        this.getLogMetadata(params)
      );

      return this.removeGrouping(groupedAlerts);
    }

    return groupedAlerts;
  }

  private removeGrouping(groupedAlerts: CasesGroupedAlerts[]): CasesGroupedAlerts[] {
    const allAlerts = groupedAlerts.map(({ alerts }) => alerts).flat();

    return [{ alerts: allAlerts, grouping: {} }];
  }

  private generateOracleKeys(
    params: CasesConnectorRunParams,
    groupedAlerts: CasesGroupedAlerts[]
  ): Map<string, GroupedAlertsWithOracleKey> {
    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor][generateOracleKeys] Generating ${groupedAlerts.length} oracle keys`,
        this.getLogMetadata(params, { tags: ['case-connector:generateOracleKeys'] })
      );
    }

    const { rule, owner } = params;

    const oracleMap = new Map<string, GroupedAlertsWithOracleKey>();

    for (const { grouping, alerts, comments, title } of groupedAlerts) {
      const getRecordIdParams = {
        ruleId: rule.id,
        grouping,
        owner,
        spaceId: this.spaceId,
      };

      const oracleKey = this.casesOracleService.getRecordId(getRecordIdParams);

      if (this.logger.isLevelEnabled('debug')) {
        this.logger.debug(
          `[CasesConnector][CasesConnectorExecutor][generateOracleKeys] Oracle key ${oracleKey} generated`,
          this.getLogMetadata(params, {
            labels: { params: getRecordIdParams },
            tags: ['case-connector:generateOracleKeys', oracleKey],
          })
        );
      }

      oracleMap.set(oracleKey, { oracleKey, grouping, alerts, comments, title });
    }

    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor][generateOracleKeys] Total of oracles keys generated ${oracleMap.size}`,
        this.getLogMetadata(params, { tags: ['case-connector:generateOracleKeys'] })
      );
    }

    return oracleMap;
  }

  private async upsertOracleRecords(
    params: CasesConnectorRunParams,
    groupedAlertsWithOracleKey: Map<string, GroupedAlertsWithOracleKey>
  ): Promise<Map<string, GroupedAlertsWithOracleRecords>> {
    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor][upsertOracleRecords] Upserting ${groupedAlertsWithOracleKey.size} oracle records`,
        this.getLogMetadata(params, { tags: ['case-connector:upsertOracleRecords'] })
      );
    }
    const bulkCreateReq: BulkCreateOracleRecordRequest = [];
    const oracleRecordMap = new Map<string, GroupedAlertsWithOracleRecords>();

    const addRecordToMap = (oracleRecords: OracleRecord[]) => {
      for (const record of oracleRecords) {
        if (groupedAlertsWithOracleKey.has(record.id)) {
          const data = groupedAlertsWithOracleKey.get(record.id) as GroupedAlertsWithCaseId;
          oracleRecordMap.set(record.id, { ...data, oracleRecord: record });
        }
      }
    };

    const ids = Array.from(groupedAlertsWithOracleKey.values()).map(({ oracleKey }) => oracleKey);

    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor][upsertOracleRecords] Getting oracle records with ids ${ids}`,
        this.getLogMetadata(params, { tags: ['case-connector:upsertOracleRecords', ...ids] })
      );
    }

    const bulkGetRes = await this.casesOracleService.bulkGetRecords(ids);
    const [bulkGetValidRecords, bulkGetRecordsErrors] = partitionRecordsByError(bulkGetRes);

    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor][upsertOracleRecords] The total number of valid oracle records is ${bulkGetValidRecords.length} and the total number of errors while getting the records is ${bulkGetRecordsErrors.length}`,
        this.getLogMetadata(params, {
          labels: {
            total: ids.length,
            success: bulkGetValidRecords.length,
            errors: bulkGetRecordsErrors.length,
          },
          tags: ['case-connector:upsertOracleRecords'],
        })
      );
    }

    addRecordToMap(bulkGetValidRecords);

    if (bulkGetRecordsErrors.length === 0) {
      return oracleRecordMap;
    }

    const [nonFoundErrors, restOfErrors] = partitionByNonFoundErrors(bulkGetRecordsErrors);

    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor][upsertOracleRecords] The total number of non found oracle records is ${nonFoundErrors.length} and the total number of the rest of errors while getting the records is ${restOfErrors.length}`,
        this.getLogMetadata(params, {
          labels: {
            nonFoundErrors: nonFoundErrors.length,
            restOfErrors: restOfErrors.length,
          },
          tags: ['case-connector:upsertOracleRecords'],
        })
      );
    }

    this.handleAndThrowErrors(restOfErrors);

    if (nonFoundErrors.length === 0) {
      return oracleRecordMap;
    }

    for (const error of nonFoundErrors) {
      if (error.id && groupedAlertsWithOracleKey.has(error.id)) {
        const record = groupedAlertsWithOracleKey.get(error.id);
        bulkCreateReq.push({
          recordId: error.id,
          payload: {
            rules: [{ id: params.rule.id }],
            grouping: record?.grouping ?? {},
          },
        });
      }
    }

    const idsToCreate = bulkCreateReq.map(({ recordId }) => recordId);

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][upsertOracleRecords] Creating oracle records with ids ${idsToCreate}`,
      this.getLogMetadata(params, { tags: ['case-connector:upsertOracleRecords', ...idsToCreate] })
    );

    const bulkCreateRes = await this.casesOracleService.bulkCreateRecord(bulkCreateReq);
    const [bulkCreateValidRecords, bulkCreateErrors] = partitionRecordsByError(bulkCreateRes);

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][upsertOracleRecords] The total number of created oracle records is ${bulkCreateValidRecords.length} and the total number of errors while creating the records is ${bulkCreateErrors.length}`,
      this.getLogMetadata(params, {
        labels: {
          total: idsToCreate.length,
          success: bulkCreateValidRecords.length,
          errors: bulkCreateErrors.length,
        },
        tags: ['case-connector:upsertOracleRecords'],
      })
    );

    this.handleAndThrowErrors(bulkCreateErrors);

    addRecordToMap(bulkCreateValidRecords);

    return oracleRecordMap;
  }

  private async handleTimeWindow(
    params: CasesConnectorRunParams,
    oracleRecordMap: Map<string, GroupedAlertsWithOracleRecords>
  ) {
    const { timeWindow } = params;

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][handleTimeWindow] Handling time window ${timeWindow}`,
      this.getLogMetadata(params, { tags: ['case-connector:handleTimeWindow'] })
    );

    const oracleRecordMapWithIncreasedCounters = new Map(oracleRecordMap);

    const recordsToIncreaseCounter = Array.from(oracleRecordMap.values())
      .filter(({ oracleRecord }) =>
        this.isTimeWindowPassed(
          params,
          timeWindow,
          oracleRecord.updatedAt ?? oracleRecord.createdAt
        )
      )
      .map(({ oracleRecord }) => oracleRecord);

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][handleTimeWindow] Total oracle records where the time window has passed and their counter will be increased ${recordsToIncreaseCounter.length}`,
      this.getLogMetadata(params, {
        tags: ['case-connector:handleTimeWindow', ...recordsToIncreaseCounter.map(({ id }) => id)],
      })
    );

    const bulkUpdateValidRecords = await this.increaseOracleRecordCounter(
      params,
      recordsToIncreaseCounter
    );

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][handleTimeWindow] Total oracle records where their counter got increased ${bulkUpdateValidRecords.length}`,
      this.getLogMetadata(params, { tags: ['case-connector:handleTimeWindow'] })
    );

    for (const res of bulkUpdateValidRecords) {
      if (oracleRecordMap.has(res.id)) {
        const data = oracleRecordMap.get(res.id) as GroupedAlertsWithOracleRecords;
        oracleRecordMapWithIncreasedCounters.set(res.id, { ...data, oracleRecord: res });
      }
    }

    return oracleRecordMapWithIncreasedCounters;
  }

  private async increaseOracleRecordCounter(
    params: CasesConnectorRunParams,
    oracleRecords: OracleRecord[]
  ): Promise<OracleRecord[]> {
    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][increaseOracleRecordCounter] Increasing the counters of ${oracleRecords.length} oracle records`,
      this.getLogMetadata(params, { tags: ['case-connector:increaseOracleRecordCounter'] })
    );

    if (oracleRecords.length === 0) {
      return [];
    }

    const bulkUpdateReq = oracleRecords.map((record) => ({
      recordId: record.id,
      version: record.version,
      /**
       * TODO: Add new cases or any other related info
       */
      payload: { counter: record.counter + 1 },
    }));

    const idsToUpdate = bulkUpdateReq.map(({ recordId }) => recordId);

    const bulkUpdateRes = await this.casesOracleService.bulkUpdateRecord(bulkUpdateReq);
    const [bulkUpdateValidRecords, bulkUpdateErrors] = partitionRecordsByError(bulkUpdateRes);

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][upsertOracleRecords] The total number of updated oracle records is ${bulkUpdateValidRecords.length} and the total number of errors while updating is ${bulkUpdateErrors.length}`,
      this.getLogMetadata(params, {
        labels: {
          total: idsToUpdate.length,
          success: bulkUpdateValidRecords.length,
          errors: bulkUpdateErrors.length,
        },
        tags: ['case-connector:increaseOracleRecordCounter', ...idsToUpdate],
      })
    );

    this.handleAndThrowErrors(bulkUpdateErrors);

    return bulkUpdateValidRecords;
  }

  private isTimeWindowPassed(
    params: CasesConnectorRunParams,
    timeWindow: string,
    counterLastUpdatedAt: string
  ) {
    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][isTimeWindowPassed] Validating the time window ${timeWindow} against the timestamp of the last update of the oracle record ${counterLastUpdatedAt}`,
      this.getLogMetadata(params, { tags: ['case-connector:isTimeWindowPassed'] })
    );

    const parsedDate = dateMath.parse(`now-${timeWindow}`);

    /**
     * TODO: Should we throw? Should we return true to create a new case?
     */
    if (!parsedDate || !parsedDate.isValid()) {
      this.logger.warn(
        `[CasesConnector][CasesConnectorExecutor][isTimeWindowPassed] Parsing time window error. Parsing value: "${timeWindow}"`,
        this.getLogMetadata(params)
      );

      return false;
    }

    const counterLastUpdatedAtAsDate = new Date(counterLastUpdatedAt);

    /**
     * TODO: Should we throw? Should we return true to create a new case?
     */
    if (isNaN(counterLastUpdatedAtAsDate.getTime())) {
      this.logger.warn(
        `[CasesConnector][CasesConnectorExecutor][isTimeWindowPassed] Timestamp "${counterLastUpdatedAt}" is not a valid date`,
        this.getLogMetadata(params)
      );

      return false;
    }

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][isTimeWindowPassed] Time window has passed ${
        counterLastUpdatedAtAsDate < parsedDate.toDate()
      }`,
      this.getLogMetadata(params, { tags: ['case-connector:isTimeWindowPassed'] })
    );

    return counterLastUpdatedAtAsDate < parsedDate.toDate();
  }

  private generateCaseIds(
    params: CasesConnectorRunParams,
    groupedAlertsWithOracleRecords: Map<string, GroupedAlertsWithOracleRecords>
  ): Map<string, GroupedAlertsWithCaseId> {
    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][generateCaseIds] Generating ${groupedAlertsWithOracleRecords.size} case IDs`,
      this.getLogMetadata(params, { tags: ['case-connector:generateCaseIds'] })
    );

    const { rule, owner } = params;

    const casesMap = new Map<string, GroupedAlertsWithCaseId>();

    for (const [recordId, entry] of groupedAlertsWithOracleRecords.entries()) {
      const getCaseIdParams = {
        ruleId: rule.id,
        grouping: entry.grouping,
        owner,
        spaceId: this.spaceId,
        counter: entry.oracleRecord.counter,
      };

      const caseId = this.casesService.getCaseId(getCaseIdParams);

      this.logger.debug(
        `[CasesConnector][CasesConnectorExecutor][generateCaseIds] Case ID ${caseId} generated with params ${JSON.stringify(
          getCaseIdParams
        )}`,
        this.getLogMetadata(params, {
          labels: { params: getCaseIdParams },
          tags: ['case-connector:generateCaseIds', caseId],
        })
      );

      casesMap.set(caseId, {
        caseId,
        alerts: entry.alerts,
        grouping: entry.grouping,
        comments: entry.comments,
        title: entry.title,
        oracleKey: recordId,
        oracleRecord: entry.oracleRecord,
      });
    }

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][generateCaseIds] Total of case IDs generated ${casesMap.size}`,
      this.getLogMetadata(params, { tags: ['case-connector:generateCaseIds'] })
    );

    return casesMap;
  }

  private async upsertCases(
    params: CasesConnectorRunParams,
    groupedAlertsWithCaseId: Map<string, GroupedAlertsWithCaseId>
  ): Promise<Map<string, GroupedAlertsWithCases>> {
    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][upsertCases] Upserting ${groupedAlertsWithCaseId.size} cases`,
      this.getLogMetadata(params, { tags: ['case-connector:upsertCases'] })
    );

    const bulkCreateReq = [];
    const casesMap = new Map<string, GroupedAlertsWithCases>();

    const ids = Array.from(groupedAlertsWithCaseId.values()).map(({ caseId }) => caseId);

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][upsertCases] Getting cases with ids ${ids}`,
      this.getLogMetadata(params, { tags: ['case-connector:upsertCases', ...ids] })
    );

    const { cases, errors } = await this.casesClient.cases.bulkGet({ ids });

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][upsertCases] The total number of cases is ${cases.length} and the total number of errors while getting the cases is ${errors.length}`,
      this.getLogMetadata(params, {
        labels: {
          total: ids.length,
          success: cases.length,
          errors: errors.length,
        },
        tags: ['case-connector:upsertCases'],
      })
    );

    for (const theCase of cases) {
      if (groupedAlertsWithCaseId.has(theCase.id)) {
        const data = groupedAlertsWithCaseId.get(theCase.id) as GroupedAlertsWithCaseId;
        casesMap.set(theCase.id, { ...data, theCase });
      }
    }

    if (errors.length === 0) {
      return casesMap;
    }

    const [nonFoundErrors, restOfErrors] = partitionByNonFoundErrors(
      /**
       * The format of error returned from bulkGet is different
       * from what expected. We need to transform to a SavedObjectError
       */
      errors.map((error) => ({ ...error, statusCode: error.status ?? 500, id: error.caseId }))
    );

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][upsertCases] The total number of non found cases is ${nonFoundErrors.length} and the total number of the rest of errors while getting the cases is ${restOfErrors.length}`,
      this.getLogMetadata(params, {
        labels: {
          nonFoundErrors: nonFoundErrors.length,
          restOfErrors: restOfErrors.length,
        },
        tags: ['case-connector:upsertCases'],
      })
    );

    this.handleAndThrowErrors(restOfErrors);

    if (nonFoundErrors.length === 0) {
      return casesMap;
    }

    const { customFieldsConfigurationMap, templatesConfigurationMap } =
      await this.getCustomFieldsAndTemplatesConfiguration();

    const { v2Template, extendedFields } = await this.resolveV2TemplateWithFields(params);

    for (const error of nonFoundErrors) {
      if (groupedAlertsWithCaseId.has(error.caseId)) {
        const data = groupedAlertsWithCaseId.get(error.caseId) as GroupedAlertsWithCaseId;

        bulkCreateReq.push(
          this.getCreateCaseRequest(
            params,
            data,
            customFieldsConfigurationMap.get(params.owner),
            templatesConfigurationMap.get(params.owner),
            v2Template ?? undefined,
            extendedFields
          )
        );
      }
    }

    const idsToCreate = bulkCreateReq.map(({ id }) => id);

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][upsertCases] Creating cases with ids ${idsToCreate}`,
      this.getLogMetadata(params, { tags: ['case-connector:upsertCases', ...idsToCreate] })
    );

    /**
     * cases.bulkCreate throws an error on errors
     */
    const bulkCreateCasesResponse = await this.casesClient.cases.bulkCreate({
      cases: bulkCreateReq,
    });

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][upsertCases] The total number of created cases is ${bulkCreateCasesResponse.cases.length}`,
      this.getLogMetadata(params, {
        labels: {
          total: bulkCreateReq.length,
        },
        tags: ['case-connector:upsertCases'],
      })
    );

    for (const theCase of bulkCreateCasesResponse.cases) {
      if (groupedAlertsWithCaseId.has(theCase.id)) {
        const data = groupedAlertsWithCaseId.get(theCase.id) as GroupedAlertsWithCaseId;
        casesMap.set(theCase.id, { ...data, theCase });
      }
    }

    return casesMap;
  }

  private getCreateCaseRequestFromV2Template(
    params: CasesConnectorRunParams,
    groupingData: GroupedAlertsWithCaseId,
    v2Template: ParsedTemplateDefinition,
    customFieldsConfigurations?: CustomFieldsConfiguration,
    extendedFields?: Record<string, string>
  ): Omit<BulkCreateCasesRequest['cases'][number], 'id'> & { id: string } {
    const { grouping, caseId, oracleRecord, title } = groupingData;
    const flattenGrouping = getFlattenedObject(grouping);

    const builtCustomFields = buildCustomFieldsForRequest(customFieldsConfigurations);

    const baseRequest: Omit<BulkCreateCasesRequest['cases'][number], 'id'> & { id: string } = {
      id: caseId,
      description: v2Template.description ?? this.getCaseDescription(params, flattenGrouping),
      tags: this.getCaseTags(params, flattenGrouping, v2Template.tags),
      title:
        title ??
        v2Template.name ??
        this.getCasesTitle(params, flattenGrouping, oracleRecord.counter),
      connector: {
        id: 'none',
        name: 'none',
        type: ConnectorTypes.none,
        fields: null,
      },
      settings: {
        syncAlerts: false,
        extractObservables: false,
      },
      owner: params.owner,
      customFields: builtCustomFields,
    };

    if (extendedFields && Object.keys(extendedFields).length > 0) {
      baseRequest[CASE_EXTENDED_FIELDS] = extendedFields;
    }

    if (v2Template.severity) {
      baseRequest.severity = v2Template.severity as CaseSeverity;
    }

    if (v2Template.category) {
      baseRequest.category = v2Template.category;
    }

    return baseRequest;
  }

  private getCreateCaseRequest(
    params: CasesConnectorRunParams,
    groupingData: GroupedAlertsWithCaseId,
    customFieldsConfigurations?: CustomFieldsConfiguration,
    templatesConfigurations?: TemplatesConfiguration,
    v2Template?: ParsedTemplateDefinition,
    extendedFields?: Record<string, string>
  ): Omit<BulkCreateCasesRequest['cases'][number], 'id'> & { id: string } {
    const { grouping, caseId, oracleRecord, title } = groupingData;
    const flattenGrouping = getFlattenedObject(grouping);

    if (v2Template) {
      return this.getCreateCaseRequestFromV2Template(
        params,
        groupingData,
        v2Template,
        customFieldsConfigurations,
        extendedFields
      );
    }

    const selectedTemplate = templatesConfigurations?.find(
      (template) => template.key === params.templateId
    );
    const caseFieldsFromTemplate = selectedTemplate ? selectedTemplate.caseFields : null;

    const builtCustomFields = buildCustomFieldsForRequest(
      customFieldsConfigurations,
      caseFieldsFromTemplate?.customFields
    );

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][getCreateCaseRequest] Built ${builtCustomFields.length} required custom fields for case with id ${caseId}`,
      this.getLogMetadata(params, {
        labels: {
          caseId,
          totalCreatedCustomFields: builtCustomFields.length,
        },
        tags: ['case-connector:getCreateCaseRequest'],
      })
    );

    return {
      id: caseId,
      description:
        caseFieldsFromTemplate?.description ?? this.getCaseDescription(params, flattenGrouping),
      tags: this.getCaseTags(params, flattenGrouping, caseFieldsFromTemplate?.tags),
      title:
        title ??
        caseFieldsFromTemplate?.title ??
        this.getCasesTitle(params, flattenGrouping, oracleRecord.counter),
      connector: caseFieldsFromTemplate?.connector ?? {
        id: 'none',
        name: 'none',
        type: ConnectorTypes.none,
        fields: null,
      },
      /**
       * TODO: Turn on for Security solution
       */
      settings: caseFieldsFromTemplate?.settings ?? {
        syncAlerts: false,
        extractObservables: false,
      },
      ...(caseFieldsFromTemplate?.assignees
        ? { assignees: caseFieldsFromTemplate?.assignees }
        : {}),
      ...(caseFieldsFromTemplate?.severity ? { severity: caseFieldsFromTemplate?.severity } : {}),
      ...(caseFieldsFromTemplate?.category ? { category: caseFieldsFromTemplate?.category } : null),
      owner: params.owner,
      customFields: builtCustomFields,
    };
  }

  private getCasesTitle(
    params: CasesConnectorRunParams,
    grouping: CasesGroupedAlerts['grouping'],
    oracleCounter: number
  ) {
    const totalDots = 3;

    const groupingDescription = Object.entries(grouping)
      .map(([_, value]) => {
        return convertValueToString(value);
      })
      .join(' & ');

    const oracleCounterString =
      oracleCounter > INITIAL_ORACLE_RECORD_COUNTER ? ` (${oracleCounter})` : '';

    const staticSuffixStart = groupingDescription.length > 0 ? ` - ${GROUPED_BY_TITLE('')}` : '';

    const staticSuffixEnd = `${oracleCounterString} (${AUTO_CREATED_TITLE})`;

    const ruleName = params.rule.name;

    const ruleNameTrimmed =
      ruleName.length > MAX_RULE_NAME_LENGTH
        ? ruleName.slice(0, MAX_RULE_NAME_LENGTH - totalDots)
        : ruleName;

    const ruleNameTrimmedWithDots =
      ruleName.length > ruleNameTrimmed.length
        ? `${ruleNameTrimmed}${'.'.repeat(totalDots)}`
        : ruleNameTrimmed;

    const maxSuffixLength =
      ruleNameTrimmedWithDots.length < MAX_RULE_NAME_LENGTH
        ? MAX_TITLE_LENGTH - ruleNameTrimmedWithDots.length
        : MAX_SUFFIX_LENGTH;

    const maxGroupingDescriptionLength =
      maxSuffixLength - (staticSuffixStart.length + staticSuffixEnd.length);

    const groupingDescriptionTrimmed =
      groupingDescription.length > maxGroupingDescriptionLength
        ? `${groupingDescription.slice(0, maxGroupingDescriptionLength - totalDots)}${'.'.repeat(
            totalDots
          )}`
        : groupingDescription;

    const suffix = `${staticSuffixStart}${groupingDescriptionTrimmed}${staticSuffixEnd}`;

    return `${ruleNameTrimmedWithDots}${suffix}`;
  }

  private getCaseDescription(
    params: CasesConnectorRunParams,
    grouping: CasesGroupedAlerts['grouping']
  ) {
    const ruleName = params.rule.ruleUrl
      ? `['${params.rule.name}'](${params.rule.ruleUrl})`
      : params.rule.name;

    const description = `${CASE_CREATED_BY_RULE_DESC(ruleName)}.`;

    const groupingDescription = Object.entries(grouping)
      .map(([key, value]) => {
        return `\`${key}: ${convertValueToString(value)}\``;
      })
      .join(' and ');

    if (groupingDescription.length > 0) {
      return `${description} ${GROUPED_BY_DESC(groupingDescription)}.`;
    }

    return description;
  }

  private getCaseTags(
    params: CasesConnectorRunParams,
    grouping: CasesGroupedAlerts['grouping'],
    templateCaseTags?: string[]
  ) {
    const ruleTags = Array.isArray(params.rule.tags) ? params.rule.tags : [];

    return [
      'auto-generated',
      `rule:${params.rule.id}`,
      ...this.getGroupingAsTags(grouping),
      ...ruleTags,
      ...(templateCaseTags ?? []),
    ]
      .splice(0, MAX_TAGS_PER_CASE)
      .map((tag) => tag.slice(0, MAX_LENGTH_PER_TAG));
  }

  private getGroupingAsTags(grouping: CasesGroupedAlerts['grouping']): string[] {
    return Object.entries(grouping)
      .map(([key, value]) => [key, `${key}:${convertValueToString(value)}`])
      .flat();
  }

  private async handleClosedCases(
    params: CasesConnectorRunParams,
    casesMap: Map<string, GroupedAlertsWithCases>
  ) {
    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][handleClosedCases] Handling closed cases with reopenClosedCases set to ${params.reopenClosedCases}`,
      this.getLogMetadata(params, { tags: ['case-connector:handleClosedCases'] })
    );

    const entriesWithClosedCases = Array.from(casesMap.values()).filter(
      (theCase) => theCase.theCase.status === CaseStatuses.closed
    );

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][handleClosedCases] Closed cases ${entriesWithClosedCases.length}`,
      this.getLogMetadata(params, { tags: ['case-connector:handleClosedCases'] })
    );

    if (entriesWithClosedCases.length === 0) {
      return casesMap;
    }

    const res = params.reopenClosedCases
      ? await this.reopenClosedCases(params, entriesWithClosedCases, casesMap)
      : await this.createNewCasesOutOfClosedCases(params, entriesWithClosedCases, casesMap);

    /**
     * The initial map contained the closed cases. We need to remove them to
     * avoid attaching alerts to a close case
     */
    return new Map([...res].filter(([_, record]) => record.theCase.status !== CaseStatuses.closed));
  }

  private async reopenClosedCases(
    params: CasesConnectorRunParams,
    closedCasesEntries: GroupedAlertsWithCases[],
    casesMap: Map<string, GroupedAlertsWithCases>
  ): Promise<Map<string, GroupedAlertsWithCases>> {
    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][reopenClosedCases] Total closed cases to reopen ${closedCasesEntries.length}`,
      this.getLogMetadata(params, { tags: ['case-connector:reopenClosedCases'] })
    );

    const casesMapWithClosedCasesOpened = new Map(casesMap);

    const bulkUpdateReq = closedCasesEntries.map((entry) => ({
      id: entry.theCase.id,
      version: entry.theCase.version,
      status: CaseStatuses.open,
    }));

    const idsToReopen = bulkUpdateReq.map(({ id }) => id);

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][reopenClosedCases] Reopening total ${bulkUpdateReq.length} closed cases with ids ${idsToReopen}`,
      this.getLogMetadata(params, { tags: ['case-connector:reopenClosedCases', ...idsToReopen] })
    );

    /**
     * cases.bulkUpdate throws an error on errors
     */
    const bulkUpdateCasesResponse = await this.casesClient.cases.bulkUpdate({
      cases: bulkUpdateReq,
    });

    for (const res of bulkUpdateCasesResponse) {
      if (casesMap.has(res.id)) {
        const data = casesMap.get(res.id) as GroupedAlertsWithCases;
        casesMapWithClosedCasesOpened.set(res.id, { ...data, theCase: res });
      }
    }

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][reopenClosedCases] The total number of cases that got reopened is ${bulkUpdateCasesResponse.length}`,
      this.getLogMetadata(params, {
        labels: {
          total: bulkUpdateCasesResponse.length,
        },
        tags: ['case-connector:reopenClosedCases'],
      })
    );

    return casesMapWithClosedCasesOpened;
  }

  private async createNewCasesOutOfClosedCases(
    params: CasesConnectorRunParams,
    closedCasesEntries: GroupedAlertsWithCases[],
    casesMap: Map<string, GroupedAlertsWithCases>
  ): Promise<Map<string, GroupedAlertsWithCases>> {
    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][createNewCasesOutOfClosedCases] Creating new cases for closed cases ${closedCasesEntries.length}`,
      this.getLogMetadata(params, { tags: ['case-connector:createNewCasesOutOfClosedCases'] })
    );

    const casesMapWithNewCases = new Map(casesMap);
    const casesMapAsArray = Array.from(casesMap.values());

    const findEntryByOracleRecord = (oracleId: string) => {
      return casesMapAsArray.find((record) => record.oracleRecord.id === oracleId);
    };

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][createNewCasesOutOfClosedCases] Total oracle records where their corresponding case is closed and their counter will be increased ${closedCasesEntries.length}`,
      this.getLogMetadata(params, { tags: ['case-connector:createNewCasesOutOfClosedCases'] })
    );

    const bulkUpdateOracleValidRecords = await this.increaseOracleRecordCounter(
      params,
      closedCasesEntries.map((entry) => entry.oracleRecord)
    );

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][createNewCasesOutOfClosedCases] Total oracle records where their corresponding case is closed and their counter got increased ${bulkUpdateOracleValidRecords.length}`,
      this.getLogMetadata(params, {
        tags: [
          'case-connector:createNewCasesOutOfClosedCases',
          ...closedCasesEntries.map(({ oracleKey }) => oracleKey),
        ],
      })
    );

    const groupedAlertsWithOracleRecords = new Map<string, GroupedAlertsWithOracleRecords>();

    for (const record of bulkUpdateOracleValidRecords) {
      const foundRecord = findEntryByOracleRecord(record.id);

      if (foundRecord) {
        groupedAlertsWithOracleRecords.set(record.id, {
          oracleKey: record.id,
          oracleRecord: foundRecord.oracleRecord,
          alerts: foundRecord.alerts,
          grouping: foundRecord.grouping,
        });
      }
    }

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][createNewCasesOutOfClosedCases] Generating ${groupedAlertsWithOracleRecords.size} case IDs`,
      this.getLogMetadata(params, { tags: ['case-connector:createNewCasesOutOfClosedCases'] })
    );

    const groupedAlertsWithCaseId = this.generateCaseIds(params, groupedAlertsWithOracleRecords);

    const {
      customFieldsConfigurationMap: customFieldsConfigurationMapForReopened,
      templatesConfigurationMap: templatesConfigurationMapForReopened,
    } = await this.getCustomFieldsAndTemplatesConfiguration();

    const { v2Template: v2TemplateForReopened, extendedFields: extendedFieldsForReopened } =
      await this.resolveV2TemplateWithFields(params);

    const bulkCreateReq = Array.from(groupedAlertsWithCaseId.values()).map((record) =>
      this.getCreateCaseRequest(
        params,
        record,
        customFieldsConfigurationMapForReopened.get(params.owner),
        templatesConfigurationMapForReopened.get(params.owner),
        v2TemplateForReopened ?? undefined,
        extendedFieldsForReopened
      )
    );

    const idsToCreate = bulkCreateReq.map(({ id }) => id);

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][createNewCasesOutOfClosedCases] Creating cases with ids ${idsToCreate}`,
      this.getLogMetadata(params, {
        tags: ['case-connector:createNewCasesOutOfClosedCases', ...idsToCreate],
      })
    );

    /**
     * cases.bulkCreate throws an error on errors
     */
    const bulkCreateCasesResponse = await this.casesClient.cases.bulkCreate({
      cases: bulkCreateReq,
    });

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][createNewCasesOutOfClosedCases] The total number of created cases is ${bulkCreateCasesResponse.cases.length}`,
      this.getLogMetadata(params, {
        labels: {
          total: bulkCreateCasesResponse.cases.length,
        },
        tags: ['case-connector:createNewCasesOutOfClosedCases'],
      })
    );

    for (const theCase of bulkCreateCasesResponse.cases) {
      if (groupedAlertsWithCaseId.has(theCase.id)) {
        const data = groupedAlertsWithCaseId.get(theCase.id) as GroupedAlertsWithCaseId;
        casesMapWithNewCases.set(theCase.id, { ...data, theCase });
      }
    }

    return casesMapWithNewCases;
  }

  private async attachCommentAndAlertsToCases(
    groupedAlertsWithCases: Map<string, GroupedAlertsWithCases>,
    params: CasesConnectorRunParams
  ): Promise<void> {
    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][attachAlertsToCases] Attaching alerts to ${groupedAlertsWithCases.size} cases`,
      this.getLogMetadata(params, { tags: ['case-connector:attachAlertsToCases'] })
    );

    const { internallyManagedAlerts, rule } = params;

    const [casesUnderAlertLimit, casesOverAlertLimit] = partition(
      Array.from(groupedAlertsWithCases.values()),
      ({ theCase, alerts }) => theCase.totalAlerts + alerts.length <= MAX_ALERTS_PER_CASE
    );

    if (casesOverAlertLimit.length > 0) {
      const ids = casesOverAlertLimit.map(({ theCase }) => theCase.id);
      const totalAlerts = casesOverAlertLimit.map(({ alerts }) => alerts.length).flat().length;

      this.logger.warn(
        `Cases with ids "${ids.join(
          ','
        )}" contain more than ${MAX_ALERTS_PER_CASE} alerts. The new alerts will not be attached to the cases. Total new alerts: ${totalAlerts}`,
        this.getLogMetadata(params)
      );
    }

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][attachAlertsToCases] Attaching alerts to ${casesUnderAlertLimit.length} cases that do not have reach the alert limit per case`,
      this.getLogMetadata(params, {
        tags: [
          'case-connector:attachAlertsToCases',
          ...casesUnderAlertLimit.map(({ caseId }) => caseId),
        ],
      })
    );

    const bulkCreateAlertsRequest: BulkCreateAlertsReq[] = casesUnderAlertLimit.map(
      ({ theCase, alerts, comments }) => {
        const extraComments: AttachmentRequestV2[] =
          comments?.map((comment) =>
            this.isCasesAttachmentsEnabled
              ? {
                  type: COMMENT_ATTACHMENT_TYPE,
                  data: { content: comment },
                  owner: theCase.owner,
                }
              : {
                  type: AttachmentType.user,
                  comment,
                  owner: theCase.owner,
                }
          ) ?? [];
        const rulePayload = internallyManagedAlerts
          ? { id: null, name: null }
          : { id: rule.id, name: rule.name };
        // Collect the parallel alertId / alertIndex arrays in a single pass.
        // Order is preserved by reduce per the ECMA-262 spec.
        const { alertIds, alertIndices } = alerts.reduce<{
          alertIds: string[];
          alertIndices: string[];
        }>(
          (acc, alert) => {
            acc.alertIds.push(alert._id);
            acc.alertIndices.push(alert._index);
            return acc;
          },
          { alertIds: [], alertIndices: [] }
        );

        // Only write the unified shape when the feature flag is on AND the
        // case owner has a registered unified prefix.
        const isUnifiedAlertValid =
          this.isCasesAttachmentsEnabled && hasOwnerUnifiedPrefix(theCase.owner);

        if (this.isCasesAttachmentsEnabled && !isUnifiedAlertValid) {
          this.logger.warn(
            `[CasesConnector][CasesConnectorExecutor][attachAlertsToCases] Owner "${theCase.owner}" has no unified attachment prefix; falling back to legacy alert attachment for case ${theCase.id}.`
          );
        }

        const alertAttachment: AttachmentRequestV2 = isUnifiedAlertValid
          ? {
              type: toUnifiedAttachmentType(AttachmentType.alert, theCase.owner),
              attachmentId: alertIds,
              metadata: { index: alertIndices, rule: rulePayload },
              owner: theCase.owner,
            }
          : {
              type: AttachmentType.alert,
              rule: rulePayload,
              alertId: alertIds,
              index: alertIndices,
              owner: theCase.owner,
            };

        return {
          caseId: theCase.id,
          attachments: [...extraComments, alertAttachment],
        };
      }
    );

    await pMap(
      bulkCreateAlertsRequest,
      /**
       * attachments.bulkCreate throws an error on errors
       */
      async (req: BulkCreateAlertsReq) => {
        if (this.logger.isLevelEnabled('debug')) {
          const attachmentIdsForLogging = req.attachments.flatMap((attachment) => {
            if ('alertId' in attachment) {
              return toStringArray(attachment.alertId);
            }
            if ('attachmentId' in attachment) {
              return toStringArray(attachment.attachmentId);
            }
            return [];
          });

          this.logger.debug(
            `[CasesConnector][CasesConnectorExecutor][attachAlertsToCases] Attaching ${req.attachments.length} alerts to case with ID ${req.caseId}`,
            this.getLogMetadata(params, {
              labels: { caseId: req.caseId },
              tags: ['case-connector:attachAlertsToCases', req.caseId, ...attachmentIdsForLogging],
            })
          );
        }

        await this.casesClient.attachments.bulkCreate(req);
      },
      {
        concurrency: MAX_CONCURRENT_ES_REQUEST,
      }
    );
  }

  private handleAndThrowErrors(errors: SavedObjectError[]) {
    if (errors.length === 0) {
      return;
    }

    const firstError = errors[0];
    const message = `${firstError.error}: ${firstError.message}`;

    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][handleAndThrowErrors] Error message "${message}"`,
      {
        tags: ['case-connector:handleAndThrowErrors'],
        error: { code: firstError.statusCode.toString() },
      }
    );

    throw new CasesConnectorError(message, firstError.statusCode);
  }

  private getLogMetadata(
    params: CasesConnectorRunParams,
    { tags = [], labels = {} }: { tags?: string[]; labels?: Record<string, unknown> } = {}
  ) {
    return { tags: ['cases-connector', `rule:${params.rule.id}`, ...tags], labels };
  }

  private async resolveV2TemplateWithFields(params: CasesConnectorRunParams): Promise<{
    v2Template: ParsedTemplateDefinition | null;
    extendedFields: Record<string, string> | undefined;
  }> {
    if (!params.templateVersion || !params.templateId) {
      return { v2Template: null, extendedFields: undefined };
    }

    const v2Template = await resolveV2Template(
      this.casesClient,
      params.templateId,
      params.templateVersion,
      params.owner,
      this.logger
    );

    const extendedFields = v2Template
      ? await buildExtendedFieldsFromTemplate(this.casesClient, v2Template, params.owner)
      : undefined;

    return { v2Template, extendedFields };
  }

  private async getCustomFieldsAndTemplatesConfiguration(): Promise<{
    customFieldsConfigurationMap: Map<string, CustomFieldsConfiguration>;
    templatesConfigurationMap: Map<string, TemplatesConfiguration>;
  }> {
    this.logger.debug(
      `[CasesConnector][CasesConnectorExecutor][getCustomFieldsConfiguration] Getting case configurations`,
      { tags: ['case-connector:getCustomFieldsConfiguration'] }
    );
    const configurations = await this.casesClient.configure.get();
    const customFieldsConfigurationMap = new Map(
      configurations.map((conf) => [conf.owner, conf.customFields])
    );
    const templatesConfigurationMap = new Map(
      configurations.map((config) => [config.owner, config.templates])
    );
    return { customFieldsConfigurationMap, templatesConfigurationMap };
  }
}
