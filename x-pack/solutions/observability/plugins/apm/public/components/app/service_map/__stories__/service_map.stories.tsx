/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { Meta, StoryObj, StoryFn } from '@storybook/react';
import { useArgs } from '@storybook/preview-api';
import {
  EuiButton,
  EuiCallOut,
  EuiFieldNumber,
  EuiFilePicker,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiToolTip,
  EuiSwitch,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { CodeEditor } from '@kbn/code-editor';
import { ServiceMapGraph } from '../graph';
import {
  generateServiceMapElements,
  createSimpleServiceMap,
  createMicroservicesExample,
  createLargeServiceMap,
  type GenerateOptions,
} from './generate_elements';
import { transformToReactFlow } from '../../../../../common/service_map/transform_to_react_flow';
import type { ServiceMapResponse } from '../../../../../common/service_map';
import {
  opbeansScenario,
  toServiceMapResponse,
  APM_STORY_A11Y,
} from '../../../../test_helpers/synthtrace_stories';

function getHeight() {
  return window.innerHeight - 50;
}

const defaultEnvironment = 'ENVIRONMENT_ALL' as const;
const defaultTimeRange = {
  start: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  end: new Date().toISOString(),
};

const meta: Meta<typeof ServiceMapGraph> = {
  title: 'app/ServiceMap/ServiceMap',
  component: ServiceMapGraph,
  parameters: {
    routePath: '/service-map?rangeFrom=now-15m&rangeTo=now',
    layout: 'fullscreen',
    a11y: APM_STORY_A11Y,
    docs: {
      description: {
        component:
          'React Flow based service map component for visualizing APM service dependencies. ' +
          'Supports keyboard navigation, screen reader announcements, and various node types.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ServiceMapGraph>;

export const SimpleExample: Story = {
  render: () => {
    const { nodes, edges } = createSimpleServiceMap();
    return (
      <ServiceMapGraph
        height={getHeight()}
        nodes={nodes}
        edges={edges}
        environment={defaultEnvironment}
        kuery=""
        start={defaultTimeRange.start}
        end={defaultTimeRange.end}
      />
    );
  },
};

/**
 * **Synthtrace-generated story** — demonstrates the scenario-driven pattern.
 *
 * Data comes from the shared `opbeansScenario()` in
 * `test_helpers/synthtrace_stories/`, not from a hand-crafted fixture or a
 * random generator. Any APM story can import the same scenario and run it
 * through a component-specific selector:
 *
 * ```
 * scenario()              ─→  flat ApmFields[]
 *   └── toServiceMapResponse()  ─→  ServiceMapResponse
 *         └── transformToReactFlow()  ─→  { nodes, edges }
 *               └── <ServiceMapGraph nodes edges />
 * ```
 *
 * The `toServiceMapResponse` selector is the in-memory analog of the server's
 * `fetch_exit_span_samples.ts` — it reconstructs service→service connections
 * from exit spans and their downstream transaction's `parent.id`, then feeds
 * the result to the production `transformToReactFlow` function unchanged.
 *
 * This story is tagged `autodocs` so the Docs panel shows the component API
 * and this description together.
 */
export const SynthtraceGenerated: Story = {
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        story:
          'Rendered from in-memory synthtrace data (opbeans scenario). ' +
          'No Elasticsearch involved — the scenario generates raw APM documents, ' +
          'a selector reconstructs the service-map connection shape, and the ' +
          'production `transformToReactFlow` function converts it to React Flow nodes/edges.',
      },
    },
  },
  render: () => {
    const { nodes, edges } = transformToReactFlow(toServiceMapResponse(opbeansScenario()));
    return (
      <ServiceMapGraph
        height={getHeight()}
        nodes={nodes}
        edges={edges}
        environment={defaultEnvironment}
        kuery=""
        start={new Date('2024-01-15T12:00:00.000Z').toISOString()}
        end={new Date('2024-01-15T12:15:00.000Z').toISOString()}
      />
    );
  },
};

export const MicroservicesExample: Story = {
  render: () => {
    const { nodes, edges } = createMicroservicesExample();
    return (
      <ServiceMapGraph
        height={getHeight()}
        nodes={nodes}
        edges={edges}
        environment={defaultEnvironment}
        kuery=""
        start={defaultTimeRange.start}
        end={defaultTimeRange.end}
      />
    );
  },
};

export const GenerateMap: StoryFn = () => {
  const [options, setOptions] = useState<GenerateOptions>({
    serviceCount: 10,
    dependencyCount: 5,
    includeGroupedResources: true,
    groupedResourceCount: 2,
    hasAnomalies: true,
    includeBidirectional: true,
    hasAlerts: true,
    hasSlos: true,
  });
  const [json, setJson] = useState<string>('');
  const [{ nodes, edges }, setElements] = useState(() => generateServiceMapElements(options));

  const handleGenerate = useCallback(() => {
    setElements(generateServiceMapElements(options));
    setJson('');
  }, [options]);

  const handleGetJson = useCallback(() => {
    setJson(JSON.stringify({ nodes, edges }, null, 2));
  }, [nodes, edges]);

  return (
    <div style={{ padding: 16 }}>
      <EuiFlexGroup wrap alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Number of service nodes">
            <EuiFieldNumber
              data-test-subj="serviceCountInput"
              prepend="Services"
              value={options.serviceCount}
              min={1}
              max={100}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, serviceCount: e.target.valueAsNumber || 1 }))
              }
            />
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Number of dependency nodes (databases, messaging, etc.)">
            <EuiFieldNumber
              data-test-subj="dependencyCountInput"
              prepend="Dependencies"
              value={options.dependencyCount}
              min={0}
              max={50}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, dependencyCount: e.target.valueAsNumber || 0 }))
              }
            />
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSwitch
            label="Anomalies"
            checked={options.hasAnomalies}
            onChange={(e) => setOptions((prev) => ({ ...prev, hasAnomalies: e.target.checked }))}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSwitch
            label="Grouped Resources"
            checked={options.includeGroupedResources}
            onChange={(e) =>
              setOptions((prev) => ({ ...prev, includeGroupedResources: e.target.checked }))
            }
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSwitch
            label="Bidirectional Edges"
            checked={options.includeBidirectional}
            onChange={(e) =>
              setOptions((prev) => ({ ...prev, includeBidirectional: e.target.checked }))
            }
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSwitch
            label="Alert Badges"
            checked={options.hasAlerts ?? false}
            onChange={(e) => setOptions((prev) => ({ ...prev, hasAlerts: e.target.checked }))}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSwitch
            label="SLO Badges"
            checked={options.hasSlos ?? false}
            onChange={(e) => setOptions((prev) => ({ ...prev, hasSlos: e.target.checked }))}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton data-test-subj="generateMapButton" onClick={handleGenerate} iconType="refresh">
            Generate
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton data-test-subj="getJsonButton" onClick={handleGetJson} iconType="upload">
            Get JSON
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiText size="s" color="subdued">
        <p>
          Nodes: {nodes.length} | Edges: {edges.length}
        </p>
      </EuiText>

      <EuiSpacer size="s" />

      <ServiceMapGraph
        height={getHeight()}
        nodes={nodes}
        edges={edges}
        environment={defaultEnvironment}
        kuery=""
        start={defaultTimeRange.start}
        end={defaultTimeRange.end}
      />

      {json && (
        <>
          <EuiSpacer size="m" />
          <CodeEditor
            languageId="json"
            value={json}
            height="200px"
            options={{ fontFamily: 'monospace' }}
          />
        </>
      )}
    </div>
  );
};

