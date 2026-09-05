import type { Ground } from "./world.js";

export type ResourceKind = "fish" | "wood" | "plant" | "berry" | "meal";

export const carryingCapacity = 8;

export const resourceForGround = (ground: Ground): ResourceKind | undefined => {
  if (ground === "water") return "fish";
  if (ground === "forest") return "wood";
  if (ground === "berryBush") return "berry";
  if (ground === "grass") return "plant";
  return undefined;
};

export const shelfLifeHours: Record<ResourceKind, number> = {
  fish: 48,
  plant: 48,
  berry: 24,
  wood: Number.POSITIVE_INFINITY,
  meal: 72
};
