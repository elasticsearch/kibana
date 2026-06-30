import type { CaseStatuses } from '../status/types';
export interface CaseTooltipContentProps {
    title: string;
    description: string;
    status: CaseStatuses;
    totalComments: number;
    createdAt: string;
    createdBy: {
        username?: string;
        fullName?: string;
    };
}
export interface CaseTooltipProps {
    children: React.ReactNode;
    content: CaseTooltipContentProps;
    dataTestSubj?: string;
    className?: string;
    loading?: boolean;
}
