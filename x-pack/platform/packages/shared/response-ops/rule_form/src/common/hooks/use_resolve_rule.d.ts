import type { HttpStart } from '@kbn/core-http-browser';
import type { RuleFormData } from '../../types';
export interface UseResolveProps {
    http: HttpStart;
    id?: string;
    cacheTime?: number;
}
export declare const useResolveRule: (props: UseResolveProps) => {
    data: RuleFormData<import("@kbn/alerts-ui-shared/src/common/types/rule_types").RuleTypeParams> | null | undefined;
    isLoading: boolean;
    isInitialLoading: boolean;
    isSuccess: boolean;
    isError: boolean;
    error: unknown;
};
