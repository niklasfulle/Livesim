# Survival rules

Every internal step is 15 simulated minutes. Night acceleration executes four internal steps, and is enabled only when all living residents sleep. Needs and spoilage use the same simulated time.

- Hunger: 0 means full, 100 means starving. Residents gain 0.8 per step during dawn, day and dusk, but only 0.2 per step at night. At 100 they lose 1.5 health per step.
- Energy (currently labelled Fitness): movement costs 0.4 per field, including the return trip. A work step costs another 0.75. Sleeping restores 2 per step. Waking gives no free recovery.
- Health: starts at 100. Starvation and moving/working at zero energy damage health. Sleeping with hunger below 50 restores 0.5 per step. Zero health is permanent death; dead residents stop acting.
- Meals remove all hunger and therefore restore the displayed satiety to 100%; berries reduce hunger by 15. Meals remain preferred. Existing energy bonuses remain 25 and 5 respectively.

Residents eat carried food when hungry, even away from home. House storage is only accessible at home. Cooking combines one fish, wood and plant at home into a meal; carried ingredients are deposited first. Before departure residents take up to two meals and two berries, within carrying capacity.

Harvesting berries, wood, and plants always succeeds after the required work time. Only fishing uses a success chance and can end without a catch.

At hunger 50, known berry bushes take priority as immediately edible food. Otherwise residents seek ingredients and discover new terrain. Ordinary grass is harvested only when fish and wood are available. Empty resources are skipped. Exploration returns to reachable unexplored frontier fields instead of repeatedly bouncing between visited fields.

Residents return at dusk, with a full pack, with cooking ingredients, or when energy drops below 20 plus a return-distance reserve. Arrival deposits resources and cooks; residents rest until energy reaches 60, and remain asleep during dusk/night. Return reserve uses grid distance, not actual obstacle-aware route length; very long detours can still cause exhaustion.

Resource stocks remain finite. There is no thirst, disease, reproduction, renewable food or automatic rescue in this version. These are balancing extensions, not silently simulated mechanisms.
