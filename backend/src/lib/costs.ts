import { getConfig } from "../config";

// Unified round-trip transaction-cost model (Phase 3). Single source of truth for
// accuracy_tracker, outcome_verifier and the signal_generator EV gate — previously
// each carried its own `COST_RATE_PER_SIDE = 0.0005` copy. Import-light on purpose:
// depends only on config (no db polling / tick_distribution), so outcome_verifier can
// adopt it without pulling in the hot-path market_data modules.

/**
 * Per-side transaction cost as a fraction of traded value, sourced from
 * config.slippageBps. The old flat 5bps is now this configurable all-in
 * approximation of brokerage + STT + exchange charges + slippage for NSE intraday
 * (default slippageBps=5 → 0.0005, identical to the previous constant).
 *
 * ponytail: still one flat bps figure. Deferred — f(ADV, spread, notional), and
 * splitting out config.brokeragePerOrderInr separately (folding the flat per-order
 * INR fee in here would double-count the brokerage the bps figure already bundles).
 */
export function costPerSideFraction(): number {
  return getConfig().slippageBps / 10_000;
}

/** Net PnL after transaction costs on both legs. */
export function netPnl(entry: number, exit: number, qty: number, gross: number): number {
  const costs = (entry + exit) * qty * costPerSideFraction();
  return gross - costs;
}

/**
 * Round-trip cost expressed in R (stop-distance fractions) for EV gating: how many
 * R the ~2× per-side round trip eats given this stop width. Infinity when stopFrac
 * is non-positive so the EV gate rejects (a zero-width stop can never clear costs).
 */
export function costR(stopFrac: number): number {
  return stopFrac > 0 ? (2 * costPerSideFraction()) / stopFrac : Infinity;
}
