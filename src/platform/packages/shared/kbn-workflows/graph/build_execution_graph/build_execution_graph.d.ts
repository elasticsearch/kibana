import { graphlib } from '@dagrejs/dagre';
import type { BaseStep, DataSetStep, ElasticsearchStep, KibanaStep, WaitForInputStep, WaitStep, WorkflowExecuteAsyncStep, WorkflowExecuteStep, WorkflowSettings, WorkflowYaml } from '../../spec/schema';
import type { GraphNodeUnion, WorkflowGraphType } from '../types';
/** Context used during the graph construction to keep track of settings and avoid cycles */
interface GraphBuildContext {
    /** Workflow settings to be used during nodes construction */
    settings: WorkflowSettings | undefined;
    /**
     * Stack of nodes to keep track of the current position in the graph and avoid cycles
     */
    stack: GraphNodeUnion[];
    /** Used to construct predictable unique node IDs */
    parentKey: string;
}
export declare function visitWaitStep(currentStep: WaitStep, context: GraphBuildContext): WorkflowGraphType;
export declare function visitWaitForInputStep(currentStep: WaitForInputStep, context: GraphBuildContext): WorkflowGraphType;
export declare function visitDataSetStep(currentStep: DataSetStep, context: GraphBuildContext): WorkflowGraphType;
export declare function visitElasticsearchStep(currentStep: ElasticsearchStep, context: GraphBuildContext): WorkflowGraphType;
export declare function visitKibanaStep(currentStep: KibanaStep, context: GraphBuildContext): WorkflowGraphType;
export declare function visitWorkflowExecuteStep(currentStep: WorkflowExecuteStep, context: GraphBuildContext): WorkflowGraphType;
export declare function visitWorkflowExecuteAsyncStep(currentStep: WorkflowExecuteAsyncStep, context: GraphBuildContext): WorkflowGraphType;
export declare function visitWorkflowOutputStep(currentStep: BaseStep, context: GraphBuildContext): WorkflowGraphType;
export declare function visitAtomicStep(currentStep: BaseStep, context: GraphBuildContext): WorkflowGraphType;
export declare function convertToWorkflowGraph(workflowSchema: WorkflowYaml, defaultSettings?: WorkflowSettings): graphlib.Graph<GraphNodeUnion>;
export declare function convertToSerializableGraph(graph: graphlib.Graph): any;
export {};
