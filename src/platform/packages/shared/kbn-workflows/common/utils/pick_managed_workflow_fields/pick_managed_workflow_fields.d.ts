import type { EsWorkflowExecution } from '../../../types/v1';
export type ManagedWorkflowFieldsSource = Pick<EsWorkflowExecution, 'managed' | 'managedBy' | 'originManagedWorkflowId' | 'managedVersion'>;
export interface ManagedWorkflowFields {
    managed?: true;
    managedBy?: string;
    originManagedWorkflowId?: string;
    managedVersion?: number;
}
/**
 * Strips null managed-workflow fields for execution, API, and persistence payloads.
 */
export declare const pickManagedWorkflowFields: (source: ManagedWorkflowFieldsSource | null | undefined) => Partial<ManagedWorkflowFields>;
export interface ManagedWorkflowTelemetryFields {
    isManaged: boolean;
    managedBy?: string;
    originManagedWorkflowId?: string;
    managedVersion?: number;
}
/**
 * Maps managed-workflow source fields to telemetry event shape.
 */
export declare const toManagedWorkflowTelemetryFields: (source: ManagedWorkflowFieldsSource | null | undefined) => ManagedWorkflowTelemetryFields;
