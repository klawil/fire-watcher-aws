export type OnlySpecificKeys<T extends string, K extends string> = T extends K ? T : never;
export type ExceptSpecificKeys<T extends string, K extends string> = T extends K ? never : T;
