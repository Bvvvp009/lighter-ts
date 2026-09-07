import { ApiClient } from './api-client';

// ============================================================================
// RHC (Robinhood Chain instance) API
// ============================================================================

/**
 * Leaderboard entry for the RHC incentives campaign.
 */
export interface LeaderboardEntry {
  l1_address: string;
  total_points: number;
  weekly_points?: number;
  rank?: number;
  [key: string]: any;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total?: number;
  [key: string]: any;
}

/**
 * Live points total for a single account.
 */
export interface LivePointsTotalResponse {
  l1_address: string;
  total_live_points: number;
  [key: string]: any;
}

/**
 * RhcApi provides endpoints specific to the Robinhood Chain (RHC) instance
 * of Lighter. These endpoints are only available on the RHC instance
 * (api.rh.lighter.xyz / api.rh-testnet.lighter.xyz).
 *
 * Added 2026-08-14: RHC incentives campaign — leaderboard, live points,
 * and live_points WS channel.
 */
export class RhcApi {
  private client: ApiClient;

  constructor(apiClient: ApiClient) {
    this.client = apiClient;
  }

  /**
   * Get the RHC leaderboard. Use `type=all` for totals (both live and
   * weekly distributions — weekly granularity is not supported).
   * If not authenticated, only top addresses are returned.
   * @param type - 'all' for totals (recommended)
   * @param limit - Number of entries to return
   * @param auth - Optional auth token (authenticated requests see all entries)
   */
  public async getLeaderboard(
    type: 'all' = 'all',
    limit?: number,
    auth?: string,
  ): Promise<LeaderboardResponse> {
    const response = await this.client.get<LeaderboardResponse>('/api/v1/leaderboard', {
      type,
      ...(limit !== undefined ? { limit } : {}),
      ...(auth ? { authorization: auth, auth } : {}),
    });
    return response.data;
  }

  /**
   * Get the live portion of points for an account.
   * @param l1Address - L1 address
   * @param auth - Optional auth token
   */
  public async getLivePointsTotal(
    l1Address: string,
    auth?: string,
  ): Promise<LivePointsTotalResponse> {
    const response = await this.client.get<LivePointsTotalResponse>('/api/v1/livePoints/total', {
      l1_address: l1Address,
      ...(auth ? { authorization: auth, auth } : {}),
    });
    return response.data;
  }
}

// ============================================================================
// WS channel helper for live_points
// ============================================================================

/**
 * Build the `live_points/{account_id}` channel name for the RHC
 * live points WebSocket channel.
 */
export function livePointsChannel(accountId: number): string {
  return `live_points/${accountId}`;
}

export interface WsLivePointsMessage {
  channel: string; // "live_points:{accountId}"
  l1_address: string;
  live_points: number;
  total_points: number;
  timestamp: number;
  type: 'update/live_points' | string;
  [key: string]: any;
}