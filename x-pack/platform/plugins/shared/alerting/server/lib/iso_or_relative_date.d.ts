/**
 * Parse an ISO date or NNx duration string as a Date
 *
 * @param dateString an ISO date or NNx "duration" string representing now-duration
 * @returns a Date or undefined if the dateString was not valid
 */
export declare function parseIsoOrRelativeDate(dateString: string): Date | undefined;
