/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiThemeComputed } from '@elastic/eui';
import { isDynamicConnector, StepCategory } from '@kbn/workflows';
import type { WorkflowsExtensionsPublicPluginStart } from '@kbn/workflows-extensions/public';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/public/mocks';
import { z } from '@kbn/zod/v4';
import { flattenOptions, getActionOptions } from './get_action_options';
import { getAllConnectors, isDeprecatedStepType } from '../../../../common/schema';
import { triggerSchemas } from '../../../trigger_schemas';
import type { ActionOptionData } from '../types';
import { isActionGroup, isActionOption } from '../types';

jest.mock('../../../../common/schema', () => ({
  getAllConnectors: jest.fn(),
  isDeprecatedStepType: jest.fn(() => false),
}));
jest.mock('../../../trigger_schemas', () => ({
  triggerSchemas: { getTriggerDefinitions: jest.fn(() => []) },
}));
jest.mock('@kbn/workflows', () => ({
  ...jest.requireActual('@kbn/workflows'),
  isDynamicConnector: jest.fn(),
}));
jest.mock('@kbn/i18n', () => ({
  i18n: {
    translate: jest.fn(
      (key: string, { defaultMessage }: { defaultMessage: string }) => defaultMessage
    ),
  },
}));

describe('getActionOptions', () => {
  const mockEuiTheme = {
    colors: {
      vis: {
        euiColorVis0: '#color0',
        euiColorVis6: '#color6',
      },
      textParagraph: '#textColor',
    },
  } as unknown as EuiThemeComputed<{}>;

  let mockWorkflowsExtensions: jest.Mocked<WorkflowsExtensionsPublicPluginStart>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkflowsExtensions = workflowsExtensionsMock.createStart();

    (getAllConnectors as jest.Mock).mockReturnValue([]);
    (isDeprecatedStepType as jest.Mock).mockReturnValue(false);
    (isDynamicConnector as jest.MockedFunction<typeof isDynamicConnector>).mockImplementation(
      () => false
    );
  });

  it('should return all base action groups', () => {
    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);

    expect(result).toHaveLength(7);
    expect(result[0].id).toBe('triggers');
    expect(result[1].id).toBe('elasticsearch');
    expect(result[2].id).toBe('kibana');
    expect(result[3].id).toBe('ai');
    expect(result[4].id).toBe('data');
    expect(result[5].id).toBe('external');
    expect(result[6].id).toBe('flowControl');
  });

  it('should include trigger options', () => {
    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const triggersGroup = result.find((group) => group.id === 'triggers');

    expect(triggersGroup).toBeDefined();
    if (triggersGroup && 'options' in triggersGroup) {
      expect(triggersGroup.options).toHaveLength(3);
      expect(triggersGroup.options.map((opt) => opt.id)).toEqual(['manual', 'alert', 'scheduled']);
    }
  });

  it('should set stability tech_preview for registered event-driven trigger options', () => {
    (triggerSchemas.getTriggerDefinitions as jest.Mock).mockReturnValueOnce([
      {
        id: 'cases.updated',
        title: 'Case updated',
        description: 'When a case is created or updated.',
      },
    ]);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const triggersGroup = result.find((group) => group.id === 'triggers');

    expect(triggersGroup).toBeDefined();
    if (triggersGroup && isActionGroup(triggersGroup)) {
      const builtInCount = 3;
      expect(triggersGroup.options).toHaveLength(builtInCount + 1);
      const casesOption = triggersGroup.options.find((opt) => opt.id === 'cases.updated');
      expect(casesOption).toBeDefined();
      if (casesOption && isActionOption(casesOption)) {
        expect(casesOption.stability).toBe('tech_preview');
      }
    }
  });

  it('should include flow control options', () => {
    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const flowControlGroup = result.find((group) => group.id === 'flowControl');

    expect(flowControlGroup).toBeDefined();
    if (flowControlGroup && 'options' in flowControlGroup) {
      expect(flowControlGroup.options).toHaveLength(9);
      expect(flowControlGroup.options.map((opt) => opt.id)).toEqual([
        'if',
        'switch',
        'foreach',
        'while',
        'wait',
        'waitForInput',
        'waitForApproval',
        'workflow.execute',
        'workflow.executeAsync',
      ]);
    }
  });

  it('should add connectors with custom step definitions to appropriate groups', () => {
    const mockConnector = {
      type: 'custom.connector',
      description: 'Custom Connector',
    };

    const mockStepDefinition = {
      id: 'custom.connector',
      label: 'Custom Connector Label',
      description: 'Custom Connector Description',
      icon: 'customIcon',
      category: StepCategory.Kibana,
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(mockStepDefinition as any);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const kibanaGroup = result.find((group) => group.id === 'kibana');

    expect(kibanaGroup).toBeDefined();
    if (kibanaGroup && isActionGroup(kibanaGroup)) {
      expect(kibanaGroup.options).toHaveLength(1);
      const option = kibanaGroup.options[0];
      expect(option.id).toBe('custom.connector');
      expect(option.label).toBe('Custom Connector Label');
      if (isActionOption(option)) {
        expect(option.iconType).toBe('customIcon');
      }
    }
  });

  it('should not show Cases nested group when no cases steps are registered', () => {
    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const kibanaGroup = result.find((group) => group.id === 'kibana');

    expect(kibanaGroup).toBeDefined();
    if (kibanaGroup && isActionGroup(kibanaGroup)) {
      expect(kibanaGroup.options).toHaveLength(0);
      expect(kibanaGroup.options.find((opt) => opt.id === 'kibana.cases')).toBeUndefined();
    }
  });

  it('should place KibanaCases steps in nested Cases group under Kibana', () => {
    const mockConnector = {
      type: 'cases.createCase',
      description: 'Create case',
    };

    const mockStepDefinition = {
      id: 'cases.createCase',
      label: 'Create case',
      description: 'Create a case',
      icon: 'casesApp',
      category: StepCategory.KibanaCases,
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(mockStepDefinition as any);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const kibanaGroup = result.find((group) => group.id === 'kibana');

    expect(kibanaGroup).toBeDefined();
    if (kibanaGroup && isActionGroup(kibanaGroup)) {
      expect(kibanaGroup.options).toHaveLength(1);
      const casesNested = kibanaGroup.options[0];
      expect(casesNested.id).toBe('kibana.cases');
      if (isActionGroup(casesNested)) {
        expect(casesNested.options).toHaveLength(1);
        expect(casesNested.options[0].id).toBe('cases.createCase');
      }
    }
  });

  it('should set pathIds on groups for navigation from search', () => {
    const mockConnector = {
      type: 'cases.createCase',
      description: 'Create case',
    };

    const mockStepDefinition = {
      id: 'cases.createCase',
      label: 'Create case',
      description: 'Create a case',
      icon: 'casesApp',
      category: StepCategory.KibanaCases,
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(mockStepDefinition as any);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const kibanaGroup = result.find((group) => group.id === 'kibana');

    expect(kibanaGroup).toBeDefined();
    if (kibanaGroup && isActionGroup(kibanaGroup)) {
      expect(kibanaGroup.pathIds).toEqual(['kibana']);
      const casesNested = kibanaGroup.options.find((opt) => opt.id === 'kibana.cases');
      expect(casesNested).toBeDefined();
      if (casesNested && isActionGroup(casesNested)) {
        expect(casesNested.pathIds).toEqual(['kibana', 'kibana.cases']);
      }
    }
  });

  it('should list nested Cases group before other Kibana options when both are present', () => {
    const mockConnectors = [
      {
        type: 'kibana.saved_object',
        description: 'Saved Object',
        summary: 'Kibana Summary',
      },
      {
        type: 'cases.createCase',
        description: 'Create case',
      },
    ];

    const mockCasesStepDefinition = {
      id: 'cases.createCase',
      label: 'Create case',
      description: 'Create a case',
      icon: 'casesApp',
      category: StepCategory.KibanaCases,
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    };

    (getAllConnectors as jest.Mock).mockReturnValue(mockConnectors);
    mockWorkflowsExtensions.getStepDefinition.mockImplementation((type: string) => {
      if (type === 'cases.createCase') {
        return mockCasesStepDefinition as any;
      }
      return undefined;
    });

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const kibanaGroup = result.find((group) => group.id === 'kibana');

    expect(kibanaGroup).toBeDefined();
    if (kibanaGroup && isActionGroup(kibanaGroup)) {
      expect(kibanaGroup.options).toHaveLength(2);
      expect(kibanaGroup.options[0].id).toBe('kibana.cases');
      expect(kibanaGroup.options[1].id).toBe('kibana.saved_object');
    }
  });

  it('should add elasticsearch connectors to elasticsearch group', () => {
    const mockConnector = {
      type: 'elasticsearch.search',
      description: 'Elasticsearch Search',
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(undefined);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const elasticsearchGroup = result.find((group) => group.id === 'elasticsearch');

    expect(elasticsearchGroup).toBeDefined();
    if (elasticsearchGroup && isActionGroup(elasticsearchGroup)) {
      expect(elasticsearchGroup.options).toHaveLength(1);
      const option = elasticsearchGroup.options[0];
      expect(option.id).toBe('elasticsearch.search');
      expect(option.label).toBe('Elasticsearch Search');
      if (isActionOption(option)) {
        expect(option.iconType).toBe('logoElasticsearch');
      }
    }
  });

  it('should add kibana connectors to kibana group', () => {
    const mockConnector = {
      type: 'kibana.saved_object',
      description: 'Kibana Saved Object',
      summary: 'Kibana Summary',
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(undefined);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const kibanaGroup = result.find((group) => group.id === 'kibana');

    expect(kibanaGroup).toBeDefined();
    if (kibanaGroup && isActionGroup(kibanaGroup)) {
      expect(kibanaGroup.options).toHaveLength(1);
      const option = kibanaGroup.options[0];
      expect(option.id).toBe('kibana.saved_object');
      expect(option.label).toBe('Kibana Summary');
      if (isActionOption(option)) {
        expect(option.iconType).toBe('logoKibana');
      }
    }
  });

  it('should hide deprecated connectors from the actions menu', () => {
    const mockConnector = {
      type: 'kibana.createCase',
      description: 'Create a case',
      summary: 'Create a case',
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    (isDeprecatedStepType as jest.Mock).mockImplementation(
      (stepType: string) => stepType === 'kibana.createCase'
    );
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(undefined);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const kibanaGroup = result.find((group) => group.id === 'kibana');

    expect(kibanaGroup).toBeDefined();
    if (kibanaGroup && isActionGroup(kibanaGroup)) {
      expect(kibanaGroup.options).toHaveLength(0);
    }
  });

  it('should pass tech_preview stability for kibana connectors with tech_preview stability', () => {
    const mockConnector = {
      type: 'kibana.streams.list',
      summary: 'Get stream list',
      description: 'Fetches list of all streams',
      methods: ['GET'],
      patterns: ['/api/streams'],
      stability: 'tech_preview' as const,
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(undefined);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const kibanaGroup = result.find((group) => group.id === 'kibana');

    expect(kibanaGroup).toBeDefined();
    if (kibanaGroup && isActionGroup(kibanaGroup)) {
      expect(kibanaGroup.options).toHaveLength(1);
      const option = kibanaGroup.options[0];
      expect(option.id).toBe('kibana.streams.list');
      expect(option.stability).toBe('tech_preview');
    }
  });

  it('should not set stability for kibana connectors without stability', () => {
    const mockConnector = {
      type: 'kibana.saved_object',
      summary: 'Kibana Saved Object',
      description: 'A saved object',
      methods: ['GET'],
      patterns: ['/api/saved_objects'],
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(undefined);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const kibanaGroup = result.find((group) => group.id === 'kibana');

    expect(kibanaGroup).toBeDefined();
    if (kibanaGroup && isActionGroup(kibanaGroup)) {
      expect(kibanaGroup.options).toHaveLength(1);
      const option = kibanaGroup.options[0];
      expect(option.stability).toBeUndefined();
    }
  });

  it('should add dynamic connectors to external group', () => {
    const mockConnector = {
      actionTypeId: '.slack',
      displayName: 'Slack',
      type: 'slack.api',
      summary: 'API',
      description: 'Slack - API',
      instances: [{ id: 'instance1' }, { id: 'instance2' }],
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(undefined);
    (isDynamicConnector as jest.MockedFunction<typeof isDynamicConnector>).mockImplementation(
      () => true
    );

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const externalGroup = result.find((group) => group.id === 'external');

    expect(externalGroup).toBeDefined();
    if (externalGroup && isActionGroup(externalGroup)) {
      expect(externalGroup.options).toHaveLength(1);
      const option = externalGroup.options[0];
      expect(option.id).toBe('slack');
      expect(option.label).toBe('Slack');
      expect(option.description).toBe('slack');
    }
  });

  it('should create connector groups for dynamic connectors with subtypes', () => {
    const mockConnector = {
      actionTypeId: '.sharepoint-online',
      displayName: 'SharePoint Online',
      type: 'sharepoint-online.getAllSites',
      summary: 'Get All Sites',
      description: 'SharePoint Online - Get All Sites',
      instances: [{ id: 'instance1' }],
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(undefined);
    (isDynamicConnector as jest.MockedFunction<typeof isDynamicConnector>).mockImplementation(
      () => true
    );

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const externalGroup = result.find((group) => group.id === 'external');

    expect(externalGroup).toBeDefined();
    if (externalGroup && isActionGroup(externalGroup)) {
      const sharepointGroup = externalGroup.options.find((opt) => opt.id === 'sharepoint-online');
      expect(sharepointGroup).toBeDefined();
      if (sharepointGroup && isActionGroup(sharepointGroup)) {
        expect(sharepointGroup.label).toBe('SharePoint Online');
        expect(sharepointGroup.description).toBe('sharepoint-online');
        expect(sharepointGroup.options).toHaveLength(1);
        expect(sharepointGroup.options[0].id).toBe('sharepoint-online.getAllSites');
        expect(sharepointGroup.options[0].label).toBe('Get All Sites');
        expect(sharepointGroup.options[0].description).toBe('sharepoint-online.getAllSites');
      }
    }
  });

  it('should add connectors to the correct group based on category', () => {
    const mockConnector = {
      type: 'custom.connector',
      description: 'Custom Connector',
    };

    const mockStepDefinition = {
      id: 'custom.connector',
      label: 'Custom Connector Label',
      description: 'Custom Connector Description',
      icon: 'customIcon',
      category: StepCategory.External,
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    };

    (getAllConnectors as jest.Mock).mockReturnValue([mockConnector]);
    mockWorkflowsExtensions.getStepDefinition.mockReturnValue(mockStepDefinition as any);

    const result = getActionOptions(mockEuiTheme, mockWorkflowsExtensions);
    const externalGroup = result.find((group) => group.id === 'external');

    expect(externalGroup).toBeDefined();
    if (externalGroup && isActionGroup(externalGroup)) {
      expect(externalGroup.options).toHaveLength(1);
      expect(externalGroup.options[0].id).toBe('custom.connector');
    }
  });
});

describe('flattenOptions', () => {
  it('should flatten a simple array of options', () => {
    const options: ActionOptionData[] = [
      { id: 'option1', label: 'Option 1', iconType: 'globe' },
      { id: 'option2', label: 'Option 2', iconType: 'bolt' },
    ];

    const flattened = flattenOptions(options);

    expect(flattened).toHaveLength(2);
    expect(flattened.map((opt) => opt.id)).toEqual(['option1', 'option2']);
  });

  it('should flatten nested options', () => {
    const options: ActionOptionData[] = [
      {
        id: 'group1',
        label: 'Group 1',
        iconType: 'folder',
        options: [
          { id: 'option1', label: 'Option 1', iconType: 'globe' },
          { id: 'option2', label: 'Option 2', iconType: 'bolt' },
        ],
      },
      { id: 'option3', label: 'Option 3', iconType: 'star' },
    ];

    const flattened = flattenOptions(options);

    expect(flattened).toHaveLength(4);
    expect(flattened.map((opt) => opt.id)).toEqual(['group1', 'option1', 'option2', 'option3']);
  });

  it('should flatten deeply nested options', () => {
    const options: ActionOptionData[] = [
      {
        id: 'group1',
        label: 'Group 1',
        iconType: 'folder',
        options: [
          {
            id: 'subgroup1',
            label: 'Subgroup 1',
            iconType: 'folder',
            options: [{ id: 'option1', label: 'Option 1', iconType: 'globe' }],
          },
          { id: 'option2', label: 'Option 2', iconType: 'bolt' },
        ],
      },
    ];

    const flattened = flattenOptions(options);

    expect(flattened).toHaveLength(4);
    expect(flattened.map((opt) => opt.id)).toEqual(['group1', 'subgroup1', 'option1', 'option2']);
  });

  it('should handle empty arrays', () => {
    const flattened = flattenOptions([]);
    expect(flattened).toHaveLength(0);
  });

  it('should handle groups with empty options', () => {
    const options: ActionOptionData[] = [
      {
        id: 'group1',
        label: 'Group 1',
        iconType: 'folder',
        options: [],
      },
    ];

    const flattened = flattenOptions(options);
    expect(flattened).toHaveLength(1);
    expect(flattened[0].id).toBe('group1');
  });
});
