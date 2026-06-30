import type { BaseMessage } from '@langchain/core/messages';
import type { ContentReference, DocumentEntry } from '../../schemas';
import type { ContentReferenceBlock, ContentReferenceId, ContentReferencesStore } from '../types';
/**
 * Returns "Arid2" from "{reference(Arid2)}"
 * @param contentReference A ContentReferenceBlock
 * @returns ContentReferenceId
 */
export declare const getContentReferenceId: (contentReferenceBlock: ContentReferenceBlock) => ContentReferenceId;
/**
 * Returns a contentReferenceBlock for a given ContentReference. A ContentReferenceBlock may be provided
 * to an LLM alongside grounding documents allowing the LLM to reference the documents in its output.
 * @param contentReference A ContentReference
 * @returns ContentReferenceBlock
 */
export declare const contentReferenceBlock: (contentReference: ContentReference | undefined) => ContentReferenceBlock | "";
/**
 * Simplifies passing a contentReferenceBlock alongside grounding documents.
 * @param contentReference A ContentReference
 * @returns the string: `Reference: <contentReferenceBlock>`
 */
export declare const contentReferenceString: (contentReference: ContentReference | undefined) => "" | "Citation: " | `Citation: {reference(${string})}`;
/**
 * Removed content references from conent.
 * @param content content to remove content references from
 * @returns content with content references replaced with ''
 */
export declare const removeContentReferences: (content: string) => string;
/**
 * Removes content references from chat history
 */
export declare const sanitizeMessages: (messages: BaseMessage[]) => BaseMessage[];
/**
 * Enriches a DocumentEntry with a content reference.
 */
export declare const enrichDocument: (contentReferencesStore: ContentReferencesStore) => (document: DocumentEntry) => DocumentEntry;
