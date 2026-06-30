import type { HttpStart, IHttpFetchError } from '@kbn/core-http-browser';
import type { CreateRuleBody } from '../apis/create_rule';
import type { Rule } from '../types';
export interface UseCreateRuleProps {
    http: HttpStart;
    onSuccess?: (rule: Rule) => void;
    onError?: (error: IHttpFetchError<{
        message: string;
    }>) => void;
}
export declare const useCreateRule: (props: UseCreateRuleProps) => import("@kbn/react-query").UseMutationResult<Rule, IHttpFetchError<{
    message: string;
}>, {
    formData: CreateRuleBody;
}, unknown>;
