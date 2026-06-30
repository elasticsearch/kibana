export interface Comparator {
    text: string;
    value: string;
    requiredValues: number;
}
export declare enum COMPARATORS {
    GREATER_THAN = ">",
    GREATER_THAN_OR_EQUALS = ">=",
    BETWEEN = "between",
    LESS_THAN = "<",
    LESS_THAN_OR_EQUALS = "<=",
    NOT_BETWEEN = "notBetween",
    BETWEEN_INCLUSIVE = "betweenInclusive",
    NOT_BETWEEN_INCLUSIVE = "notBetweenInclusive"
}
