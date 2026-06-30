/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IconType, UseEuiTheme } from '@elastic/eui';
import { AssistantIcon } from '@kbn/ai-assistant-icon';
import { i18n } from '@kbn/i18n';
import { getBuiltInStepDefinition, isDynamicConnector, StepCategory } from '@kbn/workflows';
import type { WorkflowsExtensionsPublicPluginStart } from '@kbn/workflows-extensions/public';
import { getAllConnectors, isDeprecatedStepType } from '../../../../common/schema';
import { triggerSchemas } from '../../../trigger_schemas';
import type { ActionConnectorGroup, ActionGroup, ActionOptionData } from '../types';
import { isActionGroup } from '../types';

function getBuiltInNestedFlowControlStepOptions(
  euiTheme: UseEuiTheme['euiTheme']
): ActionOptionData[] {
  return (['waitForApproval', 'workflow.execute', 'workflow.executeAsync'] as const)
    .map((stepId) => getBuiltInStepDefinition(stepId))
    .filter((def): def is NonNullable<typeof def> => def !== undefined)
    .map((def) => ({
      id: def.id,
      label: def.label,
      description: def.description,
      iconType: 'nested' as const,
      iconColor: euiTheme.colors.vis.euiColorVis0,
      stability: def.stability,
    }));
}

function buildTriggersGroup(euiTheme: UseEuiTheme['euiTheme']): ActionOptionData {
  const builtInTriggerOptions: ActionOptionData[] = [
    {
      id: 'manual',
      label: i18n.translate('workflows.actionsMenu.manual', {
        defaultMessage: 'Manual',
      }),
      description: i18n.translate('workflows.actionsMenu.manualDescription', {
        defaultMessage: 'Trigger - Manually start from the UI',
      }),
      iconType: 'play',
      iconColor: 'success',
    },
    {
      id: 'alert',
      label: i18n.translate('workflows.actionsMenu.alert', {
        defaultMessage: 'Alert',
      }),
      description: i18n.translate('workflows.actionsMenu.alertDescription', {
        defaultMessage: 'Trigger - When an alert from rule is created',
      }),
      iconType: 'bell',
      iconColor: euiTheme.colors.vis.euiColorVis6,
    },
    {
      id: 'scheduled',
      label: i18n.translate('workflows.actionsMenu.schedule', {
        defaultMessage: 'Schedule',
      }),
      description: i18n.translate('workflows.actionsMenu.scheduleDescription', {
        defaultMessage: 'Trigger - On a schedule (e.g. every 10 minutes)',
      }),
      iconType: 'clock',
      iconColor: euiTheme.colors.textParagraph,
    },
  ];
  const registeredTriggerOptions: ActionOptionData[] = triggerSchemas
    .getTriggerDefinitions()
    .map((t) => ({
      id: t.id,
      label: t.title ?? t.id,
      description: t.description ?? t.id,
      iconType: (t.icon != null ? t.icon : 'bolt') as IconType,
      iconColor: euiTheme.colors.vis.euiColorVis6,
      stability: 'tech_preview',
    }));

  return {
    iconType: 'bolt',
    iconColor: euiTheme.colors.vis.euiColorVis6,
    id: 'triggers',
    label: i18n.translate('workflows.actionsMenu.triggers', {
      defaultMessage: 'Triggers',
    }),
    description: i18n.translate('workflows.actionsMenu.triggersDescription', {
      defaultMessage: 'Choose which event starts a workflow',
    }),
    options: [...builtInTriggerOptions, ...registeredTriggerOptions],
  };
}

function mergeNestedStepGroups(stepGroups: Record<StepCategory, ActionGroup>): void {
  for (const group of Object.values(stepGroups)) {
    if (group.nestedGroups) {
      for (const nestedGroup of group.nestedGroups) {
        if (nestedGroup.options.length > 0) {
          group.options.unshift(nestedGroup);
        }
      }
    }
  }
}

