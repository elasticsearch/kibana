/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as rt from 'io-ts';

import type { SavedObject } from '@kbn/core/server';
import type {
  CaseConnector,
  CaseCustomFields,
  CaseSeverity,
  ConfigurationAttributes,
} from '../../../common/types/domain';
import {
  ConfigurationActivityFieldsRt,
  ConfigurationAttributesRt,
  ConfigurationBasicWithoutOwnerRt,
} from '../../../common/types/domain';
import type { ConnectorPersisted } from './connectors';
import type { User, UserProfile } from './user';

export interface ConfigurationPersistedAttributes {
  connector: ConnectorPersisted;
  closure_type: string;
  owner: string;
  created_at: string;
  created_by: User;
  updated_at: string | null;
  updated_by: User | null;
  customFields?: PersistedCustomFieldsConfiguration;
  templates?: PersistedTemplatesConfiguration;
  observableTypes?: PersistedObservableTypesConfiguration;
  legacyTemplatesMigrated?: boolean;
  legacyCustomFieldsMigrated?: boolean;
}

type PersistedObservableTypesConfiguration = Array<{
  key: string;
  label: string;
}>;

type PersistedCustomFieldsConfiguration = Array<{
  key: string;
  type: string;
  label: string;
  required: boolean;
  defaultValue?: string | number | boolean | null;
}>;

type PersistedTemplatesConfiguration = Array<{
  key: string;
  name: string;
  description?: string;
  tags?: string[];
  caseFields?: CaseFieldsAttributes | null;
}>;

export interface CaseFieldsAttributes {
  title?: string;
  assignees?: UserProfile[];
  connector?: CaseConnector;
  description?: string;
  severity?: CaseSeverity;
  tags?: string[];
  category?: string | null;
  customFields?: CaseCustomFields;
  settings?: { syncAlerts: boolean; extractObservables?: boolean };
}

export type ConfigurationTransformedAttributes = ConfigurationAttributes;
export type ConfigurationSavedObjectTransformed = SavedObject<ConfigurationTransformedAttributes>;

export const ConfigurationPartialAttributesRt = rt.intersection([
  rt.exact(rt.partial(ConfigurationBasicWithoutOwnerRt.type.props)),
  rt.exact(rt.partial(ConfigurationActivityFieldsRt.type.props)),
  rt.exact(
    rt.partial({
      owner: rt.string,
    })
  ),
]);

export const ConfigurationTransformedAttributesRt = ConfigurationAttributesRt;
