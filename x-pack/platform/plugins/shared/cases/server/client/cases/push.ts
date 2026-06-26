/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { nodeBuilder } from '@kbn/es-query';
import type { SavedObjectsFindResponse } from '@kbn/core/server';

import type { UserProfile } from '@kbn/security-plugin/common';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import { asSavedObjectExecutionSource } from '@kbn/actions-plugin/server';
import type {
  ActionConnector,
  AttachmentAttributes,
  Case,
  ConfigurationAttributes,
} from '../../../common/types/domain';
import {
  CaseRt,
  CaseStatuses,
  UserActionTypes,
  AttachmentType,
} from '../../../common/types/domain';
import {
  CASE_COMMENT_SAVED_OBJECT,
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
  MAX_DOCS_PER_PAGE,
  OWNER_FIELD,
} from '../../../common/constants';
import { UNIFIED_ALERT_TYPES_ARRAY } from '../../../common/utils/attachments';

import {
  createIncident,
  getDurationInSeconds,
  getTimingMetricsForUpdate,
  getUserProfiles,
} from './utils';
import { createCaseError } from '../../common/error';
import {
  createAlertUpdateStatusRequest,
  flattenCaseSavedObject,
  getAlertInfoFromComments,
} from '../../common/utils';
import type { CasesClient, CasesClientArgs } from '..';
import { Operations } from '../../authorization';
import { casesConnectors } from '../../connectors';
import { getAlerts } from '../alerts/get';
import { buildFilter, combineFilters, NodeBuilderOperators } from '../utils';
import { decodeOrThrow } from '../../common/runtime_types';
import type { ExternalServiceResponse } from '../../../common/types/api';

/**
 * Returns true if the case should be closed based on the configuration settings.
 */
function shouldCloseByPush(
  configureSettings: SavedObjectsFindResponse<ConfigurationAttributes>
): boolean {
  return (
    configureSettings.total > 0 &&
    configureSettings.saved_objects[0].attributes.closure_type === 'close-by-pushing'
  );
}

const changeAlertsStatusToClose = async (
  caseId: string,
  caseService: CasesClientArgs['services']['caseService'],
  alertsService: CasesClientArgs['services']['alertsService'],
  isCasesAttachmentsEnabled: boolean
) => {
  const legacyAlertFilter = nodeBuilder.is(
    `${CASE_COMMENT_SAVED_OBJECT}.attributes.type`,
    AttachmentType.alert
  );

  const alertFilter = combineFilters(
    [
      legacyAlertFilter,
      buildFilter({
        filters: UNIFIED_ALERT_TYPES_ARRAY,
        field: 'type',
        operator: 'or',
        type: CASE_ATTACHMENT_SAVED_OBJECT,
      }),
    ],
    NodeBuilderOperators.or
  );

  const alertAttachments = await caseService.getAllCaseComments({
    id: [caseId],
    options: {
      filter: alertFilter,
    },
    mode: isCasesAttachmentsEnabled ? 'unified' : 'legacy',
  });

  const alerts = alertAttachments.saved_objects
    .map((attachment) =>
      createAlertUpdateStatusRequest({
        comment: attachment.attributes,
        status: CaseStatuses.closed,
      })
    )
    .flat();

  await alertsService.updateAlertsStatus(alerts);
};

/**
 * Parameters for pushing a case to an external system
 */
export interface PushParams {
  /**
   * The ID of a case
   */
  caseId: string;
  /**
   * The ID of an external system to push to
   */
  connectorId: string;
  /**
   * The type of push
   */
  pushType: 'manual' | 'automatic';
}

/**
 * Push a case to an external service.
 *
 * @ignore
 */
