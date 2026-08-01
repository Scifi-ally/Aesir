import { KeyRound, Moon, Sun, Play, BarChart2, Wallet, Plus, FileText, Bell, Settings, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { useState, useEffect, memo, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { flushSync } from "react-dom";
import { cn, toFixed } from "@/modules/mimir/lib/format";
import { Button } from "@/modules/mimir/components/mimir/button";
import type { DashboardIndices, SessionState, SystemStatus } from "@/modules/mimir/types/api";
import { useStore } from "@/modules/mimir/store/useStore";
import AnimatedNumber from "@/modules/mimir/components/atoms/AnimatedNumber";
import { Skeleton } from "@/modules/mimir/components/atoms/Skeleton";

interface TopBarProps {
  status?: SystemStatus;
  session?: SessionState;
  onOpenSettings: () => void;
  onOpenSuggestions: () => void;
  onOpenEventFeed: () => void;
  onOpenPaperTrading: () => void;
  onOpenReports: () => void;
  onAuthorizeUpstox: (type?: "trading" | "data") => void;
  authorizing: boolean;
  isScanActive: boolean;
}

import { api } from "@/modules/mimir/lib/api";
import { SPRING_SNAPPY } from "@/modules/mimir/lib/motion";
import { UpstoxHeadlessLogin } from "./UpstoxHeadlessLogin";

export const TopBar = memo(function TopBar({
  status,
  session: sessionQuery,
  onOpenSettings,
  onOpenSuggestions,
  onOpenEventFeed,
  onOpenPaperTrading,
  onOpenReports,
  onAuthorizeUpstox,
  authorizing,
  isScanActive: scanning
}: TopBarProps) {
  const indices = useStore((s) => s.indices);
  const onSelectSymbol = (symbol: string) => useStore.getState().setSelectedSymbol(symbol);
  const hideIsland = () => useStore.getState().hideIsland();
  
  const wsConnected = useStore((s) => s.wsConnected);
  const scanState = useStore((s) => s.scanState);
  const scanProgress = scanState.total > 0 
    ? (scanState.current / scanState.total) * 100 
    : sessionQuery?.scanProgress 
      ? (sessionQuery.scanProgress.current / Math.max(sessionQuery.scanProgress.total, 1)) * 100 
      : undefined;


  const showIsland = useStore((s) => s.showIsland);

  const isLight = useStore((s) => s.theme) === "light";
  const isMac = navigator.userAgent.toLowerCase().includes('mac');
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const [startingScan, setStartingScan] = useState(false);
  const [stoppingScan, setStoppingScan] = useState(false);
  const queryClient = useQueryClient();
  const { data: tradingMode } = useQuery({
    queryKey: ["trading-mode"],
    queryFn: api.tradingMode,
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const isLiveTrading = tradingMode?.mode === "LIVE";
  const isDualKeyConfigured = Boolean(status?.useDualApiKeys);
  const authorizedKeysCount = (status?.upstoxFeedAuthenticated ? 1 : 0) + (status?.upstoxDataAuthenticated ? 1 : 0);

  const unreadCount = useStore(s => s.events.length);



  useEffect(() => {
    if (scanning) {
      setStartingScan(false);
    }
  }, [scanning]);

  const handleRunScan = async () => {
    if (startingScan) return; // guard double-click before scanning state flips
    setStartingScan(true);
    try {
      await api.triggerScan();
      useStore.getState().setScanState({ scanning: true, phase: "running", current: 0, total: 100 });
      queryClient.setQueryData(["session"], (old: SessionState | undefined) => old ? { ...old, scanRunning: true } : old);
    } catch (err) {
      setStartingScan(false);
      useStore.getState().setScanState({ scanning: false, phase: "completed", current: 0, total: 0 });
      queryClient.setQueryData(["session"], (old: SessionState | undefined) => old ? { ...old, scanRunning: false } : old);
      if (err instanceof Error) {
        showIsland({ isNotification: true, title: "Scan Failed", subtitle: err.message, showSuccessOnly: false });
      } else {
        showIsland({ isNotification: true, title: "Scan Failed", subtitle: "An unknown error occurred", showSuccessOnly: false });
      }
    }
  };

  const handleScanButtonClick = async () => {
    if (scanning) {
      showIsland({
        icon: <Play strokeWidth={3} className="w-6 h-6" />,
        title: "Stop Market Scan?",
        subtitle: "This will halt the current scanning process immediately.",
        confirmText: "Stop Scan",
        isDestructive: true,
        onConfirm: async () => {
            setStoppingScan(true);
          try {
            await api.stopScan();
            useStore.getState().setScanState({ scanning: false, phase: "completed", current: 0, total: 0 });
            queryClient.setQueryData(["session"], (old: SessionState | undefined) => old ? { ...old, scanRunning: false } : old);
          } catch (err) {
            showIsland({ isNotification: true, title: "Failed to stop scan", subtitle: err instanceof Error ? err.message : "Unknown error", showSuccessOnly: false });
          } finally {
            setStoppingScan(false);
          }
        },
      });
    } else {
      await handleRunScan();
    }
  };

  const toggleTheme = (e: React.MouseEvent) => {
    // ALWAYS use the exact button's physical DOM rect on the screen to guarantee the exact origin.
    // We prefer themeButtonRef over e.currentTarget to bypass any synthetic event propagation anomalies.
    let rect: DOMRect;
    if (themeButtonRef.current) {
      rect = themeButtonRef.current.getBoundingClientRect();
    } else {
      rect = e.currentTarget.getBoundingClientRect();
    }
    
    // Prefer actual click coordinates if available (mouse/touch), fallback to button center (keyboard)
    const clickX = 'clientX' in e && e.clientX ? e.clientX : 0;
    const clickY = 'clientY' in e && e.clientY ? e.clientY : 0;
    
    const x = clickX || (rect.left + rect.width / 2);
    const y = clickY || (rect.top + rect.height / 2);

    // Convert to percentages to guarantee alignment with the View Transition snapshot coordinate space,
    // which can differ from the layout viewport on mobile devices (e.g. due to zoom or URL bars).
    const xPct = (x / window.innerWidth) * 100;
    const yPct = (y / window.innerHeight) * 100;

    const oldStyle = document.getElementById("theme-transition-style");
    if (oldStyle) oldStyle.remove();

    const style = document.createElement("style");
    style.id = "theme-transition-style";
    style.innerHTML = `
      @keyframes reveal-theme-dynamic {
        from { clip-path: circle(0px at ${xPct}% ${yPct}%); }
        to { clip-path: circle(150vmax at ${xPct}% ${yPct}%); }
      }
      html.theme-transitioning::view-transition-new(root) {
        animation: reveal-theme-dynamic 450ms cubic-bezier(0.87, 0, 0.13, 1) forwards !important;
      }
    `;
    document.head.appendChild(style);

    const willBeLight = !isLight;
    
    if (!document.startViewTransition) {
      flushSync(() => {
        document.documentElement.classList.toggle("light", willBeLight);
        useStore.getState().setTheme(willBeLight ? "light" : "dark");
      });
      window.dispatchEvent(new Event("themechange"));
      return;
    }

    document.documentElement.style.setProperty("--theme-origin-x", `${x}px`);
    document.documentElement.style.setProperty("--theme-origin-y", `${y}px`);
    document.documentElement.classList.add("theme-transitioning");

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        document.documentElement.classList.toggle("light", willBeLight);
        useStore.getState().setTheme(willBeLight ? "light" : "dark");
      });
      window.dispatchEvent(new Event("themechange"));
    });

    transition.finished.finally(() => {
      document.documentElement.classList.remove("theme-transitioning");
    });
  };

  return (
    <>
      <header
        className={cn(
          "z-50 flex w-full shrink-0 flex-col justify-end bg-transparent px-4 sm:px-6 py-1.5 h-[calc(48px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]"
        )}
      >
        <div className="flex flex-col w-full">
          <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:gap-4 whitespace-nowrap">
            <div className="hidden sm:flex min-w-0 flex-1 items-center gap-x-3 pr-2 relative">

          <div className="flex min-w-0 shrink items-center gap-6 text-[10px] font-semibold text-foreground/50 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pt-2 -mt-2 pb-2 -mb-2">
            <IndexMetric label="NIFTY 50" ltp={indices?.nifty50?.ltp} changePct={indices?.nifty50?.changePct} storeKey="nifty" onSelect={() => onSelectSymbol?.("NIFTY 50")} />
            <div className="hidden sm:contents">
              <IndexMetric label="SENSEX" ltp={indices?.sensex?.ltp} changePct={indices?.sensex?.changePct} storeKey="sensex" onSelect={() => onSelectSymbol?.("SENSEX")} />
            </div>
            <div className="hidden lg:contents">
              <IndexMetric label="BANK NIFTY" ltp={indices?.bankNifty?.ltp} changePct={indices?.bankNifty?.changePct} storeKey="banknifty" onSelect={() => onSelectSymbol?.("BANK NIFTY")} />
            </div>
            <div className="hidden xl:contents">
              <IndexMetric label="FIN NIFTY" ltp={indices?.finnifty?.ltp} changePct={indices?.finnifty?.changePct} storeKey="finnifty" onSelect={() => onSelectSymbol?.("FIN NIFTY")} />
              <IndexMetric label="INDIA VIX" ltp={indices?.indiaVix?.ltp} isVix storeKey="vix" onSelect={() => onSelectSymbol?.("INDIA VIX")} />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 w-full sm:w-auto sm:max-w-[65vw] shrink items-center sm:justify-end gap-3 sm:gap-5 pl-4">
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAPPY}>
            <Button
              variant="ghost"
              size={scanning ? "default" : "icon"}
              onClick={handleScanButtonClick}
              disabled={startingScan || stoppingScan}
              className={cn(
                "relative overflow-hidden h-8 transition-all duration-200 rounded-xl bg-[#18181b] hover:bg-[#27272a]",
                scanning ? "w-auto min-w-[64px] px-3 text-white" : "w-8 text-foreground/80 hover:text-white"
              )}
              title={scanning ? "Stop the active scanner" : "Manually restart the full market scanner"}
            >
              {scanning && scanProgress !== undefined && (
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-bull/30 transition-all duration-500 ease-out"
                  style={{ width: `${scanProgress || 0}%` }}
                />
              )}
              <span className="relative z-10 flex items-center justify-center">
                {scanning && scanProgress !== undefined ? (
                  <span className="text-[12px] font-mono font-bold tracking-wide text-white">
                    {scanProgress > 0 && scanProgress < 100 ? toFixed(scanProgress, 1) : Math.round(scanProgress || 0)}%
                  </span>
                ) : (
                  <Play strokeWidth={3} className={cn("h-4 w-4", startingScan && "animate-pulse text-bull")} />
                )}
              </span>
            </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAPPY}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSuggestions}
              className="h-8 flex items-center gap-2 text-[13px] px-3.5 font-semibold text-foreground/90 hover:text-white bg-[#18181b] hover:bg-[#27272a] transition-all duration-200 rounded-xl"
              title="View Signals Generated"
            >
              <BarChart2 strokeWidth={3} className="h-4 w-4 sm:mr-0.5" />
              <span className="hidden sm:inline">Signals</span>
            </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAPPY}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => useStore.getState().setCommandPaletteOpen(true, "scan ")}
              className="h-8 w-8 p-0 flex items-center justify-center text-foreground/70 hover:bg-[#18181b] hover:text-white transition-all duration-200 rounded-xl"
              title="Add Custom Screener Condition"
            >
              <Plus strokeWidth={3} className="h-4 w-4" />
            </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAPPY}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenReports}
              className="h-8 w-8 p-0 flex items-center justify-center text-foreground/70 hover:bg-[#18181b] hover:text-white transition-all duration-200 rounded-xl"
              title="Open Daily Reports"
            >
              <FileText strokeWidth={3} className="h-4 w-4" />
            </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAPPY}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenPaperTrading}
              className={cn(
                "h-8 w-8 p-0 flex items-center justify-center transition-all duration-200 rounded-xl relative",
                isLiveTrading
                  ? "text-destructive hover:bg-destructive/10 bg-destructive/5"
                  : "text-foreground/70 hover:bg-[#18181b] hover:text-white"
              )}
              title={isLiveTrading ? "Open Live Trading (REAL ORDERS)" : "Open Paper Trading"}
            >
              <Wallet strokeWidth={3} className="h-4 w-4" />
              {isLiveTrading && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-destructive animate-pulse" />
              )}
            </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAPPY}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenEventFeed}
              className="relative h-8 w-8 p-0 flex items-center justify-center text-foreground/70 hover:bg-[#18181b] hover:text-white transition-all duration-200 rounded-xl"
              title="Activity Feed"
            >
              <Bell strokeWidth={3} className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-normal text-white shadow-sm">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAPPY}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="h-8 w-8 p-0 flex items-center justify-center text-foreground/70 hover:bg-[#18181b] hover:text-white transition-all duration-200 rounded-xl"
              title="System Configuration & Settings"
            >
              <Settings strokeWidth={3} className="h-4 w-4" />
            </Button>
            </motion.div>

            <div className="relative">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAPPY}>
                <Button
                  variant={isDualKeyConfigured ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    if (isDualKeyConfigured) {
                      showIsland({
                        title: "Upstox API Keys Status",
                        hideCancel: true, // HMR trigger
                        content: (
                            <div className="flex flex-col gap-3 py-2 w-full mt-2">
                              <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                  <Zap className="h-4 w-4 text-blue-400" />
                                  <span className="text-[13px] font-normal text-foreground">Live Feed Key</span>
                                </div>
                                <div className="flex items-center gap-1 text-[12px]">
                                  {status?.upstoxFeedAuthenticated ? (
                                    <span className="text-bull flex items-center gap-1 font-normal bg-bull/10 px-2 py-0.5 rounded">
                                      <CheckCircle2 strokeWidth={3} className="h-3 w-3" />
                                      {status.upstoxFeedTokenExpiry ? <TokenExpiryDisplay expiry={status.upstoxFeedTokenExpiry} /> : "Verified"}
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); hideIsland(); onAuthorizeUpstox("trading"); }}
                                      disabled={authorizing}
                                      className="text-red-400 hover:text-red-300 hover:bg-red-400/20 transition-colors flex items-center gap-1 font-normal bg-red-400/10 px-2 py-0.5 rounded cursor-pointer disabled:opacity-50"
                                    >
                                      <AlertCircle strokeWidth={3} className="h-3 w-3" />
                                      Authorize
                                    </button>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                  <BarChart2 strokeWidth={3} className="h-4 w-4 text-orange-400" />
                                  <span className="text-[13px] font-normal text-foreground">Analysis Key</span>
                                </div>
                                <div className="flex items-center gap-1 text-[12px]">
                                  {status?.upstoxDataAuthenticated ? (
                                    <span className="text-bull flex items-center gap-1 font-normal bg-bull/10 px-2 py-0.5 rounded">
                                      <CheckCircle2 strokeWidth={3} className="h-3 w-3" />
                                      {status.upstoxDataTokenExpiry ? <TokenExpiryDisplay expiry={status.upstoxDataTokenExpiry} /> : "Verified"}
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); hideIsland(); onAuthorizeUpstox("data"); }}
                                      disabled={authorizing}
                                      className="text-red-400 hover:text-red-300 hover:bg-red-400/20 transition-colors flex items-center gap-1 font-normal bg-red-400/10 px-2 py-0.5 rounded cursor-pointer disabled:opacity-50"
                                    >
                                      <AlertCircle strokeWidth={3} className="h-3 w-3" />
                                      Authorize
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                        )
                      });
                    } else {
                      if (status?.upstoxAuthenticated) {
                        showIsland({
                          title: "Upstox API Key Status",
                          hideCancel: true,
                          content: (
                            <div className="flex flex-col gap-3 py-2 w-full mt-2">
                              <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                  <Zap className="h-4 w-4 text-blue-400" />
                                  <span className="text-[13px] font-normal text-foreground">API Key</span>
                                </div>
                                <div className="flex items-center gap-1 text-[12px]">
                                  <span className="text-bull flex items-center gap-1 font-normal bg-bull/10 px-2 py-0.5 rounded">
                                    <CheckCircle2 strokeWidth={3} className="h-3 w-3" />
                                    {status.upstoxTokenExpiry ? <TokenExpiryDisplay expiry={status.upstoxTokenExpiry} /> : "Verified"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        });
                      } else {
                        onAuthorizeUpstox("trading");
                      }
                    }
                  }}
                  disabled={authorizing}
                  className={cn(
                    "h-8 flex items-center gap-1.5 text-[12px] px-3.5 transition-all rounded-xl font-bold",
                    isDualKeyConfigured
                      ? authorizedKeysCount === 2
                        ? "text-[#00e676] bg-[#00e676]/10 hover:bg-[#00e676]/20"
                        : authorizedKeysCount === 1
                          ? "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20"
                          : "text-red-500 bg-red-500/10 hover:bg-red-500/20"
                      : status && !status.upstoxAuthenticated
                        ? "text-red-500 hover:bg-red-500/10 font-medium bg-red-500/5"
                        : "bg-[#18181b] text-foreground/80 hover:bg-[#27272a] hover:text-white font-medium"
                  )}
                  title={isDualKeyConfigured ? "Upstox Dual API Keys Status" : "Authorize Upstox"}
                >
                  {authorizing ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      <span className="hidden sm:inline">Redirecting...</span>
                    </>
                  ) : isDualKeyConfigured ? (
                    <>
                      <KeyRound className="h-4 w-4 text-current" />
                      <span className="flex items-center gap-1 font-mono font-medium text-[12px] tracking-tight">
                        {authorizedKeysCount}/2
                      </span>
                    </>
                  ) : !status ? (
                    // Status unknown (loading/refetch gap) — neutral, never a false "Authorize" prompt
                    <Skeleton className="inline-block h-3 w-14 rounded bg-foreground/10" />
                  ) : (
                    <>
                      <KeyRound className={cn("h-4 w-4", status.upstoxAuthenticated ? "text-bull" : "text-current")} />
                      {status.upstoxAuthenticated ? (
                        <span>{status.upstoxTokenExpiry ? <TokenExpiryDisplay expiry={status.upstoxTokenExpiry} /> : "Verified"}</span>
                      ) : (
                        <span>Authorize Upstox</span>
                      )}
                    </>
                  )}
                </Button>
              </motion.div>

            </div>
          </div>


          <span className="flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-foreground/80 px-1 font-sans">
            <span className={cn(
              "h-2 w-2 rounded-full", 
              wsConnected ? "bg-[#34C759] shadow-[0_0_8px_rgba(52,199,89,0.6)] animate-[pulse-bloom_4s_ease-in-out_infinite]" : "bg-red-500/80"
            )} />
            <span className="hidden sm:inline">{wsConnected ? "Live" : "Offline"}</span>
          </span>
        </div>
        </div>
          </div>
    </header>
    </>
  );
});

