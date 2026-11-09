/**
 * Constants shared by the Worker and its tests. They live outside worker.ts
 * because the Workers runtime treats every export of the entry module as an
 * entrypoint and refuses to start when one is not a function or handler.
 */

/** KV key for the single-user MVP snapshot. */
export const SNAPSHOT_KEY = "snapshot:nate";
