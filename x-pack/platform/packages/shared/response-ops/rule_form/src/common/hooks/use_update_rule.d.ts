import type { HttpStart, IHttpFetchError } from '@kbn/core-http-browser';
import type { UpdateRuleBody } from '../apis/update_rule';
import type { Rule } from '../types';
export interface UseUpdateRuleProps {
    http: HttpStart;
    onSuccess?: (rule: Rule) => void;
    onError?: (error: IHttpFetchError<{
        message: string;
    }>) => void;
}
export declare const useUpdateRule: (props: UseUpdateRuleProps) => import("@kbn/react-query").UseMutationResult<Rule, IHttpFetchError<{
    message: string;
}>, {
    id: string;
    formData: UpdateRuleBody;
}, unknown>;
