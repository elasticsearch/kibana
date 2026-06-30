import type { ContentReferences } from '../../schemas';
import type { ContentReferencesStore } from '../types';
/**
 * Returnes a pruned copy of the ContentReferencesStore and content.
 * @param content The content that may contain references to data within the ContentReferencesStore.
 * @param contentReferencesStore The ContentReferencesStore contain the contentReferences.
 * @returns prunedContentReferencesStore - a new record only containing the ContentReferences that are referenced to by the content. prunedContent - the content with the references that do not exist removed.
 */
export declare const pruneContentReferences: (content: string, contentReferencesStore: ContentReferencesStore) => {
    prunedContentReferencesStore: ContentReferences;
    prunedContent: string;
};
