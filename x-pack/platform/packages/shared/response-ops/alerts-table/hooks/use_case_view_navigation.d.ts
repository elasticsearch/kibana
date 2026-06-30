import type { ApplicationStart } from '@kbn/core-application-browser';
type NavigateToCaseView = (pathParams: {
    caseId: string;
}) => void;
export declare const useCaseViewNavigation: (application: ApplicationStart, appId?: string) => {
    navigateToCaseView: NavigateToCaseView;
};
export {};
