/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Parent } from 'unist';
import type { MutableNode } from './markdown_plugins';
import { render, screen } from '@testing-library/react';
import { ToolResultType, type EsqlResults } from '@kbn/agent-builder-common/tools/tool_result';
import { cloneDeep } from 'lodash';
import type { ConversationRoundStep } from '@kbn/agent-builder-common';
import { ConversationRoundStepType } from '@kbn/agent-builder-common';
import unified from 'unified';
import remarkParse from 'remark-parse-no-trim';
import { createVisualizationRenderer, visualizationTagParser } from './markdown_plugins';
import { ChatMessageText } from './chat_message_text';
import { useAgentBuilderServices } from '../../../../hooks/use_agent_builder_service';
import { useStepsFromPrevRounds } from '../../../../hooks/use_conversation';
import { useConversationContext } from '../../../../context/conversation/conversation_context';
import { VisualizeESQL } from '../../../tools/esql/visualize_esql';
import type { AgentBuilderStartDependencies } from '../../../../../types';
import { setWith } from '@kbn/safer-lodash-set';
import { ChartType } from '@kbn/visualization-utils';
import dedent from 'dedent';

jest.mock('../../../tools/esql/visualize_esql', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const _React = require('react'); // Use require to avoid hoisting issues with jest.mock
  return {
    VisualizeESQL: jest.fn(() =>
      _React.createElement('span', { 'data-test-subj': 'visualize-esql' })
    ),
  };
});

jest.mock('../../../../hooks/use_agent_builder_service', () => ({
  useAgentBuilderServices: jest.fn(),
}));

jest.mock('../../../../hooks/use_conversation', () => ({
  useStepsFromPrevRounds: jest.fn(),
}));

jest.mock('../../../../context/conversation/conversation_context', () => ({
  useConversationContext: jest.fn(),
}));

const mockVisualizeESQL = VisualizeESQL as jest.MockedFunction<any>;
const useAgentBuilderServicesMock = useAgentBuilderServices as jest.MockedFunction<
  typeof useAgentBuilderServices
>;
const useStepsFromPrevRoundsMock = useStepsFromPrevRounds as jest.MockedFunction<
  typeof useStepsFromPrevRounds
>;
const useConversationContextMock = useConversationContext as jest.MockedFunction<
  typeof useConversationContext
>;

const toolResult: EsqlResults = {
  tool_result_id: '6K4K',
  type: ToolResultType.esqlResults,
  data: {
    query:
      'FROM metrics-apm.transaction.1m-default\n| WHERE @timestamp >= NOW() - 1 hour\n| STATS avg_duration = AVG(transaction.duration.summary) BY minute_bucket = BUCKET(@timestamp, 1 minute)\n| SORT minute_bucket\n| LIMIT 100',
    columns: [
      { name: 'avg_duration', type: 'double' },
      { name: 'minute_bucket', type: 'date' },
    ],
    values: [],
  },
};

const toolCallStep: ConversationRoundStep = {
  type: ConversationRoundStepType.toolCall,
  tool_call_id: 'tool-call-1',
  tool_id: 'platform.core.search',
  params: {},
  results: [toolResult],
};

function createStartDependencies() {
  return {
    lens: {},
    dataViews: {},
    cloud: {},
    share: {},
    uiActions: {},
    unifiedSearch: {
      ui: {
        SearchBar: () => null,
      },
    },
  } as unknown as AgentBuilderStartDependencies;
}

function getAST(markdown: string) {
  const processor = unified().use(remarkParse);
  const tree = processor.parse(markdown);
  return processor.runSync(tree) as unknown as Parent;
}

