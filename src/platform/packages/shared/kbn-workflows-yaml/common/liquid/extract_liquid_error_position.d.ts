/**
 * Extracts position information from liquidjs error messages
 * By default, liquidjs returns the start of the line of the error message
 * This function tries to pinpoint the specific problematic token rather than just the start of the expression
 */
export declare const extractLiquidErrorPosition: (text: string, errorMessage: string) => {
    start: number;
    end: number;
};