import { useSymbolDataSelector } from "@/modules/mimir/providers/MarketDataProvider";

function IndexMetric({
  label,
  ltp,
  changePct,
  isVix,
  onSelect,
}: {
  label: string;
  ltp: number | null | undefined;
  changePct?: number | null;
  isVix?: boolean;
  storeKey: string;
  onSelect?: () => void;
}) {
  const storeLtp = useSymbolDataSelector(label, (d) => d.ltp);
  const storePct = useSymbolDataSelector(label, (d) => d.changePct);

  const displayLtp = storeLtp ?? ltp;
  const displayPct = storePct ?? changePct;
  const tone = displayPct == null ? "text-foreground/70" : displayPct >= 0 ? "text-bull" : "text-bear";

  // No data yet — show a quiet placeholder instead of animating up from 0
  if (displayLtp == null) {
    return (
      <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap px-1.5 py-0.5">
        <span className="text-foreground/40">{label}</span>
        <Skeleton className="inline-block h-3 w-12 rounded bg-foreground/10" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap cursor-pointer hover:bg-foreground/5 px-1.5 py-0.5 rounded transition-colors"
    >
      <span className="text-foreground/45 font-sans font-bold">{label}</span>
      <strong className="text-foreground font-mono font-bold">
        <AnimatedNumber
          value={displayLtp}
          decimals={2}
          duration={0.3}
          flashColor={true}
        />
      </strong>
      {!isVix && displayPct != null && (
        <strong className={cn(tone, "font-mono font-bold")}>
          <AnimatedNumber
            value={displayPct}
            decimals={1}
            showSign={true}
            suffix="%"
            duration={0.3}
            flashColor={true}
          />
        </strong>
      )}
    </button>
  );
}

function TokenExpiryDisplay({ expiry }: { expiry: number }) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const diff = expiry - now;
      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }
      const hrs = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [expiry]);

  if (!timeLeft) return null;
  return <span className="opacity-80 tabular-nums">{timeLeft}</span>;
}

