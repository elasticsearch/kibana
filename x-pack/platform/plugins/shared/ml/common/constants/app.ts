/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const PLUGIN_ID = 'ml';
export const PLUGIN_ICON = 'machineLearningApp';
export const PLUGIN_ICON_SOLUTION = 'logoKibana';
export const ML_APP_NAME = i18n.translate('xpack.ml.navMenu.mlAppNameText', {
  defaultMessage: 'Machine Learning and Analytics',
});
export const ML_APP_ROUTE = '/app/ml';
export const ML_MANAGEMENT_APP_ROUTE = '/app/management/ml';
export const ML_INTERNAL_BASE_PATH = '/internal/ml';
export const ML_EXTERNAL_BASE_PATH = '/api/ml';

export type MlFeatures = Record<'ad' | 'dfa' | 'nlp', boolean>;
export type CompatibleModule = 'security' | 'observability' | 'search';
export type ExperimentalFeatures = Record<'ruleFormV2', boolean>;
export interface ModelDeploymentSettings {
  allowStaticAllocations: boolean;
  vCPURange: Record<
    'low' | 'medium' | 'high',
    {
      min: number;
      max: number;
      static?: number;
      maxThreads: number;
    }
  >;
}

export interface NLPSettings {
  modelDeployment?: ModelDeploymentSettings;
}

export interface ConfigSchema {
  ad?: { enabled: boolean };
  dfa?: { enabled: boolean };
  nlp?: {
    enabled: boolean;
    modelDeployment?: ModelDeploymentSettings;
  };
  compatibleModuleType?: CompatibleModule;
  experimental?: {
    ruleFormV2?: { enabled: boolean };
    anomalyDetectionSkill?: { enabled: boolean };
  };
}

export function initEnabledFeatures(enabledFeatures: MlFeatures, config: ConfigSchema) {
  if (config.ad?.enabled !== undefined) {
    enabledFeatures.ad = config.ad.enabled;
  }
  if (config.dfa?.enabled !== undefined) {
    enabledFeatures.dfa = config.dfa.enabled;
  }
  if (config.nlp?.enabled !== undefined) {
    enabledFeatures.nlp = config.nlp.enabled;
  }
}

export function initExperimentalFeatures(
  experimentalFeatures: ExperimentalFeatures,
  config: ConfigSchema
) {
  if (config.experimental?.ruleFormV2?.enabled !== undefined) {
    experimentalFeatures.ruleFormV2 = config.experimental.ruleFormV2.enabled;
  }
}

export function initModelDeploymentSettings(nlpSettings: NLPSettings, config: ConfigSchema) {
  if (config.nlp?.modelDeployment !== undefined) {
    nlpSettings.modelDeployment = config.nlp.modelDeployment;
  }
}
