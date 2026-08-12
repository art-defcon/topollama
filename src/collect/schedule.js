// Gates a sampling tier so expensive sources run on their own cadence. Cheap
// kernel reads stay per-tick; HTTP polls and static info run slower.
export function createTierGate(intervalMs) {
  let lastRunAt = null;

  return {
    due(now) {
      if (lastRunAt !== null && now - lastRunAt < intervalMs) return false;
      lastRunAt = now;
      return true;
    }
  };
}
