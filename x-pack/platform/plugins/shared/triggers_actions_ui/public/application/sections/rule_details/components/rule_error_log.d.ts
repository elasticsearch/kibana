import React from 'react';
import type { ComponentOpts as RuleApis } from '../../common/components/with_bulk_rule_api_operations';
import type { RefreshToken } from './types';
export type RuleErrorLogProps = {
    ruleId: string;
    runId?: string;
    refreshToken?: RefreshToken;
    spaceId?: string;
    logFromDifferentSpace?: boolean;
    requestRefresh?: () => Promise<void>;
} & Pick<RuleApis, 'loadActionErrorLog'>;
export declare const RuleErrorLog: (props: RuleErrorLogProps) => React.JSX.Element;
export declare const RuleErrorLogWithApi: React.FunctionComponent<import("../../common/components/with_bulk_rule_api_operations").PropsWithOptionalApiHandlers<{
    ruleId: string;
    runId?: string;
    refreshToken?: RefreshToken;
    spaceId?: string;
    logFromDifferentSpace?: boolean;
    requestRefresh?: () => Promise<void>;
} & Pick<RuleApis, "loadActionErrorLog">>>;
export { RuleErrorLogWithApi as default };
