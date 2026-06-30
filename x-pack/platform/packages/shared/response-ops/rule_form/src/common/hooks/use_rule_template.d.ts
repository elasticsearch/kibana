import type { HttpStart } from '@kbn/core-http-browser';
export interface UseRuleTemplateProps {
    http: HttpStart;
    templateId?: string;
}
export declare function useRuleTemplate(props: UseRuleTemplateProps): {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    data: import("@kbn/alerts-ui-shared").RuleTemplate | undefined;
};
