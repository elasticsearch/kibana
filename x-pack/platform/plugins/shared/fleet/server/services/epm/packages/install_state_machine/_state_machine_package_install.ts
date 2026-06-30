/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type {
  ElasticsearchClient,
  Logger,
  SavedObject,
  SavedObjectsClientContract,
  KibanaRequest,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';

import { PackageSavedObjectConflictError } from '../../../../errors';
import { INSTALL_STATES } from '../../../../../common/types';
import type { PackageInstallContext, StateNames, StateContext } from '../../../../../common/types';
import type { PackageAssetReference } from '../../../../types';

import type {
  Installation,
  InstallType,
  InstallSource,
  PackageVerificationResult,
  EsAssetReference,
  KibanaAssetReference,
  IndexTemplateEntry,
  AssetReference,
} from '../../../../types';

import { appContextService } from '../../..';

import {
  stepCreateRestartInstallation,
  stepInstallKibanaAssets,
  stepInstallILMPolicies,
  stepInstallMlModel,
  stepInstallIndexTemplatePipelines,
  stepRemoveLegacyTemplates,
  stepUpdateCurrentWriteIndices,
  stepInstallTransforms,
  stepDeletePreviousPipelines,
  stepSaveArchiveEntries,
  stepSaveKnowledgeBase,
  stepResolveKibanaPromise,
  stepSaveSystemObject,
  updateLatestExecutedState,
  cleanupLatestExecutedState,
  cleanUpKibanaAssetsStep,
  cleanUpUnusedKibanaAssetsStep,
  cleanupILMPoliciesStep,
  cleanUpMlModelStep,
  cleanupIndexTemplatePipelinesStep,
  cleanupTransformsStep,
  cleanupArchiveEntriesStep,
  cleanupKnowledgeBaseStep,
  stepInstallKibanaAssetsWithStreaming,
  stepInstallPrecheck,
  stepVerifyAssets,
} from './steps';
import type { StateMachineDefinition, StateMachineStates } from './state_machine';
import { handleState } from './state_machine';
import { stepCreateAlertingAssets } from './steps/step_create_alerting_assets';
import { cleanupEsqlViewsStep, stepInstallEsqlViews } from './steps/step_install_esql_views';
import { stepResolveDependencies } from './steps/step_resolve_dependencies';

export interface InstallContext extends StateContext<StateNames> {
  savedObjectsClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  logger: Logger;
  installedPkg?: SavedObject<Installation>;
  packageInstallContext: PackageInstallContext;
  installType: InstallType;
  installSource: InstallSource;
  spaceId: string;
  force?: boolean;
  verificationResult?: PackageVerificationResult;
  request?: KibanaRequest;
  ignoreMappingUpdateErrors?: boolean;
  skipDataStreamRollover?: boolean;
  retryFromLastState?: boolean;
  initialState?: INSTALL_STATES;
  useStreaming?: boolean;

  indexTemplates?: IndexTemplateEntry[];
  packageAssetRefs?: PackageAssetReference[];
  // output values
  esReferences?: EsAssetReference[];
  kibanaAssetPromise?: Promise<KibanaAssetReference[]>;
  skipDependencyCheck?: boolean;
}
/**
 * This data structure defines the sequence of the states and the transitions
 */
export const regularStatesDefinition: StateMachineStates<StateNames> = {
  create_restart_installation: {
    nextState: INSTALL_STATES.RESOLVE_DEPENDENCIES,
    onTransition: stepCreateRestartInstallation,
    onPostTransition: updateLatestExecutedState,
  },
  resolve_dependencies: {
    onTransition: stepResolveDependencies,
    nextState: INSTALL_STATES.INSTALL_PRECHECK,
    onPostTransition: updateLatestExecutedState,
  },
  install_precheck: {
    onTransition: stepInstallPrecheck,
    nextState: INSTALL_STATES.INSTALL_ESQL_VIEWS,
    onPostTransition: updateLatestExecutedState,
  },
  install_esql_views: {
    onPreTransition: cleanupEsqlViewsStep,
    onTransition: stepInstallEsqlViews,
    nextState: INSTALL_STATES.INSTALL_KIBANA_ASSETS,
    onPostTransition: updateLatestExecutedState,
  },
  install_kibana_assets: {
    onPreTransition: cleanUpKibanaAssetsStep,
    onTransition: stepInstallKibanaAssets,
    nextState: INSTALL_STATES.INSTALL_ILM_POLICIES,
    onPostTransition: updateLatestExecutedState,
  },
  install_ilm_policies: {
    onPreTransition: cleanupILMPoliciesStep,
    onTransition: stepInstallILMPolicies,
    nextState: INSTALL_STATES.INSTALL_ML_MODEL,
    onPostTransition: updateLatestExecutedState,
  },
  install_ml_model: {
    onPreTransition: cleanUpMlModelStep,
    onTransition: stepInstallMlModel,
    nextState: INSTALL_STATES.INSTALL_INDEX_TEMPLATE_PIPELINES,
    onPostTransition: updateLatestExecutedState,
  },
  install_index_template_pipelines: {
    onPreTransition: cleanupIndexTemplatePipelinesStep,
    onTransition: stepInstallIndexTemplatePipelines,
    nextState: INSTALL_STATES.REMOVE_LEGACY_TEMPLATES,
    onPostTransition: updateLatestExecutedState,
  },
  remove_legacy_templates: {
    onTransition: stepRemoveLegacyTemplates,
    nextState: INSTALL_STATES.UPDATE_CURRENT_WRITE_INDICES,
    onPostTransition: updateLatestExecutedState,
  },
  update_current_write_indices: {
    onTransition: stepUpdateCurrentWriteIndices,
    nextState: INSTALL_STATES.INSTALL_TRANSFORMS,
    onPostTransition: updateLatestExecutedState,
  },
  install_transforms: {
    onPreTransition: cleanupTransformsStep,
    onTransition: stepInstallTransforms,
    nextState: INSTALL_STATES.DELETE_PREVIOUS_PIPELINES,
    onPostTransition: updateLatestExecutedState,
  },
  delete_previous_pipelines: {
    onTransition: stepDeletePreviousPipelines,
    nextState: INSTALL_STATES.SAVE_ARCHIVE_ENTRIES,
    onPostTransition: updateLatestExecutedState,
  },
  save_archive_entries_from_assets_map: {
    onPreTransition: cleanupArchiveEntriesStep,
    onTransition: stepSaveArchiveEntries,
    nextState: INSTALL_STATES.SAVE_KNOWLEDGE_BASE,
    onPostTransition: updateLatestExecutedState,
  },
  save_knowledge_base: {
    onPreTransition: cleanupKnowledgeBaseStep,
    onTransition: stepSaveKnowledgeBase,
    nextState: INSTALL_STATES.RESOLVE_KIBANA_PROMISE,
    onPostTransition: updateLatestExecutedState,
    isAsync: true, // Knowledge base indexing runs in background
  },
  resolve_kibana_promise: {
    onTransition: stepResolveKibanaPromise,
    nextState: INSTALL_STATES.CREATE_ALERTING_ASSETS,
    onPostTransition: updateLatestExecutedState,
  },
  create_alerting_assets: {
    onTransition: stepCreateAlertingAssets,
    nextState: INSTALL_STATES.VERIFY_ASSETS,
    onPostTransition: updateLatestExecutedState,
  },
  verify_assets: {
    onTransition: stepVerifyAssets,
    nextState: INSTALL_STATES.UPDATE_SO,
    onPostTransition: updateLatestExecutedState,
  },
  update_so: {
    onTransition: stepSaveSystemObject,
    nextState: 'end',
    onPostTransition: updateLatestExecutedState,
  },
};

export const streamingStatesDefinition: StateMachineStates<string> = {
  create_restart_installation: {
    nextState: INSTALL_STATES.INSTALL_KIBANA_ASSETS,
    onTransition: stepCreateRestartInstallation,
    onPostTransition: updateLatestExecutedState,
  },
  install_kibana_assets: {
    onTransition: stepInstallKibanaAssetsWithStreaming,
    nextState: INSTALL_STATES.SAVE_ARCHIVE_ENTRIES,
    onPostTransition: updateLatestExecutedState,
  },
  save_archive_entries_from_assets_map: {
    onPreTransition: cleanupArchiveEntriesStep,
    onTransition: stepSaveArchiveEntries,
    nextState: INSTALL_STATES.SAVE_KNOWLEDGE_BASE,
    onPostTransition: updateLatestExecutedState,
  },
  save_knowledge_base: {
    onPreTransition: cleanupKnowledgeBaseStep,
    onTransition: stepSaveKnowledgeBase,
    nextState: INSTALL_STATES.VERIFY_ASSETS,
    onPostTransition: updateLatestExecutedState,
    isAsync: true, // Knowledge base indexing runs in background
  },
  verify_assets: {
    onTransition: stepVerifyAssets,
    nextState: INSTALL_STATES.UPDATE_SO,
    onPostTransition: updateLatestExecutedState,
  },
  update_so: {
    onPreTransition: cleanUpUnusedKibanaAssetsStep,
    onTransition: stepSaveSystemObject,
    nextState: 'end',
    onPostTransition: updateLatestExecutedState,
  },
};

/*
 * _stateMachineInstallPackage installs packages using the generic state machine in ./state_machine
 * installStates is the data structure providing the state machine definition
 * Usually the install process starts with `create_restart_installation` and continues based on nextState parameter in the definition
 * The `onTransition` functions are the steps executed to go from one state to another, and all accept an `InstallContext` object as input parameter
 * After each transition `updateLatestExecutedState` is executed, it updates the executed state in the SO
 */
export async function _stateMachineInstallPackage(
  context: InstallContext
): Promise<AssetReference[]> {
  const { installedPkg, retryFromLastState, force } = context;
  const logger = appContextService.getLogger();
  let initialState = INSTALL_STATES.CREATE_RESTART_INSTALLATION;

  const statesDefinition = context.useStreaming
    ? streamingStatesDefinition
    : regularStatesDefinition;

  // if retryFromLastState, restart install from last install state
  // if force is passed, the install should be executed from the beginning
  if (retryFromLastState && !force && installedPkg?.attributes?.latest_executed_state?.name) {
    initialState = findNextState(
      installedPkg.attributes.latest_executed_state.name,
      statesDefinition
    );
    logger.debug(
      `Install with retryFromLastState option - Initial installation state: ${initialState}`
    );
    // we need to clean up latest_executed_state or it won't be refreshed
    await cleanupLatestExecutedState(context);
  }

  const installStates: StateMachineDefinition<StateNames> = {
    // inject initial state inside context
    context: { ...context, initialState },
    states: statesDefinition,
  };

  try {
    const { installedKibanaAssetsRefs, esReferences } = await handleState(
      initialState!,
      installStates,
      installStates.context
    );

    return [
      ...(installedKibanaAssetsRefs ? (installedKibanaAssetsRefs as KibanaAssetReference[]) : []),
      ...(esReferences ? (esReferences as EsAssetReference[]) : []),
    ];
  } catch (err) {
    const { packageInfo } = installStates.context.packageInstallContext;
    const { name: pkgName, version: pkgVersion } = packageInfo;

    if (SavedObjectsErrorHelpers.isConflictError(err)) {
      throw new PackageSavedObjectConflictError(
        `Saved Object conflict encountered while installing ${pkgName || 'unknown'}-${
          pkgVersion || 'unknown'
        }. There may be a conflicting Saved Object saved to another Space. Original error: ${
          err.message
        }`
      );
    } else {
      throw err;
    }
  }
}

const findNextState = (latestExecutedState: StateNames, states: StateMachineStates<StateNames>) => {
  return states[latestExecutedState].nextState! as StateNames;
};
