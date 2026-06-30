import type { GraphEdge } from '@dagrejs/dagre';
import { graphlib } from '@dagrejs/dagre';
import type { WorkflowSettings, WorkflowYaml } from '../..';
import type { GraphNodeUnion } from '../types';
/**
 * A class that encapsulates the logic of workflow graph operations and provides
 * a specific API to work with directed graphs representing workflow definitions.
 *
 * This class wraps the graphlib.Graph functionality and provides workflow-specific
 * methods for traversing, analyzing, and extracting subgraphs from workflow definitions.
 *
 * @example
 * ```typescript
 * const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDef);
 * const nodes = workflowGraph.getAllNodes();
 * const stepGraph = workflowGraph.getStepGraph('step-id');
 * ```
 */
export declare class WorkflowGraph {
    private graph;
    private __topologicalOrder;
    private stepIdsSet;
    private innerStepIdsCache;
    constructor(graph: graphlib.Graph<GraphNodeUnion>);
    static fromWorkflowDefinition(workflowDefinition: WorkflowYaml, defaultSettings?: WorkflowSettings): WorkflowGraph;
    get topologicalOrder(): string[];
    getNode(nodeId: string): GraphNodeUnion;
    /**
     * Retrieves a step node by its step ID, accounting for control flow node prefixes.
     * This method tries to find the node with the given step ID, checking for common
     * control flow node prefixes (enterForeach_, enterCondition_, enterIf_, etc.)
     *
     * @param stepId - The step ID to search for
     * @returns The graph node if found, undefined otherwise
     */
    getStepNode(stepId: string): GraphNodeUnion | undefined;
    getNodeStack(nodeId: string): string[];
    getAllNodes(): GraphNodeUnion[];
    getEdges(): Array<{
        v: string;
        w: string;
    }>;
    getEdge(edgeMetadata: {
        v: string;
        w: string;
    }): GraphEdge;
    hasStep(stepId: string): boolean;
    getStepGraph(stepId: string): WorkflowGraph;
    getDirectSuccessors(nodeId: string): GraphNodeUnion[];
    /** Workflow settings timeout from the workflow-level enter-timeout-zone node, if present. */
    getWorkflowLevelTimeout(): string | undefined;
    getAllPredecessors(nodeId: string): GraphNodeUnion[];
    /** Inner stepIds for a compound step (excluding that step). Cached. */
    getInnerStepIds(compoundStepId: string): Set<string>;
}
