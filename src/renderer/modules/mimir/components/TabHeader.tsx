import { memo } from "react";
import { motion } from "framer-motion";

interface TabHeaderProps {
  activeTab: "watchlist" | "screener";
  onChangeTab: (tab: "watchlist" | "screener") => void;
  layoutIdPrefix: string;
}

export const TabHeader = memo(function TabHeader({
  activeTab,
  onChangeTab,
  layoutIdPrefix,
}: TabHeaderProps) {
  return (
    <div
      className="flex items-center gap-0.5 p-0.5 bg-foreground/5 rounded-full shrink-0 mr-3"
      role="tablist"
      aria-label="Dashboard Sidebar Tabs"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "watchlist"}
        aria-controls={`${layoutIdPrefix}-watchlist-panel`}
        id={`${layoutIdPrefix}-watchlist-tab`}
        onClick={() => onChangeTab("watchlist")}
        style={{ padding: "3px 8px" }}
        className={`relative text-[7.5px] font-mono uppercase tracking-wider whitespace-nowrap shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          activeTab === "watchlist" ? "!text-black font-black" : "text-muted-foreground hover:text-foreground font-black"
        }`}
      >
        {activeTab === "watchlist" && (
          <motion.div
            layoutId={`${layoutIdPrefix}-tab-indicator`}
            className="absolute inset-0 bg-white rounded-full shadow-sm"
            style={{ borderRadius: 9999 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
          />
        )}
        <span className="relative z-10 font-black">Watchlists</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "screener"}
        aria-controls={`${layoutIdPrefix}-screener-panel`}
        id={`${layoutIdPrefix}-screener-tab`}
        onClick={() => onChangeTab("screener")}
        style={{ padding: "3px 8px" }}
        className={`relative text-[7.5px] font-mono uppercase tracking-wider whitespace-nowrap shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          activeTab === "screener" ? "!text-black font-black" : "text-muted-foreground hover:text-foreground font-black"
        }`}
      >
        {activeTab === "screener" && (
          <motion.div
            layoutId={`${layoutIdPrefix}-tab-indicator`}
            className="absolute inset-0 bg-white rounded-full shadow-sm"
            style={{ borderRadius: 9999 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
          />
        )}
        <span className="relative z-10 font-black">Screener</span>
      </button>
    </div>
  );
});
