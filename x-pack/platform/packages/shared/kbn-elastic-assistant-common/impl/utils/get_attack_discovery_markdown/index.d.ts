import type { AttackDiscovery, Replacements } from '../../schemas';
export declare const getMarkdownFields: (markdown: string) => string;
export declare const getAttackChainMarkdown: (attackDiscovery: AttackDiscovery) => string;
export declare const getMarkdownWithOriginalValues: ({ markdown, replacements, }: {
    markdown: string;
    replacements?: Replacements;
}) => string;
export declare const getAttackDiscoveryMarkdown: ({ attackDiscovery, replacements, }: {
    attackDiscovery: AttackDiscovery;
    replacements?: Replacements;
}) => string;
export declare const getAttackDiscoveryMarkdownFields: ({ attackDiscovery, replacements, }: {
    attackDiscovery: AttackDiscovery;
    replacements?: Replacements;
}) => {
    detailsMarkdown: string;
    entitySummaryMarkdown: string;
    title: string;
    summaryMarkdown: string;
};
