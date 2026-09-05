# LifeSim glossary

- **Resident:** A single, normal simulated inhabitant. Residents do not have behavioural variants.
- **Exploration:** A resident's drive to visit unknown parts of the world and discover useful resource sites.
- **Resource memory:** A resident's limited remembered set of discovered resource sites: up to two waters, three trees, and three berry bushes. When full, a newly discovered site closer to home replaces the farthest remembered site of the same kind.
- **Resource vision:** A resident sees resource patches in a forward-facing semicircle with a radius of three patches.
- **Resident history:** A resident's complete chronological history of movement, discoveries, work, gathering, eating, and storage events, with in-world timestamps and structured resource changes for collected and consumed goods.
- **Fishing spot:** A walkable field adjacent to water, from which a resident can fish.
- **Tree:** A non-walkable resource patch that yields wood when harvested from an adjacent field.
- **Berry bush:** A non-walkable resource patch that yields berries when harvested from an adjacent field.
- **Berry:** A small food resource that restores 5 fitness when eaten.
- **Meal:** A preferred food resource that restores 25 fitness when eaten.
- **Hunger:** 0 means full, 100 means starving; increases with simulated time. Meals reduce hunger by 60, berries by 15.
- **Health:** Separate from energy; starvation and exhaustion cause damage, nourished rest heals. Zero health means permanent death.
- **Fitness:** Energy available for activity. Walking also consumes energy on the return trip; sleeping restores it.
- **Survival loop:** Eat, provision, explore/gather, return, deposit/cook, rest. See `SURVIVAL.md` for balancing and limitations.
