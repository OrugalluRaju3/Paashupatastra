/** Shared water type labels for supplier fleet + customer search. */
export const TANKER_WATER_TYPE_OPTIONS = [
  "Drinking Water",
  "Borewell Water",
  "Mineral Water",
  "Soft Water",
  "Raw Water",
] as const;

export type TankerWaterType = (typeof TANKER_WATER_TYPE_OPTIONS)[number];

export const DEFAULT_TANKER_WATER_TYPE: TankerWaterType = "Drinking Water";
