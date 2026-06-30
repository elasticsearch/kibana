export declare const getAlertingSectionBreadcrumb: (type: string, returnHref?: boolean) => {
    text: string;
    href?: string;
};
export declare const getRulesBreadcrumbWithHref: (getUrlForApp: (appId: string, options?: {
    path?: string;
}) => string) => {
    href: string;
    text: string;
};
