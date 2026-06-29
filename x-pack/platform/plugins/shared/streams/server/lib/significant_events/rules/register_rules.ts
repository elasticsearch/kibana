/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mappingFromFieldMap } from '@kbn/alerting-plugin/common';
import { alertFieldMap } from '@kbn/alerts-as-data-utils';
import type { Logger } from '@kbn/core/server';
import { Dataset, createPersistenceRuleTypeWrapper } from '@kbn/rule-registry-plugin/server';
import {
  STREAMS_FEATURE_ID,
  STREAMS_RULE_REGISTRATION_CONTEXT,
} from '../../../../common/constants';
import type { StreamsPluginSetupDependencies } from '../../../types';
import { esqlRuleType } from './esql/register';

interface Props {
  plugins: StreamsPluginSetupDependencies;
  logger: Logger;
}

export function registerRules({ plugins, logger }: Props) {
  const ruleDataClient = plugins.ruleRegistry.ruleDataService.initializeIndex({
    feature: STREAMS_FEATURE_ID,
    registrationContext: STREAMS_RULE_REGISTRATION_CONTEXT,
    dataset: Dataset.alerts,
    componentTemplateRefs: [],
    componentTemplates: [
      {
        name: 'mappings',
        mappings: mappingFromFieldMap(alertFieldMap, false),
      },
    ],
  });

  const persistenceRuleTypeWrapper = createPersistenceRuleTypeWrapper({
    ruleDataClient,
    logger,
    formatAlert: undefined,
  });

  plugins.alerting.registerType(persistenceRuleTypeWrapper(esqlRuleType()));
}
