import type { Rule } from '../../../../../..';
declare const getSLOLinkData: (rule: Rule) => {
    urlParams: {
        sloId: string;
    };
    buttonText: string;
    locatorId: string;
} | {
    urlParams: undefined;
    buttonText: string;
    locatorId: string;
};
export { getSLOLinkData };
