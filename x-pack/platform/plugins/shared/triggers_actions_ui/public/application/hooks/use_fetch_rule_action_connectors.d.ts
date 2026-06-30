import type { ActionConnector } from '../..';
interface FetchRuleActionConnectorsProps {
    ruleActions: any[];
}
export declare function useFetchRuleActionConnectors({ ruleActions }: FetchRuleActionConnectorsProps): {
    reloadRuleActionConnectors: () => Promise<void>;
    isLoadingActionConnectors: boolean;
    actionConnectors: Array<ActionConnector<Record<string, unknown>>>;
    errorActionConnectors?: string;
};
export {};
