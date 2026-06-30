/**
 * Interface for features available to the elastic assistant
 */
export type AssistantFeatures = {
    [K in keyof typeof defaultAssistantFeatures]: boolean;
};
/**
 * Type for keys of the assistant features
 */
export type AssistantFeatureKey = keyof AssistantFeatures;
/**
 * Default features available to the elastic assistant
 */
export declare const defaultAssistantFeatures: Readonly<{
    assistantModelEvaluation: false;
    defendInsightsPolicyResponseFailure: true;
}>;