export const push = async (
  { connectorId, caseId, pushType }: PushParams,
  clientArgs: CasesClientArgs,
  casesClient: CasesClient
): Promise<Case> => {
  const {
    unsecuredSavedObjectsClient,
    services: {
      attachmentService,
      caseService,
      caseConfigureService,
      userActionService,
      alertsService,
    },
    actionsClient,
    user,
    logger,
    authorization,
    securityStartPlugin,
    spaceId,
    publicBaseUrl,
    usageCounter,
    config,
  } = clientArgs;

  const isCasesAttachmentsEnabled = config.attachments?.enabled === true;

  try {
    /* Start of push to external service */
    const [theCase, connector, userActions] = await Promise.all([
      casesClient.cases.get({
        id: caseId,
        includeComments: true,
      }),
      actionsClient.get({ id: connectorId }),
      casesClient.userActions.getAll({ caseId }),
    ]);

    await authorization.ensureAuthorized({
      entities: [{ owner: theCase.owner, id: caseId }],
      operation: Operations.pushCase,
    });

    const alertsInfo = getAlertInfoFromComments(theCase?.comments);
    const alerts = await getAlerts(alertsInfo, clientArgs);
    const profiles = await getProfiles(theCase, securityStartPlugin);

    const externalServiceIncident = await createIncident({
      theCase,
      userActions,
      connector: connector as ActionConnector,
      alerts,
      casesConnectors,
      userProfiles: profiles,
      spaceId,
      publicBaseUrl,
    });

    const pushRes = await actionsClient.execute({
      actionId: connector?.id ?? '',
      params: {
        subAction: 'pushToService',
        subActionParams: externalServiceIncident,
      },
      source: asSavedObjectExecutionSource({ id: caseId, type: CASE_SAVED_OBJECT }),
    });

    if (pushRes.status === 'error') {
      throw Boom.failedDependency(
        pushRes.serviceMessage ?? pushRes.message ?? 'Error pushing to service'
      );
    } else {
      if (usageCounter) {
        usageCounter.incrementCounter({
          counterName: `CasesPush-${pushType}`,
          incrementBy: 1,
        });
      }
    }

    /* End of push to external service */

    const ownerFilter = buildFilter({
      filters: theCase.owner,
      field: OWNER_FIELD,
      operator: 'or',
      type: Operations.findConfigurations.savedObjectType,
    });

    /* Start of update case with push information */
    const [myCase, myCaseConfigure, comments] = await Promise.all([
      caseService.getCase({
        id: caseId,
      }),
      caseConfigureService.find({ unsecuredSavedObjectsClient, options: { filter: ownerFilter } }),
      caseService.getAllCaseComments({
        id: caseId,
        options: {
          page: 1,
          perPage: MAX_DOCS_PER_PAGE,
        },
      }),
    ]);

    const { username, full_name, email, profile_uid } = user;
    const pushedDate = new Date().toISOString();
    const externalServiceResponse = pushRes.data as ExternalServiceResponse;

    const externalService = {
      pushed_at: pushedDate,
      pushed_by: { username, full_name, email, profile_uid },
      connector_id: connector.id,
      connector_name: connector.name,
      external_id: externalServiceResponse.id,
      external_title: externalServiceResponse.title,
      external_url: externalServiceResponse.url,
    };

    const shouldMarkAsClosed = shouldCloseByPush(myCaseConfigure);

    const [updatedCase, updatedComments] = await Promise.all([
      caseService.patchCase({
        originalCase: myCase,
        caseId,
        updatedAttributes: {
          ...(shouldMarkAsClosed
            ? {
                status: CaseStatuses.closed,
                closed_at: pushedDate,
                closed_by: { email, full_name, username, profile_uid },
              }
            : {}),
          ...(shouldMarkAsClosed
            ? getDurationInSeconds({
                closedAt: pushedDate,
                createdAt: theCase.created_at,
              })
            : {}),
          ...(shouldMarkAsClosed
            ? getTimingMetricsForUpdate({
                status: CaseStatuses.closed,
                stateTransitionTimestamp: pushedDate,
                createdAt: theCase.created_at,
                inProgressAt: theCase.in_progress_at,
              })
            : {}),
          external_service: externalService,
          updated_at: pushedDate,
          updated_by: { username, full_name, email, profile_uid },
        },
        version: myCase.version,
        refresh: false,
      }),

      attachmentService.bulkUpdate({
        comments: comments.saved_objects
          .filter((comment) => comment.attributes.pushed_at == null)
          .map((comment) => ({
            savedObjectId: comment.id,
            updatedAttributes: {
              pushed_at: pushedDate,
              pushed_by: { username, full_name, email, profile_uid },
            },
            version: comment.version,
          })),
        refresh: false,
        requestWithoutType: true,
      }),
    ]);

    if (shouldMarkAsClosed) {
      await userActionService.creator.createUserAction({
        userAction: {
          type: UserActionTypes.status,
          payload: { status: CaseStatuses.closed },
          user,
          caseId,
          owner: myCase.attributes.owner,
        },
        refresh: false,
      });

      if (myCase.attributes.settings.syncAlerts) {
        await changeAlertsStatusToClose(
          myCase.id,
          caseService,
          alertsService,
          isCasesAttachmentsEnabled
        );
      }
    }

    await userActionService.creator.createUserAction({
      userAction: {
        type: UserActionTypes.pushed,
        payload: { externalService },
        user,
        caseId,
        owner: myCase.attributes.owner,
      },
    });

    /* End of update case with push information */
    const res = flattenCaseSavedObject({
      savedObject: {
        ...myCase,
        ...updatedCase,
        attributes: { ...myCase.attributes, ...updatedCase?.attributes },
        references: myCase.references,
      },
      comments: comments.saved_objects.map((origComment) => {
        const updatedComment = updatedComments.saved_objects.find((c) => c.id === origComment.id);
        return {
          ...origComment,
          ...updatedComment,
          attributes: {
            ...origComment.attributes,
            ...updatedComment?.attributes,
          } as AttachmentAttributes,
          version: updatedComment?.version ?? origComment.version,
          references: origComment?.references ?? [],
        };
      }),
    });

    return decodeOrThrow(CaseRt)(res);
  } catch (error) {
    throw createCaseError({ message: `Failed to push case: ${error}`, error, logger });
  }
};

const getProfiles = async (
  caseInfo: Case,
  securityStartPlugin: SecurityPluginStart
): Promise<Map<string, UserProfile> | undefined> => {
  const uids = new Set([
    ...(caseInfo.updated_by?.profile_uid != null ? [caseInfo.updated_by.profile_uid] : []),
    ...(caseInfo.created_by?.profile_uid != null ? [caseInfo.created_by.profile_uid] : []),
  ]);

  const userProfiles = await getUserProfiles(securityStartPlugin, uids);

  if (userProfiles.size <= 0) {
    return;
  }

  return userProfiles;
};
