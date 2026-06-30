import { z } from '@kbn/zod/v4';
/**
 * Base fields present on every trigger event (injected by the platform).
 * Custom trigger event schemas are merged on top of this for workflow context and autocomplete.
 * Timestamp is only present for event-driven (custom) triggers; see EventTimestampSchema.
 */
export declare const BaseEventSchema: z.ZodObject<{
    spaceId: z.ZodString;
}, z.core.$strip>;
