/**
 * Route params for the professional-accounts screens (documentation/design/pro-accounts.md 7.2).
 * Params are ids only, never whole objects: a screen reads what it shows from the server when it opens.
 * The route names are the keys below; screens navigate with the literal name, never a variable.
 */

/** Opens a sheet when ProHome appears (the first-run choice); ProHome clears it after opening. */
export type ProHomeOpen = 'stylist_setup' | 'redeem';

export interface ProHomeParams { open?: ProHomeOpen }
export interface ProConnectionParams { connectionId: string }
export interface ProShareParams { connectionId: string }
export interface ProRecommendationParams { recId: string; connectionId: string }
export interface ProThreadParams { connectionId: string }
export interface ProClientDetailParams { connectionId: string }
export interface ProClientClosetParams { connectionId: string }
/** recId is present when a draft is reopened. */
export interface ProLookEditorParams { connectionId: string; recId?: string }

/** HomeStack (after the four swap routes). */
export type ProHomeStackParamList = {
  ProHome: ProHomeParams | undefined;
  ProConnection: ProConnectionParams;
  ProShare: ProShareParams;
  ProRecommendation: ProRecommendationParams;
  ProThread: ProThreadParams;
};

/** ProClientsStack, the stylist tab Clients. */
export type ProClientsStackParamList = {
  ProClients: undefined;
  ProClientDetail: ProClientDetailParams;
  ProClientCloset: ProClientClosetParams;
  ProLookEditor: ProLookEditorParams;
  ProRecommendation: ProRecommendationParams;
  ProThread: ProThreadParams;
};

/** ProScheduleStack, the stylist tab Schedule. */
export type ProScheduleStackParamList = {
  ProSchedule: undefined;
  ProThread: ProThreadParams;
};

/** ProInboxStack, the stylist tab Messages. */
export type ProInboxStackParamList = {
  ProInbox: undefined;
  ProThread: ProThreadParams;
};

export type ProRouteName =
  | keyof ProHomeStackParamList
  | keyof ProClientsStackParamList
  | keyof ProScheduleStackParamList
  | keyof ProInboxStackParamList;
