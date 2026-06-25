/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DEFAULT_APP_CATEGORIES } from '@kbn/core-application-common';
import type { KibanaFeatureConfig } from '@kbn/features-plugin/common';
import { i18n } from '@kbn/i18n';
import {
  WORKFLOWS_MANAGEMENT_FEATURE_ID,
  WorkflowsManagementApiActions,
  WorkflowsManagementUiActions,
} from '@kbn/workflows';

// The kibana feature configuration for the Workflows Management plugin.
export const WorkflowsManagementFeatureConfig: KibanaFeatureConfig = {
  id: WORKFLOWS_MANAGEMENT_FEATURE_ID,
  name: i18n.translate(
    'platform.plugins.shared.workflows_management.featureRegistry.workflowsManagementFeatureName',
    { defaultMessage: 'Workflows' }
  ),
  category: DEFAULT_APP_CATEGORIES.kibana,
  app: [],
  order: 3000,
  minimumLicense: 'enterprise',
  privileges: {
    // Nothing at top level privileges, all specific actions are managed by sub_features privileges below
    all: { app: [], api: [], savedObject: { all: [], read: [] }, ui: [] },
    read: { app: [], api: [], savedObject: { all: [], read: [] }, ui: [] },
  },
  subFeatures: [
    {
      name: i18n.translate(
        'platform.plugins.shared.workflows_management.featureRegistry.workflowsManagementSubFeatureName',
        { defaultMessage: 'Workflows Actions' }
      ),
      privilegeGroups: [
        {
          groupType: 'independent',
          privileges: [
            {
              id: 'workflow_create',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.createWorkflowSubFeaturePrivilege',
                { defaultMessage: 'Create' }
              ),
              includeIn: 'all',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.create],
              ui: [WorkflowsManagementUiActions.create],
            },
            {
              id: 'workflow_update',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.updateWorkflowSubFeaturePrivilege',
                { defaultMessage: 'Update' }
              ),
              includeIn: 'all',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.update],
              ui: [WorkflowsManagementUiActions.update],
            },
            {
              id: 'workflow_delete',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.deleteWorkflowSubFeaturePrivilege',
                { defaultMessage: 'Delete' }
              ),
              includeIn: 'all',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.delete],
              ui: [WorkflowsManagementUiActions.delete],
            },
            {
              id: 'workflow_execute',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.executeWorkflowSubFeaturePrivilege',
                { defaultMessage: 'Execute' }
              ),
              includeIn: 'all',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.execute],
              ui: [WorkflowsManagementUiActions.execute],
            },
            {
              id: 'workflow_read',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.readWorkflowSubFeaturePrivilege',
                { defaultMessage: 'Read' }
              ),
              includeIn: 'read',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.read],
              ui: [WorkflowsManagementUiActions.read],
            },
            {
              id: 'workflow_execution_read',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.readWorkflowExecutionSubFeaturePrivilege',
                { defaultMessage: 'Read Workflow Execution' }
              ),
              includeIn: 'read',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.readExecution],
              ui: [WorkflowsManagementUiActions.readExecution],
            },
            {
              id: 'workflow_execution_cancel',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.cancelWorkflowExecutionSubFeaturePrivilege',
                { defaultMessage: 'Cancel Workflow Execution' }
              ),
              includeIn: 'all',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.cancelExecution],
              ui: [WorkflowsManagementUiActions.cancelExecution],
            },
          ],
        },
      ],
    },
    {
      name: i18n.translate(
        'platform.plugins.shared.workflows_management.featureRegistry.managedWorkflowsSubFeatureName',
        { defaultMessage: 'Managed Workflows Actions' }
      ),
      description: i18n.translate(
        'platform.plugins.shared.workflows_management.featureRegistry.managedWorkflowsSubFeatureDescription',
        { defaultMessage: 'Managed workflow actions need explicit assignment' }
      ),
      privilegeGroups: [
        {
          groupType: 'independent',
          privileges: [
            {
              id: 'workflow_read_managed',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.readManagedWorkflowsSubFeaturePrivilege',
                { defaultMessage: 'Read managed workflows' }
              ),
              includeIn: 'read',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.readManaged],
              ui: [WorkflowsManagementUiActions.readManaged],
            },
            {
              id: 'workflow_execution_read_managed',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.readManagedWorkflowExecutionSubFeaturePrivilege',
                { defaultMessage: 'Read managed workflow execution' }
              ),
              includeIn: 'read',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.readManagedExecution],
              ui: [WorkflowsManagementUiActions.readManagedExecution],
            },
            {
              id: 'workflow_update_managed',
              name: i18n.translate(
                'platform.plugins.shared.workflows_management.featureRegistry.updateManagedWorkflowsSubFeaturePrivilege',
                { defaultMessage: 'Update managed workflows' }
              ),
              includeIn: 'none',
              savedObject: { all: [], read: [] },
              api: [WorkflowsManagementApiActions.updateManaged],
              ui: [],
            },
          ],
        },
      ],
    },
  ],
};
