import type React from 'react';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { BulkActionsConfig, BulkActionsPanelConfig, BulkActionsState, BulkActionsReducerAction, TimelineItem, BulkEditTagsFlyoutState, BulkAddToChatConfig, OpenChatService } from '../types';
import type { CasesService, PublicAlertsDataGridProps } from '../types';
interface BulkActionsProps {
    ruleTypeIds?: string[];
    query: Partial<Pick<NonNullable<QueryDslQueryContainer>, 'bool' | 'ids'>>;
    alertsCount: number;
    casesConfig?: PublicAlertsDataGridProps['casesConfiguration'];
    additionalBulkActions?: PublicAlertsDataGridProps['additionalBulkActions'];
    refresh: () => void;
    hideBulkActions?: boolean;
    application: ApplicationStart;
    casesService?: CasesService;
    agentBuilderService?: OpenChatService;
    bulkAddToChatConfig?: BulkAddToChatConfig;
    http: HttpStart;
    notifications: NotificationsStart;
}
export interface UseBulkActions {
    isBulkActionsColumnActive: boolean;
    bulkActionsState: BulkActionsState;
    bulkActions: BulkActionsPanelConfig[];
    setIsBulkActionsLoading: (isLoading: boolean) => void;
    clearSelection: () => void;
    updateBulkActionsState: React.Dispatch<BulkActionsReducerAction>;
    bulkEditTagsFlyoutState: BulkEditTagsFlyoutState;
}
type UseBulkAddToCaseActionsProps = Pick<BulkActionsProps, 'casesConfig' | 'refresh' | 'casesService' | 'http' | 'notifications'> & Pick<UseBulkActions, 'clearSelection'>;
type UseBulkUntrackActionsProps = Pick<BulkActionsProps, 'refresh' | 'query' | 'ruleTypeIds' | 'application' | 'http' | 'notifications'> & Pick<UseBulkActions, 'clearSelection' | 'setIsBulkActionsLoading'> & {
    isAllSelected: boolean;
};
type UseBulkTagsActionsProps = Pick<BulkActionsProps, 'refresh'> & Pick<UseBulkActions, 'clearSelection'>;
type UseBulkMuteActionsProps = Pick<BulkActionsProps, 'refresh' | 'http' | 'notifications'> & Pick<UseBulkActions, 'clearSelection' | 'setIsBulkActionsLoading'>;
export declare const useBulkAddToCaseActions: ({ casesService, casesConfig, refresh, clearSelection, }: UseBulkAddToCaseActionsProps) => BulkActionsConfig[];
export declare const useBulkUntrackActions: ({ setIsBulkActionsLoading, refresh, clearSelection, query, ruleTypeIds, isAllSelected, http, notifications, application, }: UseBulkUntrackActionsProps) => {
    label: string;
    key: string;
    disableOnQuery: boolean;
    disabledLabel: string;
    'data-test-subj': string;
    onClick: (alerts?: TimelineItem[]) => Promise<void>;
}[];
export declare const useBulkTagsActions: ({ refresh, clearSelection }: UseBulkTagsActionsProps) => {
    tagsAction: import("../components/tags/use_tags_action").TagsActionState;
};
export declare const useBulkMuteActions: ({ setIsBulkActionsLoading, refresh, clearSelection, http, notifications, }: UseBulkMuteActionsProps) => {
    label: string;
    key: string;
    disableOnQuery: boolean;
    disabledLabel: string;
    'data-test-subj': string;
    onClick: (selectedAlerts?: TimelineItem[]) => Promise<void>;
}[];
export declare const useBulkAddToChatActions: ({ agentBuilderService, bulkAddToChatConfig, }: {
    agentBuilderService?: OpenChatService;
    bulkAddToChatConfig?: BulkAddToChatConfig;
}) => {
    label: string;
    key: string;
    disableOnQuery: boolean;
    disabledLabel: string;
    'data-test-subj': string;
    onClick: (alerts?: TimelineItem[]) => void;
}[];
export declare function useBulkActions({ alertsCount, casesConfig, query, refresh, additionalBulkActions, ruleTypeIds, hideBulkActions, http, notifications, application, casesService, agentBuilderService, bulkAddToChatConfig, }: BulkActionsProps): UseBulkActions;
export {};
