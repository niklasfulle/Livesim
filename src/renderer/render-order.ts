export interface ResourceRenderPatch {
  ground: "berryBush" | "forest";
  x: number;
  y: number;
}

export const orderResourcePatches = (resources: ResourceRenderPatch[]): ResourceRenderPatch[] => {
  const layer = { berryBush: 0, forest: 1 };
  return [...resources].sort((left, right) => layer[left.ground] - layer[right.ground]);
};
