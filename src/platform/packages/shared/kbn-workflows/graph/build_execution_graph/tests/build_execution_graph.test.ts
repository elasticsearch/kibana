/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { graphlib } from '@dagrejs/dagre';
import {
  type ConnectorStep,
  DEFAULT_LOOP_MAX_ITERATIONS,
  type ElasticsearchStep,
  type ForEachStep,
  type IfStep,
  type KibanaStep,
  type LoopBreakStep,
  type LoopContinueStep,
  type WaitForApprovalStep,
  type WaitStep,
  type WhileStep,
  type WorkflowYaml,
} from '../../../spec/schema';
import type {
  AtomicGraphNode,
  ElasticsearchGraphNode,
  EnterConditionBranchNode,
  EnterForeachNode,
  EnterIfNode,
  ExitConditionBranchNode,
  ExitForeachNode,
  ExitIfNode,
  KibanaGraphNode,
  LoopBreakNode,
  LoopContinueNode,
  WaitGraphNode,
} from '../../types';
import { convertToWorkflowGraph } from '../build_execution_graph';

describe('convertToWorkflowGraph', () => {
  describe('atomic steps', () => {
    const workflowDefinition = {
      steps: [
        {
          name: 'testAtomicStep1',
          type: 'slack',
          connectorId: 'slack',
          with: {
            message: 'Hello from atomic step 1',
          },
        } as ConnectorStep,
        {
          name: 'testAtomicStep2',
          type: 'openai',
          connectorId: 'openai',
          with: {
            message: 'Hello from atomic step 2',
          },
        } as ConnectorStep,
      ],
    } as Partial<WorkflowYaml>;

    it('should return nodes for atomic step in correct topological order', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const topSort = graphlib.alg.topsort(executionGraph);
      expect(topSort).toHaveLength(2);
      expect(topSort).toEqual(['testAtomicStep1', 'testAtomicStep2']);
    });

    it('should return correct edges for atomic step graph', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const edges = executionGraph.edges();
      expect(edges).toEqual([{ v: 'testAtomicStep1', w: 'testAtomicStep2' }]);
    });

    it('should configure the atomic step correctly', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const node = executionGraph.node('testAtomicStep1');
      expect(node).toEqual({
        id: 'testAtomicStep1',
        type: 'atomic',
        stepId: 'testAtomicStep1',
        stepType: 'slack',
        configuration: {
          name: 'testAtomicStep1',
          type: 'slack',
          connectorId: 'slack',
          with: { message: 'Hello from atomic step 1' },
        },
      } as AtomicGraphNode);
    });
  });

  describe('wait step', () => {
    const workflowDefinition = {
      steps: [
        {
          name: 'testAtomicStep1',
          type: 'slack',
          connectorId: 'slack',
          with: {
            message: 'Hello from atomic step 1',
          },
        } as ConnectorStep,
        {
          name: 'testWaitStep',
          type: 'wait',
          with: {
            duration: '1s',
          },
        } as WaitStep,
        {
          name: 'testAtomicStep2',
          type: 'slack',
          connectorId: 'slack',
          with: {
            message: 'Hello from atomic step 2',
          },
        } as ConnectorStep,
      ],
    } as Partial<WorkflowYaml>;

    it('should return nodes for wait step in correct topological order', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const topSort = graphlib.alg.topsort(executionGraph);
      expect(topSort).toHaveLength(3);
      expect(topSort).toEqual(['testAtomicStep1', 'testWaitStep', 'testAtomicStep2']);
    });

    it('should return correct edges for wait step graph', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const edges = executionGraph.edges();
      expect(edges).toEqual([
        { v: 'testAtomicStep1', w: 'testWaitStep' },
        { v: 'testWaitStep', w: 'testAtomicStep2' },
      ]);
    });

    it('should configure the wait step correctly', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const node = executionGraph.node('testWaitStep');
      expect(node).toEqual({
        id: 'testWaitStep',
        type: 'wait',
        stepId: 'testWaitStep',
        stepType: 'wait',
        configuration: {
          name: 'testWaitStep',
          type: 'wait',
          with: { duration: '1s' },
        },
      } as WaitGraphNode);
    });
  });

  describe('if step', () => {
    const workflowDefinition = {
      steps: [
        {
          name: 'testAtomicStep1',
          type: 'slack',
          connectorId: 'slack',
          with: {
            message: 'Hello from atomic step 1',
          },
        } as ConnectorStep,
        {
          name: 'testWaitStep',
          type: 'wait',
          with: {
            duration: '1s',
          },
        } as WaitStep,
        {
          name: 'testAtomicStep2',
          type: 'slack',
          connectorId: 'slack',
          with: {
            message: 'Hello from atomic step 2',
          },
        } as ConnectorStep,
      ],
    } as Partial<WorkflowYaml>;

    it('should return nodes for wait step in correct topological order', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const topSort = graphlib.alg.topsort(executionGraph);
      expect(topSort).toHaveLength(3);
      expect(topSort).toEqual(['testAtomicStep1', 'testWaitStep', 'testAtomicStep2']);
    });

    it('should return correct edges for wait step graph', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const edges = executionGraph.edges();
      expect(edges).toEqual([
        { v: 'testAtomicStep1', w: 'testWaitStep' },
        { v: 'testWaitStep', w: 'testAtomicStep2' },
      ]);
    });
  });

  describe('elasticsearch step', () => {
    const workflowDefinition = {
      steps: [
        {
          name: 'testElasticsearchStep',
          type: 'elasticsearch.search.query',
          with: {
            index: 'logs-*',
            query: {
              match: {
                message: 'error',
              },
            },
            size: 10,
          },
        } as ElasticsearchStep,
      ],
    } as Partial<WorkflowYaml>;

    it('should return nodes for elasticsearch step in correct topological order', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const topSort = graphlib.alg.topsort(executionGraph);
      expect(topSort).toHaveLength(1);
      expect(topSort).toEqual(['testElasticsearchStep']);
    });

    it('should configure the elasticsearch step correctly', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const node = executionGraph.node('testElasticsearchStep');
      expect(node).toEqual({
        id: 'testElasticsearchStep',
        type: 'elasticsearch.search.query',
        stepId: 'testElasticsearchStep',
        stepType: 'elasticsearch.search.query',
        configuration: {
          name: 'testElasticsearchStep',
          type: 'elasticsearch.search.query',
          with: {
            index: 'logs-*',
            query: {
              match: {
                message: 'error',
              },
            },
            size: 10,
          },
        },
      } as ElasticsearchGraphNode);
    });

    it('should handle elasticsearch step with raw API format', () => {
      const rawApiWorkflow = {
        steps: [
          {
            name: 'testElasticsearchRawStep',
            type: 'elasticsearch.search',
            with: {
              request: {
                method: 'GET',
                path: '/logs-*/_search',
                body: {
                  query: {
                    match: {
                      message: 'error',
                    },
                  },
                  size: 5,
                },
              },
            },
          } as ElasticsearchStep,
        ],
      } as Partial<WorkflowYaml>;

      const executionGraph = convertToWorkflowGraph(rawApiWorkflow as any);
      const node = executionGraph.node(
        'testElasticsearchRawStep'
      ) as unknown as ElasticsearchGraphNode;
      expect(node.type).toBe('elasticsearch.search');
      expect(node.configuration.with.request.path).toBe('/logs-*/_search');
    });
  });

  describe('kibana step', () => {
    const workflowDefinition = {
      steps: [
        {
          name: 'testKibanaStep',
          type: 'kibana.cases.create',
          with: {
            title: 'Test Case',
            description: 'A test case created by workflow',
            tags: ['automation'],
            severity: 'medium',
          },
        } as KibanaStep,
      ],
    } as Partial<WorkflowYaml>;

    it('should return nodes for kibana step in correct topological order', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const topSort = graphlib.alg.topsort(executionGraph);
      expect(topSort).toHaveLength(1);
      expect(topSort).toEqual(['testKibanaStep']);
    });

    it('should configure the kibana step correctly', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const node = executionGraph.node('testKibanaStep');
      expect(node).toEqual({
        id: 'testKibanaStep',
        type: 'kibana.cases.create',
        stepId: 'testKibanaStep',
        stepType: 'kibana.cases.create',
        configuration: {
          name: 'testKibanaStep',
          type: 'kibana.cases.create',
          with: {
            title: 'Test Case',
            description: 'A test case created by workflow',
            tags: ['automation'],
            severity: 'medium',
          },
        },
      } as KibanaGraphNode);
    });

    it('should handle kibana step with raw API format', () => {
      const rawApiWorkflow = {
        steps: [
          {
            name: 'testKibanaRawStep',
            type: 'kibana.cases.get',
            with: {
              request: {
                method: 'GET',
                path: '/api/cases/test-case-id',
                headers: {
                  'kbn-xsrf': 'true',
                },
              },
            },
          } as KibanaStep,
        ],
      } as Partial<WorkflowYaml>;

      const executionGraph = convertToWorkflowGraph(rawApiWorkflow as any);
      const node = executionGraph.node('testKibanaRawStep') as unknown as KibanaGraphNode;
      expect(node.type).toBe('kibana.cases.get');
      expect(node.configuration.with.request.path).toBe('/api/cases/test-case-id');
    });
  });

  describe('if condition', () => {
    describe('if step', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'testIfStep',
            type: 'if',
            condition: 'true',
            steps: [
              {
                name: 'firstThenTestConnectorStep',
                type: 'slack',
                connectorId: 'slack',
                with: {
                  message: 'Hello from then step 1',
                },
              } as ConnectorStep,
              {
                name: 'secondThenTestConnectorStep',
                type: 'openai',
                connectorId: 'openai',
                with: {
                  message: 'Hello from then nested step 2',
                },
              } as ConnectorStep,
            ],
            else: [
              {
                name: 'elseTestConnectorStep',
                type: 'slack',
                connectorId: 'slack',
                with: {
                  message: 'Hello from else nested step',
                },
              } as ConnectorStep,
            ],
          } as IfStep,
        ],
      } as Partial<WorkflowYaml>;

      it('should return nodes for if condition in correct topological order', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const topSort = graphlib.alg.topsort(executionGraph);
        expect(topSort).toHaveLength(9);
        expect(topSort).toEqual([
          'enterCondition_testIfStep',
          'enterThen_testIfStep',
          'firstThenTestConnectorStep',
          'secondThenTestConnectorStep',
          'exitThen_testIfStep',
          'enterElse_testIfStep',
          'elseTestConnectorStep',
          'exitElse_testIfStep',
          'exitCondition_testIfStep',
        ]);
      });

      it('should return correct edges for if step graph', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const edges = executionGraph.edges();
        expect(edges).toEqual(
          expect.arrayContaining([
            {
              v: 'enterCondition_testIfStep',
              w: 'enterThen_testIfStep',
            },
            {
              v: 'enterThen_testIfStep',
              w: 'firstThenTestConnectorStep',
            },
            {
              v: 'secondThenTestConnectorStep',
              w: 'exitThen_testIfStep',
            },
            {
              v: 'firstThenTestConnectorStep',
              w: 'secondThenTestConnectorStep',
            },
            {
              v: 'exitThen_testIfStep',
              w: 'exitCondition_testIfStep',
            },
            {
              v: 'enterCondition_testIfStep',
              w: 'enterElse_testIfStep',
            },
            {
              v: 'enterElse_testIfStep',
              w: 'elseTestConnectorStep',
            },
            {
              v: 'elseTestConnectorStep',
              w: 'exitElse_testIfStep',
            },
            {
              v: 'exitElse_testIfStep',
              w: 'exitCondition_testIfStep',
            },
          ])
        );
        expect(edges).toHaveLength(9);
      });

      it('should configure enter-if node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const enterIfNode = executionGraph.node('enterCondition_testIfStep');
        expect(enterIfNode).toEqual({
          id: 'enterCondition_testIfStep',
          type: 'enter-if',
          stepId: 'testIfStep',
          stepType: 'if',
          exitNodeId: 'exitCondition_testIfStep',
          configuration: {
            name: 'testIfStep',
            type: 'if',
            condition: 'true',
          },
        } as EnterIfNode);
      });

      it('should configure enter-then branch node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const enterThenBranchNode = executionGraph.node('enterThen_testIfStep');
        expect(enterThenBranchNode).toEqual({
          id: 'enterThen_testIfStep',
          type: 'enter-then-branch',
          stepId: 'testIfStep',
          stepType: 'if',
          condition: 'true',
        } as EnterConditionBranchNode);
      });

      it('should configure exit-then branch node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const exitThenBranchNode = executionGraph.node('exitThen_testIfStep');
        expect(exitThenBranchNode).toEqual({
          id: 'exitThen_testIfStep',
          type: 'exit-then-branch',
          stepId: 'testIfStep',
          stepType: 'if',
          startNodeId: 'enterThen_testIfStep',
        } as ExitConditionBranchNode);
      });

      it('should configure enter-else branch node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const enterElseBranchNode = executionGraph.node('enterElse_testIfStep');
        expect(enterElseBranchNode).toEqual({
          id: 'enterElse_testIfStep',
          type: 'enter-else-branch',
          stepId: 'testIfStep',
          stepType: 'if',
          condition: undefined,
        } as EnterConditionBranchNode);
      });

      it('should configure exit-else branch node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const exitElseBranchNode = executionGraph.node('exitElse_testIfStep');
        expect(exitElseBranchNode).toEqual({
          id: 'exitElse_testIfStep',
          type: 'exit-else-branch',
          stepId: 'testIfStep',
          stepType: 'if',
          startNodeId: 'enterElse_testIfStep',
        } as ExitConditionBranchNode);
      });

      it('should configure exit-if node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const exitConditionNode = executionGraph.node('exitCondition_testIfStep');
        expect(exitConditionNode).toEqual({
          id: 'exitCondition_testIfStep',
          type: 'exit-if',
          stepId: 'testIfStep',
          stepType: 'if',
          startNodeId: 'enterCondition_testIfStep',
        } as ExitIfNode);
      });

      describe('if step without else branch', () => {
        const workflowDefinitionWithoutElse = {
          steps: [
            {
              name: 'testIfStepWithoutElse',
              type: 'if',
              condition: 'true',
              steps: [
                {
                  name: 'thenTestConnectorStep',
                  type: 'slack',
                  connectorId: 'slack',
                  with: {
                    message: 'Hello from then step',
                  },
                } as ConnectorStep,
              ],
            } as IfStep,
          ],
        } as Partial<WorkflowYaml>;

        it('should handle if step without else branch correctly', () => {
          const executionGraph = convertToWorkflowGraph(workflowDefinitionWithoutElse as any);
          const topSort = graphlib.alg.topsort(executionGraph);
          expect(topSort).toHaveLength(5);
          expect(topSort).toEqual([
            'enterCondition_testIfStepWithoutElse',
            'enterThen_testIfStepWithoutElse',
            'thenTestConnectorStep',
            'exitThen_testIfStepWithoutElse',
            'exitCondition_testIfStepWithoutElse',
          ]);
        });
      });
    });

    describe('step level if condition', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'firstThenTestConnectorStep',
            type: 'slack',
            connectorId: 'slack',
            if: 'false',
            with: {
              message: 'Hello from then step 1',
            },
          } as ConnectorStep,
          {
            name: 'secondThenTestConnectorStep',
            type: 'openai',
            connectorId: 'openai',
            with: {
              message: 'Hello from then nested step 2',
            },
          } as ConnectorStep,
        ],
      } as Partial<WorkflowYaml>;

      it('should turn step with if condition into if graph node and return nodes in correct topological order', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const topSort = graphlib.alg.topsort(executionGraph);
        expect(topSort).toHaveLength(6);
        expect(topSort).toEqual([
          'enterCondition_if_firstThenTestConnectorStep',
          'enterThen_if_firstThenTestConnectorStep',
          'firstThenTestConnectorStep',
          'exitThen_if_firstThenTestConnectorStep',
          'exitCondition_if_firstThenTestConnectorStep',
          'secondThenTestConnectorStep',
        ]);
      });

      it('should return correct edges for if step graph', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const edges = executionGraph.edges();
        expect(edges).toEqual(
          expect.arrayContaining([
            {
              v: 'enterCondition_if_firstThenTestConnectorStep',
              w: 'enterThen_if_firstThenTestConnectorStep',
            },
            {
              v: 'enterThen_if_firstThenTestConnectorStep',
              w: 'firstThenTestConnectorStep',
            },
            {
              v: 'firstThenTestConnectorStep',
              w: 'exitThen_if_firstThenTestConnectorStep',
            },
            {
              v: 'exitThen_if_firstThenTestConnectorStep',
              w: 'exitCondition_if_firstThenTestConnectorStep',
            },
            {
              v: 'exitCondition_if_firstThenTestConnectorStep',
              w: 'secondThenTestConnectorStep',
            },
          ])
        );
        expect(edges).toHaveLength(5);
      });

      it('should configure enter-if node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const enterIfNode = executionGraph.node('enterCondition_if_firstThenTestConnectorStep');
        expect(enterIfNode).toEqual({
          id: 'enterCondition_if_firstThenTestConnectorStep',
          type: 'enter-if',
          stepId: 'if_firstThenTestConnectorStep',
          stepType: 'if',
          exitNodeId: 'exitCondition_if_firstThenTestConnectorStep',
          configuration: {
            name: 'if_firstThenTestConnectorStep',
            type: 'if',
            condition: 'false',
          },
        } as EnterIfNode);
      });

      it('should configure enter-then branch node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const enterThenBranchNode = executionGraph.node('enterThen_if_firstThenTestConnectorStep');
        expect(enterThenBranchNode).toEqual({
          id: 'enterThen_if_firstThenTestConnectorStep',
          type: 'enter-then-branch',
          stepId: 'if_firstThenTestConnectorStep',
          stepType: 'if',
          condition: 'false',
        } as EnterConditionBranchNode);
      });

      it('should not include if condition to the step inside if step', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const innerStep = executionGraph.node(
          'firstThenTestConnectorStep'
        ) as unknown as AtomicGraphNode;
        expect((innerStep.configuration as ConnectorStep).if).toBeUndefined();
      });

      it('should configure exit-then branch node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const exitThenBranchNode = executionGraph.node('exitThen_if_firstThenTestConnectorStep');
        expect(exitThenBranchNode).toEqual({
          id: 'exitThen_if_firstThenTestConnectorStep',
          type: 'exit-then-branch',
          stepId: 'if_firstThenTestConnectorStep',
          stepType: 'if',
          startNodeId: 'enterThen_if_firstThenTestConnectorStep',
        } as ExitConditionBranchNode);
      });

      it('should configure exit-if node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const exitConditionNode = executionGraph.node(
          'exitCondition_if_firstThenTestConnectorStep'
        );
        expect(exitConditionNode).toEqual({
          id: 'exitCondition_if_firstThenTestConnectorStep',
          type: 'exit-if',
          stepId: 'if_firstThenTestConnectorStep',
          stepType: 'if',
          startNodeId: 'enterCondition_if_firstThenTestConnectorStep',
        } as ExitIfNode);
      });
    });
  });

  describe('foreach', () => {
    describe('foreach step', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'testForeachStep',
            foreach: '["item1", "item2", "item3"]',
            type: 'foreach',
            steps: [
              {
                name: 'firstTestForeachConnectorStep',
                type: 'slack',
                connectorId: 'slack',
                with: {
                  message: 'Hello from foreach nested step 1',
                },
              } as ConnectorStep,
              {
                name: 'secondTestForeachConnectorStep',
                type: 'openai',
                connectorId: 'openai',
                with: {
                  message: 'Hello from foreach nested step 2',
                },
              } as ConnectorStep,
            ],
          } as ForEachStep,
        ],
      } as Partial<WorkflowYaml>;

      it('should return nodes for foreach step in correct topological order', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const topSort = graphlib.alg.topsort(executionGraph);
        expect(topSort).toHaveLength(4);
        expect(topSort).toEqual([
          'enterForeach_testForeachStep',
          'firstTestForeachConnectorStep',
          'secondTestForeachConnectorStep',
          'exitForeach_testForeachStep',
        ]);
      });

      it('should return correct edges for foreach step graph', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const edges = executionGraph.edges();
        expect(edges).toEqual(
          expect.arrayContaining([
            { v: 'enterForeach_testForeachStep', w: 'firstTestForeachConnectorStep' },
            { v: 'firstTestForeachConnectorStep', w: 'secondTestForeachConnectorStep' },
            { v: 'secondTestForeachConnectorStep', w: 'exitForeach_testForeachStep' },
          ])
        );
        expect(edges).toHaveLength(3);
      });

      it('should configure enter-foreach node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const enterForeachNode = executionGraph.node('enterForeach_testForeachStep');
        expect(enterForeachNode).toEqual({
          id: 'enterForeach_testForeachStep',
          type: 'enter-foreach',
          stepId: 'testForeachStep',
          stepType: 'foreach',
          exitNodeId: 'exitForeach_testForeachStep',
          configuration: {
            foreach: '["item1", "item2", "item3"]',
            name: 'testForeachStep',
            type: 'foreach',
          },
        } as EnterForeachNode);
      });

      it('should configure exit-foreach node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const exitForeachNode = executionGraph.node('exitForeach_testForeachStep');
        expect(exitForeachNode).toEqual({
          type: 'exit-foreach',
          id: 'exitForeach_testForeachStep',
          stepType: 'foreach',
          stepId: 'testForeachStep',
          startNodeId: 'enterForeach_testForeachStep',
          maxIterations: DEFAULT_LOOP_MAX_ITERATIONS,
          onLimit: 'continue',
        } as ExitForeachNode);
      });

      describe('nested foreach steps', () => {
        const nestedWorkflowDefinition = {
          steps: [
            {
              name: 'outerForeachStep',
              foreach: '["outer1", "outer2"]',
              type: 'foreach',
              steps: [
                {
                  name: 'innerForeachStep',
                  foreach: '["inner1", "inner2"]',
                  type: 'foreach',
                  steps: [
                    {
                      name: 'nestedConnectorStep',
                      type: 'slack',
                      connectorId: 'slack',
                      with: {
                        message: 'Hello from nested step',
                      },
                    } as ConnectorStep,
                  ],
                } as ForEachStep,
              ],
            } as ForEachStep,
          ],
        } as Partial<WorkflowYaml>;

        it('should have correct edges', () => {
          const executionGraph = convertToWorkflowGraph(nestedWorkflowDefinition as any);
          const edges = executionGraph.edges();
          expect(edges).toEqual(
            expect.arrayContaining([
              {
                v: 'enterForeach_outerForeachStep',
                w: 'enterForeach_innerForeachStep',
              },
              {
                v: 'exitForeach_innerForeachStep',
                w: 'exitForeach_outerForeachStep',
              },
              {
                v: 'enterForeach_innerForeachStep',
                w: 'nestedConnectorStep',
              },
              {
                v: 'nestedConnectorStep',
                w: 'exitForeach_innerForeachStep',
              },
            ])
          );
          expect(edges).toHaveLength(4);
        });

        it('should handle nested foreach steps correctly', () => {
          const executionGraph = convertToWorkflowGraph(nestedWorkflowDefinition as any);
          const topSort = graphlib.alg.topsort(executionGraph);
          expect(topSort).toHaveLength(5);
          expect(topSort).toEqual([
            'enterForeach_outerForeachStep',
            'enterForeach_innerForeachStep',
            'nestedConnectorStep',
            'exitForeach_innerForeachStep',
            'exitForeach_outerForeachStep',
          ]);
        });
      });
    });

    describe('step level foreach', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'testForeachConnectorStep',
            type: 'slack',
            connectorId: 'slack',
            foreach: '["item1", "item2", "item3"]',
            with: {
              message: 'Hello from foreach nested step 1',
            },
          } as ConnectorStep,
          {
            name: 'secondConnectorStep',
            type: 'openai',
            connectorId: 'openai',
            with: {
              message: 'Hello from foreach nested step 2',
            },
          } as ConnectorStep,
        ],
      } as Partial<WorkflowYaml>;

      it('should turn step with foreach into foreach graph node and return nodes for foreach step in correct topological order', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const topSort = graphlib.alg.topsort(executionGraph);
        expect(topSort).toHaveLength(4);
        expect(topSort).toEqual([
          'enterForeach_foreach_testForeachConnectorStep',
          'testForeachConnectorStep',
          'exitForeach_foreach_testForeachConnectorStep',
          'secondConnectorStep',
        ]);
      });

      it('should return correct edges for foreach step graph', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const edges = executionGraph.edges();
        expect(edges).toEqual(
          expect.arrayContaining([
            {
              v: 'enterForeach_foreach_testForeachConnectorStep',
              w: 'testForeachConnectorStep',
            },
            {
              v: 'testForeachConnectorStep',
              w: 'exitForeach_foreach_testForeachConnectorStep',
            },
            {
              v: 'exitForeach_foreach_testForeachConnectorStep',
              w: 'secondConnectorStep',
            },
          ])
        );
        expect(edges).toHaveLength(3);
      });

      it('should configure enter-foreach node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const enterForeachNode = executionGraph.node(
          'enterForeach_foreach_testForeachConnectorStep'
        );
        expect(enterForeachNode).toEqual({
          id: 'enterForeach_foreach_testForeachConnectorStep',
          type: 'enter-foreach',
          stepId: 'foreach_testForeachConnectorStep',
          stepType: 'foreach',
          exitNodeId: 'exitForeach_foreach_testForeachConnectorStep',
          configuration: {
            foreach: '["item1", "item2", "item3"]',
            name: 'foreach_testForeachConnectorStep',
            type: 'foreach',
          },
        } as EnterForeachNode);
      });

      it('should not include foreach to the step inside foreach step', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const innerStep = executionGraph.node(
          'testForeachConnectorStep'
        ) as unknown as AtomicGraphNode;
        expect((innerStep.configuration as ConnectorStep).foreach).toBeUndefined();
      });

      it('should configure exit-foreach node correctly', () => {
        const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
        const exitForeachNode = executionGraph.node('exitForeach_foreach_testForeachConnectorStep');
        expect(exitForeachNode).toEqual({
          type: 'exit-foreach',
          id: 'exitForeach_foreach_testForeachConnectorStep',
          stepId: 'foreach_testForeachConnectorStep',
          stepType: 'foreach',
          startNodeId: 'enterForeach_foreach_testForeachConnectorStep',
          maxIterations: DEFAULT_LOOP_MAX_ITERATIONS,
          onLimit: 'continue',
        } as ExitForeachNode);
      });
    });
  });

  describe('complex workflow', () => {
    const workflowDefinition = {
      steps: [
        {
          name: 'firstConnectorStep',
          type: 'slack',
          connectorId: 'slack',
          with: {
            message: 'Hello from first step',
          },
        } as ConnectorStep,
        {
          name: 'testForeachStep',
          foreach: '["item1", "item2", "item3"]',
          type: 'foreach',
          steps: [
            {
              name: 'testIfStep',
              type: 'if',
              condition: 'true',
              steps: [
                {
                  name: 'firstThenTestConnectorStep',
                  type: 'slack',
                  connectorId: 'slack',
                  with: {
                    message: 'Hello from then step 1',
                  },
                } as ConnectorStep,
                {
                  name: 'secondThenTestConnectorStep',
                  type: 'openai',
                  connectorId: 'openai',
                  with: {
                    message: 'Hello from then nested step 2',
                  },
                } as ConnectorStep,
              ],
              else: [
                {
                  name: 'elseTestConnectorStep',
                  type: 'slack',
                  connectorId: 'slack',
                  with: {
                    message: 'Hello from else nested step',
                  },
                } as ConnectorStep,
              ],
            } as IfStep,
          ],
        } as ForEachStep,
      ],
    } as Partial<WorkflowYaml>;

    it('should have correctly structured graph for complex nodes', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const topsort = graphlib.alg.topsort(executionGraph);
      const expectedComplexOrder = [
        'firstConnectorStep',
        'enterForeach_testForeachStep',
        'enterCondition_testIfStep',
        'enterThen_testIfStep',
        'firstThenTestConnectorStep',
        'secondThenTestConnectorStep',
        'exitThen_testIfStep',
        'enterElse_testIfStep',
        'elseTestConnectorStep',
        'exitElse_testIfStep',
        'exitCondition_testIfStep',
        'exitForeach_testForeachStep',
      ];
      expect(topsort).toEqual(expectedComplexOrder);
    });
  });

  describe('step with foreach and if condition', () => {
    const workflowDefinition = {
      steps: [
        {
          name: 'testForeachConnectorStep',
          type: 'slack',
          connectorId: 'slack',
          if: 'false',
          foreach: '["item1", "item2", "item3"]',
          with: {
            message: 'Hello from foreach nested step 1',
          },
        } as ConnectorStep,
      ],
    } as Partial<WorkflowYaml>;

    it('should wrap foreach step in if step in topological order', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const topsort = graphlib.alg.topsort(executionGraph);
      expect(topsort).toEqual([
        'enterCondition_if_testForeachConnectorStep',
        'enterThen_if_testForeachConnectorStep',
        'enterForeach_foreach_testForeachConnectorStep',
        'testForeachConnectorStep',
        'exitForeach_foreach_testForeachConnectorStep',
        'exitThen_if_testForeachConnectorStep',
        'exitCondition_if_testForeachConnectorStep',
      ]);
    });

    it('should have correct edges', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const edges = executionGraph.edges();
      expect(edges).toEqual(
        expect.arrayContaining([
          {
            v: 'enterCondition_if_testForeachConnectorStep',
            w: 'enterThen_if_testForeachConnectorStep',
          },
          {
            v: 'enterThen_if_testForeachConnectorStep',
            w: 'enterForeach_foreach_testForeachConnectorStep',
          },
          {
            v: 'exitForeach_foreach_testForeachConnectorStep',
            w: 'exitThen_if_testForeachConnectorStep',
          },
          {
            v: 'enterForeach_foreach_testForeachConnectorStep',
            w: 'testForeachConnectorStep',
          },
          {
            v: 'testForeachConnectorStep',
            w: 'exitForeach_foreach_testForeachConnectorStep',
          },
          {
            v: 'exitThen_if_testForeachConnectorStep',
            w: 'exitCondition_if_testForeachConnectorStep',
          },
        ])
      );
      expect(edges).toHaveLength(6);
    });
  });

  describe('step level foreach in if step', () => {
    const workflowDefinition = {
      steps: [
        {
          name: 'testIfStep',
          type: 'if',
          condition: 'true',
          steps: [
            {
              name: 'testForeachConnectorStep',
              type: 'slack',
              connectorId: 'slack',
              foreach: '["item1", "item2", "item3"]',
              with: {
                message: 'Hello from foreach nested step 1',
              },
            } as ConnectorStep,
          ],
        } as IfStep,
      ],
    } as Partial<WorkflowYaml>;

    it('should wrap foreach step in if step', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const topsort = graphlib.alg.topsort(executionGraph);
      expect(topsort).toEqual([
        'enterCondition_testIfStep',
        'enterThen_testIfStep',
        'enterForeach_foreach_testForeachConnectorStep',
        'testForeachConnectorStep',
        'exitForeach_foreach_testForeachConnectorStep',
        'exitThen_testIfStep',
        'exitCondition_testIfStep',
      ]);
    });
  });

  describe('step level operations', () => {
    const workflowDefinition = {
      steps: [
        {
          name: 'testForeachConnectorStep',
          type: 'slack',
          connectorId: 'slack',
          if: 'false',
          foreach: '["item1", "item2", "item3"]',
          'on-failure': {
            retry: {
              'max-attempts': 10,
              delay: '2s',
            },
            fallback: [
              {
                name: 'innerFallbackStep',
                type: 'slack',
                connectorId: 'slack',
                with: {
                  message: 'Hello from foreach nested step 1',
                },
              } as ConnectorStep,
            ],
            continue: true,
          },
          with: {
            message: 'Hello from foreach nested step 1',
          },
        } as ConnectorStep,
      ],
    } as Partial<WorkflowYaml>;

    it('should have correct topological order', () => {
      const executionGraph = convertToWorkflowGraph(workflowDefinition as any);
      const topsort = graphlib.alg.topsort(executionGraph);
      expect(topsort).toEqual([
        'enterContinue_testForeachConnectorStep',
        'enterTryBlock_testForeachConnectorStep',
        'enterNormalPath_testForeachConnectorStep',
        'enterRetry_testForeachConnectorStep',
        'enterCondition_if_testForeachConnectorStep',
        'enterThen_if_testForeachConnectorStep',
        'enterForeach_foreach_testForeachConnectorStep',
        'testForeachConnectorStep',
        'exitForeach_foreach_testForeachConnectorStep',
        'exitThen_if_testForeachConnectorStep',
        'exitCondition_if_testForeachConnectorStep',
        'exitRetry_testForeachConnectorStep',
        'exitNormalPath_testForeachConnectorStep',
        'enterFallbackPath_testForeachConnectorStep',
        'innerFallbackStep',
        'exitFallbackPath_testForeachConnectorStep',
        'exitTryBlock_testForeachConnectorStep',
        'exitContinue_testForeachConnectorStep',
      ]);
    });
  });

  describe('loop.break and loop.continue', () => {
    it('should create loop-break node inside a foreach loop', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'my_loop',
            type: 'foreach',
            foreach: '{{ items }}',
            steps: [
              { name: 'step_a', type: 'console' } as ConnectorStep,
              { name: 'stop_early', type: 'loop.break' } as LoopBreakStep,
            ],
          } as ForEachStep,
        ],
      } as Partial<WorkflowYaml>;

      const graph = convertToWorkflowGraph(workflowDefinition as any);
      const breakNode = graph.node('stop_early') as LoopBreakNode;

      expect(breakNode).toBeDefined();
      expect(breakNode.type).toBe('loop-break');
      expect(breakNode.loopExitNodeId).toBe('exitForeach_my_loop');
      expect(breakNode.loopStepId).toBe('my_loop');
    });

    it('should create loop-continue node inside a foreach loop', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'my_loop',
            type: 'foreach',
            foreach: '{{ items }}',
            steps: [
              { name: 'skip_item', type: 'loop.continue' } as LoopContinueStep,
              { name: 'step_a', type: 'console' } as ConnectorStep,
            ],
          } as ForEachStep,
        ],
      } as Partial<WorkflowYaml>;

      const graph = convertToWorkflowGraph(workflowDefinition as any);
      const continueNode = graph.node('skip_item') as LoopContinueNode;

      expect(continueNode).toBeDefined();
      expect(continueNode.type).toBe('loop-continue');
      expect(continueNode.loopExitNodeId).toBe('exitForeach_my_loop');
    });

    it('should create loop-break node inside a while loop', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'my_while',
            type: 'while',
            condition: 'true',
            steps: [{ name: 'stop_loop', type: 'loop.break' } as LoopBreakStep],
          } as WhileStep,
        ],
      } as Partial<WorkflowYaml>;

      const graph = convertToWorkflowGraph(workflowDefinition as any);
      const breakNode = graph.node('stop_loop') as LoopBreakNode;

      expect(breakNode).toBeDefined();
      expect(breakNode.type).toBe('loop-break');
      expect(breakNode.loopExitNodeId).toBe('exitWhile_my_while');
      expect(breakNode.loopStepId).toBe('my_while');
    });

    it('should support conditional loop.break via the generic inline if mechanism', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'my_loop',
            type: 'foreach',
            foreach: '{{ items }}',
            steps: [
              {
                name: 'conditional_break',
                type: 'loop.break',
                if: 'foreach.item.status : "done"',
              } as LoopBreakStep,
            ],
          } as ForEachStep,
        ],
      } as Partial<WorkflowYaml>;

      const graph = convertToWorkflowGraph(workflowDefinition as any);

      const enterIfNode = graph.node('enterCondition_if_conditional_break') as EnterIfNode;
      expect(enterIfNode).toBeDefined();
      expect(enterIfNode.type).toBe('enter-if');
      expect(enterIfNode.configuration).toEqual(
        expect.objectContaining({ condition: 'foreach.item.status : "done"' })
      );

      const breakNode = graph.node('conditional_break') as LoopBreakNode;
      expect(breakNode).toBeDefined();
      expect(breakNode.type).toBe('loop-break');
      expect(breakNode.loopExitNodeId).toBe('exitForeach_my_loop');
    });

    it('should throw when loop.break is used outside a loop', () => {
      const workflowDefinition = {
        steps: [{ name: 'break_outside', type: 'loop.break' } as LoopBreakStep],
      } as Partial<WorkflowYaml>;

      expect(() => convertToWorkflowGraph(workflowDefinition as any)).toThrow(
        /loop\.break and loop\.continue are only valid inside a loop body/
      );
    });

    it('should throw when loop.continue is used outside a loop', () => {
      const workflowDefinition = {
        steps: [{ name: 'continue_outside', type: 'loop.continue' } as LoopContinueStep],
      } as Partial<WorkflowYaml>;

      expect(() => convertToWorkflowGraph(workflowDefinition as any)).toThrow(
        /loop\.break and loop\.continue are only valid inside a loop body/
      );
    });

    it('should target the innermost loop in nested loops', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'outer_loop',
            type: 'foreach',
            foreach: '{{ outer_items }}',
            steps: [
              {
                name: 'inner_loop',
                type: 'foreach',
                foreach: '{{ inner_items }}',
                steps: [{ name: 'break_inner', type: 'loop.break' } as LoopBreakStep],
              } as ForEachStep,
            ],
          } as ForEachStep,
        ],
      } as Partial<WorkflowYaml>;

      const graph = convertToWorkflowGraph(workflowDefinition as any);
      const breakNode = graph.node('break_inner') as LoopBreakNode;

      expect(breakNode).toBeDefined();
      expect(breakNode.type).toBe('loop-break');
      expect(breakNode.loopExitNodeId).toBe('exitForeach_inner_loop');
      expect(breakNode.loopStepId).toBe('inner_loop');
    });
  });

  describe('waitForApproval step', () => {
    it('should build a graph without entering an infinite timeout recursion', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'request-approval',
            type: 'waitForApproval',
            timeout: '24h',
            with: {
              message: 'Approve?',
            },
          } as WaitForApprovalStep,
        ],
      } as Partial<WorkflowYaml>;

      expect(() => convertToWorkflowGraph(workflowDefinition as WorkflowYaml)).not.toThrow();

      const graph = convertToWorkflowGraph(workflowDefinition as WorkflowYaml);
      expect(graph.node('request-approval')).toEqual(
        expect.objectContaining({
          type: 'waitForApproval',
          configuration: expect.objectContaining({
            timeout: '24h',
          }),
        })
      );
    });

    it('should default approval timeout when omitted', () => {
      const workflowDefinition = {
        steps: [
          {
            name: 'request-approval',
            type: 'waitForApproval',
            with: {
              message: 'Approve?',
            },
          } as WaitForApprovalStep,
        ],
      } as Partial<WorkflowYaml>;

      const graph = convertToWorkflowGraph(workflowDefinition as WorkflowYaml);

      expect(graph.node('request-approval')).toEqual(
        expect.objectContaining({
          configuration: expect.objectContaining({
            timeout: '24h',
          }),
        })
      );
    });
  });
});