/**
 * Checks if the JSON is in ServiceMapResponse format (API response)
 */
function isServiceMapResponse(json: unknown): json is ServiceMapResponse {
  return (
    typeof json === 'object' &&
    json !== null &&
    'spans' in json &&
    Array.isArray((json as ServiceMapResponse).spans)
  );
}

function isReactFlowFormat(json: unknown): json is { nodes: any[]; edges: any[] } {
  return (
    typeof json === 'object' &&
    json !== null &&
    'nodes' in json &&
    'edges' in json &&
    Array.isArray((json as { nodes: any[] }).nodes)
  );
}

const MapFromJSONTemplate = () => {
  const [{ json }, updateArgs] = useArgs();
  const [error, setError] = useState<string | undefined>();
  const [elements, setElements] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  const [uniqueKeyCounter, setUniqueKeyCounter] = useState<number>(0);

  const updateRenderedElements = useCallback(() => {
    try {
      if (json && typeof json === 'object') {
        if (isServiceMapResponse(json)) {
          const reactFlowData = transformToReactFlow(json);
          setElements({ nodes: reactFlowData.nodes, edges: reactFlowData.edges });
        } else if (isReactFlowFormat(json)) {
          setElements({ nodes: json.nodes ?? [], edges: json.edges ?? [] });
        } else {
          throw new Error(
            'Invalid JSON format. Expected ServiceMapResponse: { spans: [], servicesData?: [], anomalies?: {} }'
          );
        }
        setUniqueKeyCounter((key) => key + 1);
        setError(undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, [json]);

  useEffect(() => {
    updateRenderedElements();
  }, [updateRenderedElements]);

  const isLoaded = elements.nodes.length > 0;

  return (
    <EuiFlexGroup
      direction="column"
      justifyContent="spaceBetween"
      style={{ minHeight: '100vh', padding: 16 }}
      gutterSize="xs"
    >
      <EuiFlexItem grow={false}>
        <EuiCallOut
          size="s"
          title="Upload a JSON file or paste JSON in the Storybook Controls panel."
          iconType="pin"
        >
          <p>
            <strong>ServiceMapResponse</strong> (API format):{' '}
            <code>{'{ spans: [], servicesData?: [], anomalies?: {} }'}</code>
          </p>
        </EuiCallOut>
      </EuiFlexItem>
      {isLoaded && (
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued">
            Nodes: {elements.nodes.length} | Edges: {elements.edges.length}
          </EuiText>
        </EuiFlexItem>
      )}
      <EuiFlexItem grow>
        <ServiceMapGraph
          key={uniqueKeyCounter}
          height={getHeight()}
          nodes={elements.nodes}
          edges={elements.edges}
          environment={defaultEnvironment}
          kuery=""
          start={defaultTimeRange.start}
          end={defaultTimeRange.end}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiForm isInvalid={error !== undefined} error={error}>
          <EuiFilePicker
            display="large"
            fullWidth
            initialPromptText="Upload a JSON file"
            onChange={(event) => {
              const item = event?.item(0);
              if (item) {
                const f = new FileReader();
                f.onload = (onloadEvent) => {
                  const result = onloadEvent?.target?.result;
                  if (typeof result === 'string') {
                    try {
                      updateArgs({ json: JSON.parse(result) });
                    } catch (e) {
                      setError('Failed to parse JSON file');
                    }
                  }
                };
                f.readAsText(item);
              }
            }}
          />
        </EuiForm>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const MapFromJSON: StoryObj<typeof MapFromJSONTemplate> = {
  render: MapFromJSONTemplate,
  argTypes: {
    json: {
      control: 'object',
    },
  },
  args: {
    json: createSimpleServiceMap(),
  },
};

export const LargeMap: Story = {
  render: () => {
    const { nodes, edges } = createLargeServiceMap(100);
    return (
      <div style={{ padding: 16 }}>
        <EuiCallOut
          size="s"
          title={`Performance test: ${nodes.length} nodes, ${edges.length} edges`}
          iconType="clock"
        />
        <EuiSpacer size="m" />
        <ServiceMapGraph
          height={getHeight()}
          nodes={nodes}
          edges={edges}
          environment={defaultEnvironment}
          kuery=""
          start={defaultTimeRange.start}
          end={defaultTimeRange.end}
        />
      </div>
    );
  },
};
