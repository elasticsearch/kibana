export interface UiConfig {
    isUsingSecurity: boolean;
    minimumScheduleInterval?: {
        value: string;
        enforce: boolean;
    };
    apiKeyType?: 'es' | 'uiam';
}
