import { describe, it, expect } from "vitest";
import { costPerSideFraction, netPnl, costR } from "../../../src/lib/costs";

// Default config: slippageBps=5 → 0.0005/side, identical to the pre-Phase-3 flat
// constant these three call sites used to each carry.
describe("costs", () => {
  it("default per-side fraction matches the legacy flat 5bps", () => {
    expect(costPerSideFraction()).toBeCloseTo(0.0005, 10);
  });

  it("netPnl deducts costs on both legs", () => {
    // entry 100, exit 110, qty 10 → gross 100; costs = (100+110)*10*0.0005 = 1.05
    expect(netPnl(100, 110, 10, 100)).toBeCloseTo(98.95, 6);
  });

  it("costR scales inversely with stop width", () => {
    // round trip = 2*0.0005 = 0.001; stop 1% → 0.001/0.01 = 0.1 R
    expect(costR(0.01)).toBeCloseTo(0.1, 10);
  });

  it("costR is Infinity for a non-positive stop (EV gate must reject)", () => {
    expect(costR(0)).toBe(Infinity);
    expect(costR(-0.01)).toBe(Infinity);
  });
});
