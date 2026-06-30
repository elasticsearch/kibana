import { z } from '@kbn/zod/v4';
/**
 * An attack discovery that's also an alert
 */
export declare const AttackDiscoveryAlert: z.ZodObject<{
    alertIds: z.ZodArray<z.ZodString>;
    alertRuleUuid: z.ZodOptional<z.ZodString>;
    alertWorkflowStatus: z.ZodOptional<z.ZodString>;
    connectorId: z.ZodString;
    connectorName: z.ZodString;
    alertStart: z.ZodOptional<z.ZodString>;
    alertUpdatedAt: z.ZodOptional<z.ZodString>;
    alertUpdatedByUserId: z.ZodOptional<z.ZodString>;
    alertUpdatedByUserName: z.ZodOptional<z.ZodString>;
    alertWorkflowStatusUpdatedAt: z.ZodOptional<z.ZodString>;
    detailsMarkdown: z.ZodString;
    entitySummaryMarkdown: z.ZodOptional<z.ZodString>;
    generationUuid: z.ZodString;
    id: z.ZodString;
    mitreAttackTactics: z.ZodOptional<z.ZodArray<z.ZodString>>;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    riskScore: z.ZodOptional<z.ZodNumber>;
    summaryMarkdown: z.ZodString;
    timestamp: z.ZodString;
    title: z.ZodString;
    userId: z.ZodOptional<z.ZodString>;
    userName: z.ZodOptional<z.ZodString>;
    users: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    assignees: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    index: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AttackDiscoveryAlert = z.infer<typeof AttackDiscoveryAlert>;
