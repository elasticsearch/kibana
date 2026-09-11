/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExceptionListTypeEnum, type EntriesArray } from '@kbn/securitysolution-io-ts-list-types';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import type { PolicyArtifactKind } from './page_objects';

/**
 * Displayed lowercase. Forms enter it uppercase on purpose so create flows
 * cover hash normalization. Keep in sync with Cypress `artifacts_page.ts`
 * criteria strings.
 */
export const TRUSTED_APP_HASH = 'a4370c0cf81686c0b696fa6261c9d3e0d810ae704ab8301839dffd5d5112f476';

/**
 * Policy-details tab cases for Scout. Cypress `getArtifactsListTestsData()` in
 * `public/management/cypress/fixtures/artifacts_page.ts` is a live fork used
 * by `artifacts.cy.ts`. If you change a criteriaConditions string here, update
 * the other.
 *
 * Event Filters / Endpoint Exceptions autocomplete fields (`@timestamp`,
 * `agent.version`, `process.name`) are seeded in `seed_endpoint_field_caps.ts`.
 */
export interface ArtifactTabCase {
  kind: PolicyArtifactKind;
  title: string;
  tabTestSubj: string;
  nextTabTestSubj: string;
  pagePrefix: string;
  artifactName: string;
  privilegePrefix: string;
  urlPath: string;
  listId: string;
  listType: string;
  osTypes: string[];
  entries: EntriesArray;
  createCriteria: {
    selector: string;
    value: string;
  };
  formNameInput: string;
  formDescriptionInput: string;
}

export const getArtifactTabCase = (kind: PolicyArtifactKind): ArtifactTabCase => {
  const artifact = ARTIFACT_TAB_CASES.find((item) => item.kind === kind);
  if (!artifact) {
    throw new Error(`Unknown artifact tab case: ${kind}`);
  }
  return artifact;
};

