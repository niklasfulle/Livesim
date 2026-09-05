export type ResidentLifeState = { id: string; name: string; state: string };

export const newlyDeadResidents = (
  previous: ResidentLifeState[],
  current: ResidentLifeState[]
): Array<Pick<ResidentLifeState, "id" | "name">> => {
  const previousStates = new Map(previous.map((resident) => [resident.id, resident.state]));
  return current
    .filter((resident) => resident.state === "dead" && previousStates.get(resident.id) !== "dead")
    .map(({ id, name }) => ({ id, name }));
};
