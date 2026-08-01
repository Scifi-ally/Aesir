import { useCallback, useEffect, useMemo, useState, lazy, Suspense, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useHotkeys } from "react-hotkeys-hook";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/modules/mimir/components/TopBar";
import { PriceChart } from "@/modules/mimir/components/PriceChart";
import { WatchlistStack } from "@/modules/mimir/components/WatchlistStack";
import { ScreenerTargetsStack } from "@/modules/mimir/components/ScreenerTargetsStack";
import { DetailPanel } from "@/modules/mimir/components/DetailPanel";
import { ScanClockPanel } from "@/modules/mimir/components/ScanClockPanel";
import { StatusBar } from "@/modules/mimir/components/StatusBar";
import { TabHeader } from "@/modules/mimir/components/TabHeader";
import { useDashboardData } from "@/modules/mimir/hooks/useDashboardData";

const SuggestionsSlider = lazy(() => import("@/modules/mimir/components/SuggestionsSlider").then(m => ({ default: m.SuggestionsSlider })));
const PaperTradingPanel = lazy(() => import("@/modules/mimir/components/PaperTradingPanel").then(m => ({ default: m.PaperTradingPanel })));
const ReportsLibrary = lazy(() => import("@/modules/mimir/components/ReportsLibrary").then(m => ({ default: m.ReportsLibrary })));
const SettingsDialog = lazy(() => import("@/modules/mimir/components/SettingsDialog").then(m => ({ default: m.SettingsDialog })));

import { UpstoxHeadlessLogin } from "@/modules/mimir/components/UpstoxHeadlessLogin";
import { Skeleton } from "@/modules/mimir/components/atoms/Skeleton";
import { useWebSocket, subscribeWsSymbols } from "@/modules/mimir/hooks/useWebSocket";
import { useMediaQuery } from "@/modules/mimir/hooks/useMediaQuery";
import { useStore } from "@/modules/mimir/store/useStore";
import { api } from "@/modules/mimir/lib/api";
import { fmtNum } from "@/modules/mimir/lib/format";
import { marketDataStore } from "@/modules/mimir/providers/MarketDataProvider";

import type { WatchlistItem, Suggestion } from "@/modules/mimir/types/api";
import { FADE_FAST, FADE_STANDARD, SPRING_GENTLE, SPRING_SNAPPY } from "@/modules/mimir/lib/motion";

