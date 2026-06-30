import type { AtomicGraphNode, DataSetGraphNode, ElasticsearchGraphNode, KibanaGraphNode, WaitForInputGraphNode, WaitGraphNode, WorkflowOutputGraphNode } from './nodes/base';
import type { EnterConditionBranchNode, EnterIfNode, ExitConditionBranchNode, ExitIfNode } from './nodes/branching_nodes';
import type { LoopBreakNode, LoopContinueNode } from './nodes/flow_control_nodes';
import type { EnterForeachNode, EnterWhileNode, ExitForeachNode, ExitWhileNode } from './nodes/loop_nodes';
import type { EnterContinueNode, EnterNormalPathNode, EnterRetryNode, EnterTimeoutZoneNode, EnterTryBlockNode, ExitContinueNode, ExitNormalPathNode, ExitRetryNode, ExitTimeoutZoneNode, ExitTryBlockNode } from './nodes/on_failure_nodes';
import type { EnterCaseBranchNode, EnterDefaultBranchNode, EnterSwitchNode, ExitCaseBranchNode, ExitDefaultBranchNode, ExitSwitchNode } from './nodes/switch_nodes';
import type { GraphNodeUnion } from './nodes/union';
import type { LoopStepType } from '../../spec/schema';
export declare const isAtomic: (node: GraphNodeUnion) => node is AtomicGraphNode;
export declare const isElasticsearch: (node: GraphNodeUnion) => node is ElasticsearchGraphNode;
export declare const isKibana: (node: GraphNodeUnion) => node is KibanaGraphNode;
export declare const isWait: (node: GraphNodeUnion) => node is WaitGraphNode;
export declare const isWaitForInput: (node: GraphNodeUnion) => node is WaitForInputGraphNode;
export declare const isDataSet: (node: GraphNodeUnion) => node is DataSetGraphNode;
export declare const isWorkflowOutput: (node: GraphNodeUnion) => node is WorkflowOutputGraphNode;
export declare const isEnterIf: (node: GraphNodeUnion) => node is EnterIfNode;
export declare const isExitIf: (node: GraphNodeUnion) => node is ExitIfNode;
export declare const isEnterConditionBranch: (node: GraphNodeUnion) => node is EnterConditionBranchNode;
export declare const isExitConditionBranch: (node: GraphNodeUnion) => node is ExitConditionBranchNode;
export declare const isEnterForeach: (node: GraphNodeUnion) => node is EnterForeachNode;
export declare const isExitForeach: (node: GraphNodeUnion) => node is ExitForeachNode;
export declare const isEnterWhile: (node: GraphNodeUnion) => node is EnterWhileNode;
export type LoopEnterNode = Extract<GraphNodeUnion, {
    type: `enter-${LoopStepType}`;
}>;
export declare const isLoopEnterNode: (node: GraphNodeUnion) => node is LoopEnterNode;
export declare const isExitWhile: (node: GraphNodeUnion) => node is ExitWhileNode;
export declare const isEnterRetry: (node: GraphNodeUnion) => node is EnterRetryNode;
export declare const isExitRetry: (node: GraphNodeUnion) => node is ExitRetryNode;
export declare const isEnterContinue: (node: GraphNodeUnion) => node is EnterContinueNode;
export declare const isExitContinue: (node: GraphNodeUnion) => node is ExitContinueNode;
export declare const isEnterTryBlock: (node: GraphNodeUnion) => node is EnterTryBlockNode;
export declare const isExitTryBlock: (node: GraphNodeUnion) => node is ExitTryBlockNode;
export declare const isEnterNormalPath: (node: GraphNodeUnion) => node is EnterNormalPathNode;
export declare const isExitNormalPath: (node: GraphNodeUnion) => node is ExitNormalPathNode;
export declare const isEnterWorkflowTimeoutZone: (node: GraphNodeUnion) => node is EnterTimeoutZoneNode;
export declare const isExitWorkflowTimeoutZone: (node: GraphNodeUnion) => node is ExitTimeoutZoneNode;
export declare const isEnterStepTimeoutZone: (node: GraphNodeUnion) => node is EnterTimeoutZoneNode;
export declare const isExitStepTimeoutZone: (node: GraphNodeUnion) => node is ExitTimeoutZoneNode;
export declare const isEnterSwitch: (node: GraphNodeUnion) => node is EnterSwitchNode;
export declare const isExitSwitch: (node: GraphNodeUnion) => node is ExitSwitchNode;
export declare const isEnterCaseBranch: (node: GraphNodeUnion) => node is EnterCaseBranchNode;
export declare const isExitCaseBranch: (node: GraphNodeUnion) => node is ExitCaseBranchNode;
export declare const isEnterDefaultBranch: (node: GraphNodeUnion) => node is EnterDefaultBranchNode;
export declare const isExitDefaultBranch: (node: GraphNodeUnion) => node is ExitDefaultBranchNode;
export declare const isLoopBreak: (node: GraphNodeUnion) => node is LoopBreakNode;
export declare const isLoopContinue: (node: GraphNodeUnion) => node is LoopContinueNode;
/**
 * Returns true for step types whose inner steps have guaranteed execution
 * before certain fields (e.g. `condition`) are evaluated, making inner step
 * outputs available for autocomplete suggestions.
 *
 * Currently applies to `while` (do-while semantics: body runs before condition).
 */
export declare const shouldSuggestInnerSteps: (node: GraphNodeUnion) => boolean;
