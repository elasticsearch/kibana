import type { SecurityAlertContentReference, SecurityAlertsPageContentReference, KnowledgeBaseEntryContentReference, ProductDocumentationContentReference, EsqlContentReference, HrefContentReference } from '../../schemas';
import type { ContentReferenceId } from '../types';
/**
 * Generates a contentReference for the alerts count tool.
 * @param id id of the contentReference
 * @returns AlertsCountReference
 */
export declare const securityAlertsPageReference: (id: string) => SecurityAlertsPageContentReference;
/**
 * Generates a contentReference for when a specific alert is referenced.
 * @param id id of the contentReference
 * @param alertId id of the alert that is referenced
 * @returns AlertReference
 */
export declare const securityAlertReference: (id: ContentReferenceId, alertId: string) => SecurityAlertContentReference;
/**
 * Generates a contentReference for when a knowledge base entry is referenced.
 * @param id id of the contentReference
 * @param knowledgeBaseEntryName name of the knowledge base entry
 * @param knowledgeBaseEntryId id of the knowledge base entry
 * @returns KnowledgeBaseReference
 */
export declare const knowledgeBaseReference: (id: ContentReferenceId, knowledgeBaseEntryName: string, knowledgeBaseEntryId: string) => KnowledgeBaseEntryContentReference;
/**
 * Generates a contentReference for when a external page is referenced.
 * @param id id of the contentReference
 * @param href the external page url
 * @param label content reference label
 * @returns HrefContentReference
 */
export declare const hrefReference: (id: ContentReferenceId, href: string, label?: string) => HrefContentReference;
/**
 * Generates a contentReference for when a ESQL query is referenced.
 * @param id id of the contentReference
 * @param query the ESQL query
 * @param label content reference label
 * @returns KnowledgeBaseReference
 */
export declare const esqlQueryReference: (params: Omit<EsqlContentReference, "type">) => EsqlContentReference;
/**
 * Generates a contentReference for the alerts count tool.
 * @param id id of the contentReference
 * @returns AlertsCountReference
 */
export declare const productDocumentationReference: (id: ContentReferenceId, title: string, url: string) => ProductDocumentationContentReference;