export function getActionOptions(
  euiTheme: UseEuiTheme['euiTheme'],
  workflowsExtensions: WorkflowsExtensionsPublicPluginStart
): ActionOptionData[] {
  const connectors = getAllConnectors();
  const triggersGroup = buildTriggersGroup(euiTheme);

  const kibanaCasesGroup: ActionGroup = {
    iconType: 'briefcase',
    id: 'kibana.cases',
    label: i18n.translate('workflows.actionsMenu.kibanaCases', {
      defaultMessage: 'Cases',
    }),
    description: i18n.translate('workflows.actionsMenu.kibanaCasesDescription', {
      defaultMessage: 'Create and manage cases from your workflow',
    }),
    options: [],
  };

  const kibanaSecurityGroup: ActionGroup = {
    iconType: 'securityApp',
    id: 'kibana.security',
    label: i18n.translate('workflows.actionsMenu.kibanaSecurity', {
      defaultMessage: 'Security',
    }),
    description: i18n.translate('workflows.actionsMenu.kibanaSecurityDescription', {
      defaultMessage: 'Work with Security data and features directly from your workflow',
    }),
    options: [],
  };

  const kibanaGroup: ActionGroup = {
    iconType: 'logoKibana',
    id: 'kibana',
    label: i18n.translate('workflows.actionsMenu.kibana', {
      defaultMessage: 'Kibana',
    }),
    description: i18n.translate('workflows.actionsMenu.kibanaDescription', {
      defaultMessage: 'Work with Kibana data and features directly from your workflow',
    }),
    options: [],
    nestedGroups: [kibanaCasesGroup, kibanaSecurityGroup],
  };
  const externalGroup: ActionOptionData = {
    iconType: 'plugs',
    iconColor: euiTheme.colors.vis.euiColorVis0,
    id: 'external',
    label: i18n.translate('workflows.actionsMenu.external', {
      defaultMessage: 'External Systems & Apps',
    }),
    description: i18n.translate('workflows.actionsMenu.externalDescription', {
      defaultMessage: 'Automate actions in external systems and apps.',
    }),
    options: [],
  };
  const aiGroup: ActionOptionData = {
    iconType: AssistantIcon,
    id: 'ai',
    label: i18n.translate('workflows.actionsMenu.ai', {
      defaultMessage: 'AI',
    }),
    description: i18n.translate('workflows.actionsMenu.aiDescription', {
      defaultMessage: 'Use AI to automate your workflows and get insights into your data',
    }),
    options: [],
  };
  const dataTransformationGroup: ActionOptionData = {
    iconType: 'pencil',
    iconColor: euiTheme.colors.vis.euiColorVis0,
    id: 'data',
    label: i18n.translate('workflows.actionsMenu.dataTransformation', {
      defaultMessage: 'Data transformation',
    }),
    description: i18n.translate('workflows.actionsMenu.dataTransformationDescription', {
      defaultMessage: 'Manipulate and convert your data',
    }),
    options: [
      {
        id: 'data.set',
        label: i18n.translate('workflows.actionsMenu.dataSet', {
          defaultMessage: 'Set Variables',
        }),
        description: i18n.translate('workflows.actionsMenu.dataSetDescription', {
          defaultMessage: 'Define or compute variables to use in your workflow',
        }),
        iconType: 'database',
      },
    ],
  };
  const flowControlGroup: ActionOptionData = {
    iconType: 'branch',
    iconColor: euiTheme.colors.vis.euiColorVis0,
    id: 'flowControl',
    label: i18n.translate('workflows.actionsMenu.aggregations', {
      defaultMessage: 'Flow Control',
    }),
    description: i18n.translate('workflows.actionsMenu.flowControlDescription', {
      defaultMessage: 'Control your workflow with logic, delays, looping, and more',
    }),
    options: [
      {
        id: 'if',
        label: i18n.translate('workflows.actionsMenu.if', {
          defaultMessage: 'If Condition',
        }),
        description: i18n.translate('workflows.actionsMenu.ifDescription', {
          defaultMessage: 'Define condition with KQL to execute the action',
        }),
        iconType: 'branch',
        iconColor: euiTheme.colors.vis.euiColorVis0,
      },
      {
        id: 'switch',
        label: i18n.translate('workflows.actionsMenu.switch', {
          defaultMessage: 'Switch',
        }),
        description: i18n.translate('workflows.actionsMenu.switchDescription', {
          defaultMessage: 'Multi-way branching based on expression value matching',
        }),
        iconType: 'productStreamsWired',
        iconColor: euiTheme.colors.vis.euiColorVis0,
      },
      {
        id: 'foreach',
        label: i18n.translate('workflows.actionsMenu.foreach', {
          defaultMessage: 'Loop (foreach)',
        }),
        description: i18n.translate('workflows.actionsMenu.loopDescription', {
          defaultMessage: 'Iterate the action over a specified list',
        }),
        iconType: 'refresh',
        iconColor: euiTheme.colors.vis.euiColorVis0,
      },
      {
        id: 'while',
        label: i18n.translate('workflows.actionsMenu.while', {
          defaultMessage: 'While Loop',
        }),
        description: i18n.translate('workflows.actionsMenu.whileDescription', {
          defaultMessage: 'Repeat steps while a condition is true',
        }),
        iconType: 'refresh',
        iconColor: euiTheme.colors.vis.euiColorVis0,
      },
      {
        id: 'wait',
        label: i18n.translate('workflows.actionsMenu.wait', {
          defaultMessage: 'Wait',
        }),
        description: i18n.translate('workflows.actionsMenu.waitDescription', {
          defaultMessage: 'Pause for a specified amount of time before continuing',
        }),
        iconType: 'clock',
        iconColor: euiTheme.colors.vis.euiColorVis0,
      },
      {
        id: 'waitForInput',
        label: i18n.translate('workflows.actionsMenu.waitForInput', {
          defaultMessage: 'Wait For Input',
        }),
        description: i18n.translate('workflows.actionsMenu.waitForInputDescription', {
          defaultMessage: 'Pause execution until external input is provided (human-in-the-loop)',
        }),
        iconType: 'user',
        iconColor: euiTheme.colors.vis.euiColorVis0,
      },
      ...getBuiltInNestedFlowControlStepOptions(euiTheme),
    ],
  };
  const elasticSearchGroup: ActionOptionData = {
    iconType: 'logoElasticsearch',
    id: 'elasticsearch',
    label: i18n.translate('workflows.actionsMenu.elasticsearch', {
      defaultMessage: 'Elasticsearch',
    }),
    description: i18n.translate('workflows.actionsMenu.elasticsearchDescription', {
      defaultMessage: 'Work with Elastic data and features directly from your workflow',
    }),
    options: [],
  };

  const stepGroups: Record<StepCategory, ActionGroup> = {
    [StepCategory.Elasticsearch]: elasticSearchGroup,
    [StepCategory.External]: externalGroup,
    [StepCategory.Ai]: aiGroup,
    [StepCategory.Kibana]: kibanaGroup,
    [StepCategory.KibanaCases]: kibanaCasesGroup,
    [StepCategory.KibanaSecurity]: kibanaSecurityGroup,
    [StepCategory.Data]: dataTransformationGroup,
    [StepCategory.FlowControl]: flowControlGroup,
  };

  const baseTypeInstancesCount: Record<string, number> = {};

  for (const connector of connectors) {
    if (!isDeprecatedStepType(connector.type)) {
      const customStepDefinition = workflowsExtensions.getStepDefinition(connector.type);
      if (customStepDefinition) {
        const group = stepGroups[customStepDefinition.category];
        group.options.push({
          id: customStepDefinition.id,
          label: customStepDefinition.label,
          description: customStepDefinition.description,
          iconType: customStepDefinition.icon ?? group.iconType,
          stability: connector.stability,
        });
      } else if (connector.type.startsWith('elasticsearch.')) {
        elasticSearchGroup.options.push({
          id: connector.type,
          label: connector.description || connector.type,
          description: connector.type,
          iconType: 'logoElasticsearch',
          stability: connector.stability,
        });
      } else if (connector.type.startsWith('kibana.')) {
        kibanaGroup.options.push({
          id: connector.type,
          label: connector.summary || connector.description || connector.type,
          description: connector.type,
          iconType: 'logoKibana',
          stability: connector.stability,
        });
      } else if (isDynamicConnector(connector)) {
        const baseType = connector.actionTypeId.replace(/^\./, '');
        const hasSubAction = connector.type.startsWith(`${baseType}.`);
        let groupOption = externalGroup;
        if (hasSubAction) {
          let connectorGroup = externalGroup.options.find((option) => option.id === baseType);
          // create a group for the basetype if not yet exists
          if (!connectorGroup) {
            baseTypeInstancesCount[baseType] = 0;
            const newConnectorGroup: ActionConnectorGroup = {
              id: baseType,
              label: connector.displayName,
              description: connector.actionTypeId.replace(/^\./, ''),
              connectorType: connector.actionTypeId,
              options: [],
            };
            connectorGroup = newConnectorGroup;
            externalGroup.options.push(newConnectorGroup);
          }
          // We know connectorGroup is an ActionGroup because we either found it in options
          // (which are ActionOptionData[]) or we just created it with the options property
          if (isActionGroup(connectorGroup)) {
            groupOption = connectorGroup;
          }
        }
        baseTypeInstancesCount[baseType] += connector.instances?.length || 0;
        groupOption.instancesLabel = getInstancesLabel(baseTypeInstancesCount[baseType]);

        // groupOption is always an ActionGroup here (either externalGroup or a validated connectorGroup)
        if (isActionGroup(groupOption)) {
          groupOption.options.push({
            id: connector.type,
            label: connector.summary || connector.displayName,
            description: connector.type,
            connectorType: connector.actionTypeId,
            instancesLabel: getInstancesLabel(connector.instances?.length),
            stability: connector.stability,
          });
        }
      }
    }
  }

  mergeNestedStepGroups(stepGroups);

  const topLevelOptions: ActionOptionData[] = [
    triggersGroup,
    elasticSearchGroup,
    kibanaGroup,
    aiGroup,
    dataTransformationGroup,
    externalGroup,
    flowControlGroup,
  ];
  assignActionPathIds(topLevelOptions);
  return topLevelOptions;
}

/**
 * Sets `pathIds` on every nested group so navigation works when a group is chosen from search
 * (full ancestor chain, not only the clicked row's id).
 */
function assignActionPathIds(
  options: ActionOptionData[],
  parentPath: readonly string[] = []
): void {
  for (const opt of options) {
    if ('options' in opt) {
      opt.pathIds = [...parentPath, opt.id];
      assignActionPathIds(opt.options, opt.pathIds);
    }
  }
}

export function flattenOptions(options: ActionOptionData[]): ActionOptionData[] {
  return options
    .map((option) => [option, ...flattenOptions(isActionGroup(option) ? option.options : [])])
    .flat();
}

function getInstancesLabel(instancesCount: number | undefined): string | undefined {
  if (!instancesCount) {
    return undefined;
  }
  if (instancesCount === 0) {
    return i18n.translate('workflows.actionsMenu.noInstances', {
      defaultMessage: 'Not connected',
    });
  }
  if (instancesCount === 1) {
    return i18n.translate('workflows.actionsMenu.oneInstance', {
      defaultMessage: '1 connected',
    });
  }
  return i18n.translate('workflows.actionsMenu.multipleInstances', {
    defaultMessage: '{count} connected',
    values: { count: instancesCount },
  });
}
