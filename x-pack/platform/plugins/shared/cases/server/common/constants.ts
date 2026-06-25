/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CaseSeverity, CaseStatuses } from '../../common/types/domain';
import {
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
} from '../../common/constants';
import { CasePersistedSeverity, CasePersistedStatus } from './types/case';

/**
 * The name of the saved object reference indicating the action connector ID. This is stored in the Saved Object reference
 * field's name property.
 */
export const CONNECTOR_ID_REFERENCE_NAME = 'connectorId';

/**
 * The name of the saved object reference indicating the action connector ID that was used to push a case.
 */
export const PUSH_CONNECTOR_ID_REFERENCE_NAME = 'pushConnectorId';

/**
 * The name of the saved object reference indicating the caseId reference
 */
export const CASE_REF_NAME = `associated-${CASE_SAVED_OBJECT}`;

/**
 * The name of the saved object reference indicating the commentId reference
 */
export const COMMENT_REF_NAME = `associated-${CASE_COMMENT_SAVED_OBJECT}`;

/**
 * The name of the saved object reference indicating the attachmentId reference
 */
export const CASE_ATTACHMENT_REF_NAME = `associated-${CASE_ATTACHMENT_SAVED_OBJECT}`;

/**
 * The name of the saved object reference indicating the externalReferenceId reference
 */
export const EXTERNAL_REFERENCE_REF_NAME = 'externalReferenceId';

/**
 * The name of the saved object reference indicating the attachmentId reference
 */
export const ATTACHMENT_ID_REF_NAME = 'attachmentId';

/**
 * The name of the licensing feature to notify for feature usage with the licensing plugin
 */
export const LICENSING_CASE_ASSIGNMENT_FEATURE = 'Cases user usage';

/**
 * The name of the licensing feature to notify for cases feature usage with the licensing plugin
 */
export const LICENSING_CASE_OBSERVABLES_FEATURE = 'Cases observable assignment';

export const SEVERITY_EXTERNAL_TO_ESMODEL: Record<CaseSeverity, CasePersistedSeverity> = {
  [CaseSeverity.LOW]: CasePersistedSeverity.LOW,
  [CaseSeverity.MEDIUM]: CasePersistedSeverity.MEDIUM,
  [CaseSeverity.HIGH]: CasePersistedSeverity.HIGH,
  [CaseSeverity.CRITICAL]: CasePersistedSeverity.CRITICAL,
};

export const SEVERITY_ESMODEL_TO_EXTERNAL: Record<CasePersistedSeverity, CaseSeverity> = {
  [CasePersistedSeverity.LOW]: CaseSeverity.LOW,
  [CasePersistedSeverity.MEDIUM]: CaseSeverity.MEDIUM,
  [CasePersistedSeverity.HIGH]: CaseSeverity.HIGH,
  [CasePersistedSeverity.CRITICAL]: CaseSeverity.CRITICAL,
};

export const STATUS_EXTERNAL_TO_ESMODEL: Record<CaseStatuses, CasePersistedStatus> = {
  [CaseStatuses.open]: CasePersistedStatus.OPEN,
  [CaseStatuses['in-progress']]: CasePersistedStatus.IN_PROGRESS,
  [CaseStatuses.closed]: CasePersistedStatus.CLOSED,
};

export const STATUS_ESMODEL_TO_EXTERNAL: Record<CasePersistedStatus, CaseStatuses> = {
  [CasePersistedStatus.OPEN]: CaseStatuses.open,
  [CasePersistedStatus.IN_PROGRESS]: CaseStatuses['in-progress'],
  [CasePersistedStatus.CLOSED]: CaseStatuses.closed,
};