export const ARTIFACT_TAB_CASES: ArtifactTabCase[] = [
  {
    kind: 'trustedApps',
    title: 'Trusted applications',
    tabTestSubj: 'policyTrustedAppsTab',
    nextTabTestSubj: 'policyEventFiltersTab',
    pagePrefix: 'trustedAppsListPage',
    artifactName: 'Trusted application name',
    privilegePrefix: 'trusted_applications_',
    urlPath: 'trusted_apps',
    listId: ENDPOINT_ARTIFACT_LISTS.trustedApps.id,
    listType: ExceptionListTypeEnum.ENDPOINT,
    osTypes: ['windows'],
    entries: [
      {
        entries: [
          {
            field: 'trusted',
            operator: 'included',
            type: 'match',
            value: 'true',
          },
          {
            field: 'subject_name',
            operator: 'included',
            type: 'match',
            value: 'abcd',
          },
        ],
        field: 'process.Ext.code_signature',
        type: 'nested',
      },
    ],
    createCriteria: {
      selector: 'trustedAppsListPage-card-criteriaConditions',
      value: ` OSIS WindowsAND process.hash.*IS ${TRUSTED_APP_HASH}`,
    },
    formNameInput: 'trustedApps-form-nameTextField',
    formDescriptionInput: 'trustedApps-form-descriptionField',
  },
  {
    kind: 'eventFilters',
    title: 'Event Filters',
    tabTestSubj: 'policyEventFiltersTab',
    nextTabTestSubj: 'policyBlocklistTab',
    pagePrefix: 'EventFiltersListPage',
    artifactName: 'Event filter name',
    privilegePrefix: 'event_filters_',
    urlPath: 'event_filters',
    listId: ENDPOINT_ARTIFACT_LISTS.eventFilters.id,
    listType: ExceptionListTypeEnum.ENDPOINT_EVENTS,
    osTypes: ['windows'],
    entries: [
      {
        field: 'process.name',
        operator: 'included',
        type: 'match',
        value: 'notepad.exe',
      },
    ],
    createCriteria: {
      selector: 'EventFiltersListPage-card-criteriaConditions-condition',
      value: 'AND @timestampIS 1234',
    },
    formNameInput: 'eventFilters-form-name-input',
    formDescriptionInput: 'eventFilters-form-description-input',
  },
  {
    kind: 'blocklists',
    title: 'Blocklist',
    tabTestSubj: 'policyBlocklistTab',
    nextTabTestSubj: 'policyHostIsolationExceptionsTab',
    pagePrefix: 'blocklistPage',
    artifactName: 'Blocklist name',
    privilegePrefix: 'blocklist_',
    urlPath: 'blocklist',
    listId: ENDPOINT_ARTIFACT_LISTS.blocklists.id,
    listType: ExceptionListTypeEnum.ENDPOINT_BLOCKLISTS,
    osTypes: ['windows'],
    entries: [
      {
        field: 'file.hash.sha256',
        value: [TRUSTED_APP_HASH],
        type: 'match_any',
        operator: 'included',
      },
    ],
    createCriteria: {
      selector: 'blocklistPage-card-criteriaConditions',
      value: ` OSIS WindowsAND file.hash.*is one of ${TRUSTED_APP_HASH}`,
    },
    formNameInput: 'blocklist-form-name-input',
    formDescriptionInput: 'blocklist-form-description-input',
  },
  {
    kind: 'hostIsolationExceptions',
    title: 'Host isolation exceptions',
    tabTestSubj: 'policyHostIsolationExceptionsTab',
    nextTabTestSubj: 'policyTrustedAppsTab',
    pagePrefix: 'hostIsolationExceptionsListPage',
    artifactName: 'Host Isolation exception name',
    privilegePrefix: 'host_isolation_exceptions_',
    urlPath: 'host_isolation_exceptions',
    listId: ENDPOINT_ARTIFACT_LISTS.hostIsolationExceptions.id,
    listType: ExceptionListTypeEnum.ENDPOINT_HOST_ISOLATION_EXCEPTIONS,
    osTypes: ['windows', 'linux', 'macos'],
    entries: [
      {
        field: 'destination.ip',
        operator: 'included',
        type: 'match',
        value: '1.2.3.4',
      },
    ],
    createCriteria: {
      selector: 'hostIsolationExceptionsListPage-card-criteriaConditions',
      value: ' OSIS Windows, Linux, MacAND destination.ipIS 1.1.1.1',
    },
    formNameInput: 'hostIsolationExceptions-form-name-input',
    formDescriptionInput: 'hostIsolationExceptions-form-description-input',
  },
  {
    kind: 'trustedDevices',
    title: 'Trusted devices',
    tabTestSubj: 'policyTrustedDevicesTab',
    nextTabTestSubj: 'policyTrustedAppsTab',
    pagePrefix: 'trustedDevicesList',
    artifactName: 'Trusted device name',
    privilegePrefix: 'trusted_devices_',
    urlPath: 'trusted_devices',
    listId: ENDPOINT_ARTIFACT_LISTS.trustedDevices.id,
    listType: ExceptionListTypeEnum.ENDPOINT_TRUSTED_DEVICES,
    osTypes: ['windows', 'macos'],
    entries: [
      {
        field: 'host.name',
        operator: 'included',
        type: 'match',
        value: 'test-host',
      },
    ],
    createCriteria: {
      selector: 'trustedDevicesList-card-criteriaConditions',
      value: ' OSIS Windows, MacAND host.nameIS test-host',
    },
    formNameInput: 'trustedDevices-form-nameTextField',
    formDescriptionInput: 'trustedDevices-form-descriptionField',
  },
  {
    kind: 'endpointExceptions',
    title: 'Endpoint exceptions',
    tabTestSubj: 'policyEndpointExceptionsTab',
    nextTabTestSubj: 'policyProtectionUpdatesTab',
    pagePrefix: 'endpointExceptionsListPage',
    artifactName: 'Endpoint exception name',
    privilegePrefix: 'endpoint_exceptions_',
    urlPath: 'endpoint_exceptions',
    listId: ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id,
    listType: ExceptionListTypeEnum.ENDPOINT,
    osTypes: ['windows'],
    entries: [
      {
        field: 'process.name',
        operator: 'included',
        type: 'match',
        value: 'notepad.exe',
      },
    ],
    createCriteria: {
      selector: 'endpointExceptionsListPage-card-criteriaConditions-condition',
      value: 'AND agent.versionIS 1234',
    },
    formNameInput: 'endpointExceptions-form-name-input',
    formDescriptionInput: 'endpointExceptions-form-description-input',
  },
];
