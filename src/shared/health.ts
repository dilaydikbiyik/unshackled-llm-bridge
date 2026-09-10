import type { PlatformId } from '@domain/platforms';

/**
 * Adapter health is a cross-boundary contract, not an adapter implementation
 * detail: adapters produce it, the background worker stores it, and the side
 * panel renders it. It lives in `shared` so none of those layers has to import
 * another's internals to speak about it.
 */
export interface AdapterHealth {
  platform: PlatformId;
  ok: boolean;
  /** Selector targets that resolved to nothing — surfaced as "support degraded". */
  brokenSelectors: string[];
  checkedAt: string;
}
