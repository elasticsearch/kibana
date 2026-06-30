import type { Rule } from '../../../../../types';
interface Props {
    rule?: Rule;
}
export declare function useLinkedObject({ rule }: Props): {
    linkUrl: string;
    buttonText: string;
} | {
    linkUrl: null;
    buttonText: string;
};
export {};