describe('chat_message_text', () => {
  beforeEach(() => {
    mockVisualizeESQL.mockClear();
    useAgentBuilderServicesMock.mockReturnValue({
      agentService: {},
      chatService: {},
      conversationsService: {},
      toolsService: {},
      startDependencies: createStartDependencies(),
    } as ReturnType<typeof useAgentBuilderServices>);
    useStepsFromPrevRoundsMock.mockReturnValue([]);
    useConversationContextMock.mockReturnValue({
      isEmbeddedContext: false,
      browserApiTools: undefined,
      conversationActions: {
        invalidateConversation: jest.fn(),
        addOptimisticRound: jest.fn(),
        removeOptimisticRound: jest.fn(),
        addReasoningStep: jest.fn(),
        addToolCall: jest.fn(),
        setToolCallProgress: jest.fn(),
        setToolCallResult: jest.fn(),
        setAssistantMessage: jest.fn(),
        addAssistantMessageChunk: jest.fn(),
        clearAssistantMessage: jest.fn(),
        onConversationCreated: jest.fn(),
        deleteConversation: jest.fn(),
        renameConversation: jest.fn(),
        setTimeToFirstToken: jest.fn(),
        addPendingPrompt: jest.fn(),
        clearPendingPrompts: jest.fn(),
        setAskUserQuestionAnswers: jest.fn(),
        clearLastRoundResponse: jest.fn(),
        addBackgroundExecutionCompleteStep: jest.fn(),
        addCompactionStep: jest.fn(),
        setCompactionStepComplete: jest.fn(),
        addOrUpdateTodosStep: jest.fn(),
        setAttachments: jest.fn(),
        onRoundComplete: jest.fn(),
      },
    });
  });

  describe('visualizationTagParser', () => {
    function recursivelyFindVisualizationNodes(
      node: MutableNode | Parent,
      nodes: MutableNode[] = []
    ) {
      if ('children' in node) {
        const parent = node as Parent;
        parent.children.forEach((child) =>
          recursivelyFindVisualizationNodes(child as MutableNode | Parent, nodes)
        );
      }

      if (node.type === 'visualization') {
        nodes.push(node as MutableNode);
      }

      return nodes;
    }

    function getVisualizationNodes(markdown: string) {
      const tree = getAST(markdown);
      visualizationTagParser()(tree);
      return recursivelyFindVisualizationNodes(tree);
    }

    it('converts visualization HTML nodes into visualization elements', () => {
      const toolResultId = 'abcd';
      const markdown = `Here is a visualization:\n<visualization tool-result-id="${toolResultId}" />`;
      const visualizationNodes = getVisualizationNodes(markdown);

      expect(visualizationNodes).toHaveLength(1);
      expect(visualizationNodes[0].toolResultId).toBe(toolResultId);
    });

    it('sets toolResultId to undefined when the attribute is missing', () => {
      const markdown = 'Missing attribute test\n<visualization />';
      const visualizationNodes = getVisualizationNodes(markdown);

      expect(visualizationNodes).toHaveLength(1);
      expect(visualizationNodes[0].toolResultId).toBeUndefined();
    });

    it('supports multiple visualization tags in a single markdown', () => {
      const markdown = `Multiple visualizations\n<visualization tool-result-id="first" />\nMore text
<visualization tool-result-id="second" />`;
      const visualizationNodes = getVisualizationNodes(markdown);

      expect(visualizationNodes).toHaveLength(2);
      const ids = visualizationNodes.map((node) => node.toolResultId);
      expect(ids).toEqual(['first', 'second']);
    });

    it('supports multiple visualization tags without any text', () => {
      const markdown = `<visualization tool-result-id="first" />\n<visualization tool-result-id="second" />`;
      const visualizationNodes = getVisualizationNodes(markdown);

      expect(visualizationNodes).toHaveLength(2);
      const ids = visualizationNodes.map((node) => node.toolResultId);
      expect(ids).toEqual(['first', 'second']);
    });

    it('handles mixed-case visualization tags', () => {
      const markdown = 'Case insensitive\n<VISUALIZATION tool-result-id="cased" />';
      const visualizationNodes = getVisualizationNodes(markdown);

      expect(visualizationNodes).toHaveLength(1);
      expect(visualizationNodes[0].toolResultId).toBe('cased');
    });

    it('captures chart type attribute when present', () => {
      const markdown = `Line\n<visualization tool-result-id="2hJz" chart-type="Line" />`;
      const [visualizationNode] = getVisualizationNodes(markdown);

      expect(visualizationNode).toBeDefined();
      expect(visualizationNode.toolResultId).toBe('2hJz');
      expect(visualizationNode.chartType).toBe('Line');
    });

    it('captures chart type attribute for multiple visualizations sharing the same tool result', () => {
      const markdown = `Line\n<visualization tool-result-id="2hJz" chart-type="Line" />\n\nBar\n<visualization tool-result-id="2hJz" chart-type="Bar" />`;
      const visualizationNodes = getVisualizationNodes(markdown);

      expect(visualizationNodes).toHaveLength(2);
      expect(visualizationNodes.map((node) => node.chartType)).toEqual(['Line', 'Bar']);
    });
  });

  describe('createVisualizationRenderer', () => {
    it('returns a renderer that instantiates VisualizeESQL when the tool result exists', () => {
      const startDependencies = createStartDependencies();
      const renderer = createVisualizationRenderer({
        startDependencies,
        stepsFromCurrentRound: [toolCallStep],
        stepsFromPrevRounds: [],
      });

      const element = renderer({ toolResultId: '6K4K' });
      render(element);

      expect(mockVisualizeESQL).toHaveBeenCalledTimes(1);
      const props = mockVisualizeESQL.mock.calls[0][0];
      expect(props).toMatchObject({
        esqlColumns: toolResult.data.columns,
        esqlQuery: toolResult.data.query,
        lens: startDependencies.lens,
        dataViews: startDependencies.dataViews,
        uiActions: startDependencies.uiActions,
      });
    });

    it('returns a fallback when toolResultId is missing', () => {
      const renderer = createVisualizationRenderer({
        startDependencies: createStartDependencies(),
        stepsFromCurrentRound: [toolCallStep],
        stepsFromPrevRounds: [],
      });

      const element = renderer({ toolResultId: undefined });
      render(element);

      expect(screen.getByText(/Visualization missing tool-result-id/i)).toBeInTheDocument();
      expect(mockVisualizeESQL).not.toHaveBeenCalled();
    });

    it('returns a fallback when tool result cannot be found', () => {
      const renderer = createVisualizationRenderer({
        startDependencies: createStartDependencies(),
        stepsFromCurrentRound: [toolCallStep],
        stepsFromPrevRounds: [],
      });

      const element = renderer({ toolResultId: 'unknown-id' });
      render(element);

      const fallbackMessages = screen.getAllByText((_, elm) =>
        Boolean(
          elm?.textContent?.includes('Unable to find visualization for tool-result-id=unknown-id.')
        )
      );
      expect(fallbackMessages.length).toBeGreaterThan(0);
      expect(mockVisualizeESQL).not.toHaveBeenCalled();
    });

    it('returns a fallback when tool result lacks an ES|QL query', () => {
      const stepWithoutQuery = cloneDeep(toolCallStep) as ConversationRoundStep;
      setWith(stepWithoutQuery, 'results[0].data.query', undefined); // Remove the query

      const renderer = createVisualizationRenderer({
        startDependencies: createStartDependencies(),
        stepsFromCurrentRound: [stepWithoutQuery],
        stepsFromPrevRounds: [],
      });

      const element = renderer({ toolResultId: '6K4K' });
      render(element);

      expect(mockVisualizeESQL).not.toHaveBeenCalled();
      const fallbacks = screen.getAllByText((_, elm) =>
        Boolean(elm?.textContent?.includes('Unable to find esql query for tool-result-id=6K4K.'))
      );
      expect(fallbacks.length).toBeGreaterThan(0);
    });

    it('looks through previous rounds when current steps have no matching tool result', () => {
      const renderer = createVisualizationRenderer({
        startDependencies: createStartDependencies(),
        stepsFromCurrentRound: [],
        stepsFromPrevRounds: [toolCallStep],
      });

      const element = renderer({ toolResultId: '6K4K' });
      render(element);

      expect(mockVisualizeESQL).toHaveBeenCalledTimes(1);
    });

    it('passes the chartType as preferredChartType to VisualizeESQL', () => {
      const renderer = createVisualizationRenderer({
        startDependencies: createStartDependencies(),
        stepsFromCurrentRound: [toolCallStep],
        stepsFromPrevRounds: [],
      });

      const element = renderer({ toolResultId: '6K4K', chartType: ChartType.Line });
      render(element);

      expect(mockVisualizeESQL).toHaveBeenCalledTimes(1);
      const props = mockVisualizeESQL.mock.calls[0][0];
      expect(props).toMatchObject({
        esqlColumns: toolResult.data.columns,
        esqlQuery: toolResult.data.query,
        preferredChartType: 'Line',
      });
    });

    it('works without a chartType attribute', () => {
      const renderer = createVisualizationRenderer({
        startDependencies: createStartDependencies(),
        stepsFromCurrentRound: [toolCallStep],
        stepsFromPrevRounds: [],
      });

      const element = renderer({ toolResultId: '6K4K' });
      render(element);

      expect(mockVisualizeESQL).toHaveBeenCalledTimes(1);
      const props = mockVisualizeESQL.mock.calls[0][0];
      expect(props.preferredChartType).toBeUndefined();
    });
  });

  describe('<ChatMessageText />', () => {
    it('renders VisualizeESQL for visualization tags with matching tool results', () => {
      useStepsFromPrevRoundsMock.mockReturnValue([toolCallStep]);

      const content = 'Here is a visualization:\n<visualization tool-result-id="6K4K" />';
      render(<ChatMessageText content={content} steps={[toolCallStep]} />);

      expect(screen.getByTestId('visualize-esql')).toBeInTheDocument();
      const props = mockVisualizeESQL.mock.calls[0][0];
      expect(props).toEqual(
        expect.objectContaining({
          esqlColumns: toolResult.data.columns,
          esqlQuery: toolResult.data.query,
        })
      );
    });

    it('uses tool results from previous rounds when current steps are empty', () => {
      useStepsFromPrevRoundsMock.mockReturnValue([toolCallStep]);

      const content = 'Here is a visualization:\n<visualization tool-result-id="6K4K" />';
      render(<ChatMessageText content={content} steps={[]} />);

      expect(mockVisualizeESQL).toHaveBeenCalledTimes(1);
      const props = mockVisualizeESQL.mock.calls[0][0];
      expect(props).toEqual(
        expect.objectContaining({
          esqlColumns: toolResult.data.columns,
          esqlQuery: toolResult.data.query,
        })
      );
    });

    it('passes the chartType to VisualizeESQL', () => {
      useStepsFromPrevRoundsMock.mockReturnValue([]);

      const content =
        'Here is a visualization:\n<visualization tool-result-id="6K4K" chart-type="Area" />';
      render(<ChatMessageText content={content} steps={[toolCallStep]} />);

      expect(mockVisualizeESQL).toHaveBeenCalledTimes(1);
      const props = mockVisualizeESQL.mock.calls[0][0];
      expect(props).toEqual(
        expect.objectContaining({
          esqlColumns: toolResult.data.columns,
          esqlQuery: toolResult.data.query,
          preferredChartType: 'Area',
        })
      );
    });

    it('renders multiple visualizations with different chart types in a single message', () => {
      useStepsFromPrevRoundsMock.mockReturnValue([]);

      const content = `Line Chart
<visualization tool-result-id="6K4K" chart-type="Line" />

Bar Chart
<visualization tool-result-id="6K4K" chart-type="Bar" />

Area Chart
<visualization tool-result-id="6K4K" chart-type="Area" />`;

      render(<ChatMessageText content={content} steps={[toolCallStep]} />);

      expect(mockVisualizeESQL).toHaveBeenCalledTimes(3);

      // Check that each visualization received the correct chart type
      const callArgs = mockVisualizeESQL.mock.calls.map((call: any) => ({
        preferredChartType: call[0].preferredChartType,
      }));

      expect(callArgs).toContainEqual(expect.objectContaining({ preferredChartType: 'Line' }));
      expect(callArgs).toContainEqual(expect.objectContaining({ preferredChartType: 'Bar' }));
      expect(callArgs).toContainEqual(expect.objectContaining({ preferredChartType: 'Area' }));
    });

    describe('Tabular data', () => {
      const content = dedent`
        | Column 1 | Column 2 |
        | -------- | -------: |
        | Lorem    | ipsum    |
      `;

      it('uses scrollable EuiTable to render Markdown tables', () => {
        render(<ChatMessageText content={content} steps={[]} />);

        const table = screen.getByRole('table');
        expect(table).toBeInTheDocument();

        // This class is part of the stable API
        expect(table).toHaveClass('euiTable');

        // Confirms that the table is indeed scrollable without relying on EUI internals
        expect(table.parentElement).toHaveStyleRule('overflow-inline', 'auto');
      });

      it('applies min and max width to all cells', () => {
        render(<ChatMessageText content={content} steps={[]} />);

        const check = (cells: HTMLElement[]) => {
          for (const cell of cells) {
            expect(cell).toHaveStyle({
              'min-width': '10em',
              'max-width': '30em',
            });
          }
        };

        check(screen.getAllByRole('cell')); // Body cells (<td>)
        check(screen.getAllByRole('columnheader')); // Header cells (<th>)
      });

      it('passes parsed column settings to cells', () => {
        render(<ChatMessageText content={content} steps={[]} />);

        // Column 2 has a right alignment configured, which needs to be passed
        // to all cells within that column. This ensures the {...rest} props
        // are correctly passed down in the customized `th` and `td` render functions.
        expect(screen.getByText('Column 2').closest('th')).toHaveStyle('text-align: right');
        expect(screen.getByText('ipsum').closest('td')).toHaveStyle('text-align: right');
      });
    });
  });
});
