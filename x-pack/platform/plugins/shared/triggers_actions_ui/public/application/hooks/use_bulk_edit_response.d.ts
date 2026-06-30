import type { BulkEditResponse } from '../../types';
export type BulkEditProperty = 'snooze' | 'snoozeSchedule' | 'apiKey';
export interface UseBulkEditResponseProps {
    onSearchPopulate?: (filter: string) => void;
}
export declare function useBulkEditResponse(props: UseBulkEditResponseProps): {
    showToast: (response: BulkEditResponse, property: BulkEditProperty) => void;
};