export default function Dashboard() {

  useWebSocket();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const selectedSymbol = useStore((s) => s.selectedSymbol);
  const setSelectedSymbol = useStore((s) => s.setSelectedSymbol);
  const wsConnected = useStore((s) => s.wsConnected);

  const {
    queryClient,
    session,
    status,
    suggestions,
    positions,
    regime,
    monitoring,
    indianContext,
    watchlistItems,
    activeSymbol,
    selectedPosition,
    sparklinesQuery,
    scanState,
    hasNoStocks,
    showClock,
    isScanActive,
    statusQuery,
    sessionQuery,
    watchlistQuery,
    customWatchlistQuery,
    suggestionsQuery,
    activeSymbols,
  } = useDashboardData();

  const [authorizing, setAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<"actual" | "forecast">("actual");
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [isPaperTradingOpen, setIsPaperTradingOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"watchlist" | "screener">("watchlist");


  // Dynamic Favicon Logic
  useEffect(() => {
    document.title = "Mimir";
    const link: HTMLLinkElement = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.type = "image/svg+xml";
    link.rel = "icon";
    if (session?.isMarketOpen) {
      link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%2322c55e"/></svg>';
    } else {
      link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23ef4444"/></svg>';
    }
    document.getElementsByTagName('head')[0].appendChild(link);
  }, [session]);

  const showIsland = useStore((s) => s.showIsland);

  // Global Keyboard Navigation
  useHotkeys("p", (e) => {
    e.preventDefault();
    setIsSuggestionsOpen(prev => !prev);
  }, { preventDefault: true });

  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen);

  useHotkeys(["up", "down", "left", "right"], (e) => {
    if (commandPaletteOpen) return;
    e.preventDefault();
    if (watchlistItems.length === 0) return;
    const currentIndex = watchlistItems.findIndex((item) => item.symbol === activeSymbol);
    
    let newIndex: number;
    if (e.key === "ArrowDown") {
      newIndex = currentIndex < watchlistItems.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === "ArrowUp") {
      newIndex = currentIndex > 0 ? currentIndex - 1 : watchlistItems.length - 1;
    } else if (e.key === "ArrowRight") {
      newIndex = Math.min(currentIndex + 3, watchlistItems.length - 1);
    } else {
      newIndex = Math.max(currentIndex - 3, 0);
    }
    
    const newSymbol = watchlistItems[newIndex]?.symbol;
    if (newSymbol) setSelectedSymbol(newSymbol);
  }, [watchlistItems, activeSymbol, setSelectedSymbol, commandPaletteOpen]);

  // Token Expiry Alert Logic
  useEffect(() => {
    if (status?.upstoxTokenExpiry) {
      const msLeft = status.upstoxTokenExpiry - Date.now();
      const fifteenMins = 15 * 60 * 1000;
      if (msLeft > 0 && msLeft < fifteenMins) {
        const mins = Math.ceil(msLeft / 60000);
        showIsland({ isNotification: true, title: "Upstox Session Expiring", subtitle: `⚠️ Upstox session expires in ${mins} minutes. Re-authorize soon!`, showSuccessOnly: false });
      }
    }
  }, [status?.upstoxTokenExpiry, showIsland]);


  // Trigger success tick if we just returned from Upstox auth
  useEffect(() => {
    const isPending = localStorage.getItem("upstox_auth_pending") === "true";
    if (isPending && status?.upstoxAuthenticated) {
      localStorage.removeItem("upstox_auth_pending");
      showIsland({
        title: "",
        subtitle: "",
        showSuccessOnly: true,
      });
    }
  }, [status?.upstoxAuthenticated, showIsland]);

  // Stable handlers so memo()'d TopBar doesn't re-render on every query refetch
  const openSuggestions = useCallback(() => setIsSuggestionsOpen(true), []);
  const openPaperTrading = useCallback(() => setIsPaperTradingOpen(true), [setIsPaperTradingOpen]);
  const openReports = useCallback(() => setIsReportsOpen(true), [setIsReportsOpen]);
  const openSettings = useCallback(() => setIsSettingsOpen(true), [setIsSettingsOpen]);
  const openEventFeed = useCallback(() => useStore.getState().setEventFeedOpen(true), []);

  const authorizeUpstox = useCallback(async (type: "trading" | "data" = "trading") => {
    setAuthorizing(true);
    setAuthError(null);
    try {
      const data = await api.authUrl(type);
      if (data.alreadyAuthenticated) {
        setAuthorizing(false);
        showIsland({
          forceOverride: true,
          title: "",
          subtitle: "",
          showSuccessOnly: true,
        });
        return;
      }
      if (!data.url) throw new Error(data.error || "Authorization URL unavailable");
      
      setAuthorizing(false);
      showIsland({
        isLocked: true,
        title: "Upstox Login",
        subtitle: "Sign in securely via Headless Auth",
        hideCancel: true,
        content: (
          <UpstoxHeadlessLogin 
            type={type} 
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["status"] });
              showIsland({ forceOverride: true, title: "", subtitle: "", showSuccessOnly: true });
            }} 
          />
        )
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authorization failed");
      setAuthorizing(false);
      showIsland({
        forceOverride: true,
        title: "Auth Failed",
        subtitle: error instanceof Error ? error.message : "Authorization failed",
        isDestructive: true,
        showSuccessOnly: false,
        duration: 4000
      });
    }
  }, [queryClient, showIsland]);

  const apiError = authError || sessionQuery.error?.message || watchlistQuery.error?.message || null;

  const desktopTabHeader = useMemo(() => (
    <TabHeader activeTab={sidebarTab} onChangeTab={setSidebarTab} layoutIdPrefix="desktop" />
  ), [sidebarTab]);

  const mobileTabHeader = useMemo(() => (
    <TabHeader activeTab={sidebarTab} onChangeTab={setSidebarTab} layoutIdPrefix="mobile" />
  ), [sidebarTab]);

  // First load: hold a clean splash until system status resolves so the UI never
  // paints default/unauthorized states that flip a second later.
  if (statusQuery.isPending) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background text-foreground">
        <span className="font-mono text-2xl font-normal tracking-[0.3em]">MIMIR</span>
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/60 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground font-sans">
      {/* Background is purely dark black now */}
      
      <div className="z-10 flex h-full flex-col overflow-hidden">
        <TopBar
          status={status}
          session={session}
          onOpenSettings={openSettings}
          onOpenSuggestions={openSuggestions}
          onOpenEventFeed={openEventFeed}
          onOpenPaperTrading={openPaperTrading}
          onOpenReports={openReports}
          onAuthorizeUpstox={(type: "trading" | "data" = "trading") => authorizeUpstox(type)}
          authorizing={authorizing}
          isScanActive={isScanActive}
        />
        <AnimatePresence>
          {apiError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING_GENTLE}
              className="shrink-0 px-2 py-0.5 overflow-hidden"
            >
              <p className="text-xs font-normal text-destructive">{apiError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="min-h-0 flex-1 overflow-hidden p-4 pt-2">
          {isDesktop ? (
          <div className="flex w-full h-full gap-0">
            {/* Left Column: Chart (Top) & Watchlist (Bottom) */}
            <div className="flex flex-col w-[65%] xl:w-[72%] min-w-0 h-full pr-2">
                  <motion.div 
                    className="flex-[65] w-full min-h-0 min-w-0 rounded-2xl mb-3 relative z-10"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...FADE_STANDARD, delay: 0.05 }}
                  >
                  <AnimatePresence mode="wait">
                    {showClock ? (
                      <motion.div
                        key="scan-progress"
                        className="w-full h-full flex flex-col items-center justify-center bg-transparent"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={FADE_STANDARD}
                      >
                        <ScanClockPanel 
                          scanProgress={scanState.total > 0 ? (scanState.current / scanState.total) * 100 : undefined}
                        />
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="price-chart"
                        className="w-full h-full"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={FADE_FAST}
                      >
                        <PriceChart 
                          symbol={activeSymbol} 
                          chartMode={chartMode} 
                          onChartModeChange={setChartMode} 
                          isMarketOpen={session?.isMarketOpen} 
                          suggestion={suggestions.find(s => s.symbol === activeSymbol)} 
                          position={selectedPosition}
                          isAuthenticated={status?.upstoxAuthenticated}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  </motion.div>
                
                  <motion.div 
                    className="flex-[35] w-full min-h-0 min-w-0 pt-2 flex flex-col"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...FADE_STANDARD, delay: 0.1 }}
                  >
                    <div className="flex-1 min-h-0 relative">
                      {sidebarTab === "watchlist" ? (
                        <WatchlistStack
                          headerLeft={desktopTabHeader}
                          items={watchlistItems}
                          customItems={customWatchlistQuery.data?.data}
                          monitored={monitoring?.monitoredStocks}
                          suggestions={suggestions}
                          selectedSymbol={activeSymbol}
                          sparklines={sparklinesQuery.data}
                          onSelect={setSelectedSymbol}
                        />
                      ) : (
                        <ScreenerTargetsStack
                          headerLeft={desktopTabHeader}
                          selectedSymbol={activeSymbol}
                          sparklines={sparklinesQuery.data}
                          onSelect={setSelectedSymbol}
                        />
                      )}
                    </div>
                  </motion.div>
            </div>

            {/* Right Column: Detail Panel */}
            <div className="flex flex-col w-[35%] xl:w-[28%] min-w-0 h-full pl-2">
              <motion.div 
                className="h-full w-full min-h-0 min-w-0 rounded-2xl relative z-10 overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={FADE_FAST}
              >
                <DetailPanel
                  suggestions={suggestions}
                  selectedSymbol={activeSymbol}
                  session={session}
                  isScanActive={isScanActive}
                  isAuthenticated={status?.upstoxAuthenticated}
                />
              </motion.div>
            </div>
          </div>
          ) : (
          <div className="flex flex-col gap-4 h-full overflow-y-auto">
            {/* Chart scales with the viewport instead of a fixed 500px so short
                phones aren't dominated by it and tablets get more chart. */}
            <div className="h-[55svh] min-h-[320px] max-h-[560px] shrink-0">
              <AnimatePresence mode="wait">
                {isScanActive ? (
                  <motion.div 
                    key="scan-progress-mobile"
                    className="w-full h-full flex flex-col items-center justify-center bg-transparent"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={FADE_STANDARD}
                  >
                    <ScanClockPanel 
                      scanProgress={
                        scanState.total > 0 
                          ? (scanState.current / scanState.total) * 100 
                          : 0
                      }
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="price-chart-mobile"
                    className="w-full h-full"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={FADE_FAST}
                  >
                    <PriceChart 
                      symbol={activeSymbol} 
                      chartMode={chartMode} 
                      onChartModeChange={setChartMode} 
                      isMarketOpen={session?.isMarketOpen} 
                      suggestion={suggestions.find(s => s.symbol === activeSymbol)} 
                      position={selectedPosition}
                      isAuthenticated={status?.upstoxAuthenticated} 
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="h-[400px] shrink-0 flex flex-col">
              <div className="flex-1 min-h-0 relative">
                {sidebarTab === "watchlist" ? (
                  <WatchlistStack
                    headerLeft={mobileTabHeader}
                    items={watchlistItems} monitored={monitoring?.monitoredStocks} suggestions={suggestions} selectedSymbol={activeSymbol} sparklines={sparklinesQuery.data} onSelect={setSelectedSymbol}
                  />
                ) : (
                  <ScreenerTargetsStack
                    headerLeft={mobileTabHeader}
                    selectedSymbol={activeSymbol} sparklines={sparklinesQuery.data} onSelect={setSelectedSymbol}
                  />
                )}
              </div>
            </div>
            {/* The detail panel is a fixed non-scrolling composition — it needs
                real height to breathe; 400px crushed the ladder + matrix. */}
            <div className="h-[600px] shrink-0 px-1">
              <DetailPanel suggestions={suggestions} selectedSymbol={activeSymbol} session={session} isScanActive={isScanActive} />
            </div>
          </div>
          )}
        </div>
        
        <StatusBar
          status={status}
          regime={regime}
          wsConnected={wsConnected}
          macro={indianContext}
        />
      </div>
      
      <Suspense fallback={null}>
        <SuggestionsSlider isOpen={isSuggestionsOpen} onClose={() => setIsSuggestionsOpen(false)} onSelectSymbol={(s) => setSelectedSymbol(s)} activeSuggestions={suggestions} />
        <PaperTradingPanel isOpen={isPaperTradingOpen} onClose={() => setIsPaperTradingOpen(false)} onSelectSymbol={(s) => setSelectedSymbol(s)} />
        <ReportsLibrary isOpen={isReportsOpen} onClose={() => setIsReportsOpen(false)} />
        <SettingsDialog isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </Suspense>
    </div>
    );
  }

function flattenWatchlist(watchlist: Awaited<ReturnType<typeof api.watchlistToday>> | undefined): WatchlistItem[] {
  if (!watchlist) return [];
  const merged = [
    ...watchlist.intradayCandidates,
    ...watchlist.breakoutCandidates,
    ...watchlist.momentumCandidates,
    ...watchlist.gapCandidates,
  ];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.symbol)) return false;
    seen.add(item.symbol);
    return true;
  });
}


