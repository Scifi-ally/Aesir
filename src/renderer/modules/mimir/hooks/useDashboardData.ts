import { useMemo, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/modules/mimir/store/useStore";
import { api } from "@/modules/mimir/lib/api";
import { marketDataStore } from "@/modules/mimir/providers/MarketDataProvider";
import { subscribeWsSymbols } from "@/modules/mimir/hooks/useWebSocket";
import { fmtNum } from "@/modules/mimir/lib/format";
import type { WatchlistItem, Suggestion } from "@/modules/mimir/types/api";

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

export function useDashboardData() {
  const queryClient = useQueryClient();
  
  const selectedSymbol = useStore((s) => s.selectedSymbol);
  const setSelectedSymbol = useStore((s) => s.setSelectedSymbol);
  const wsConnected = useStore((s) => s.wsConnected);
  
  const scanState = useStore(useShallow((s) => ({ scanning: s.scanState.scanning, current: s.scanState.current, total: s.scanState.total })));
  const setScanState = useStore((s) => s.setScanState);
  const scanLogs = useStore((s) => s.scanLogs);
  const mergeIndices = useStore((s) => s.mergeIndices);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: api.sessionState,
    refetchInterval: scanState.scanning ? 5000 : 15000,
    staleTime: 10000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (sessionQuery.data && !sessionQuery.data.scanRunning && scanState.scanning) {
      setScanState({ scanning: false, phase: "completed", current: 0, total: 0 });
    }
  }, [sessionQuery.data, sessionQuery.data?.scanRunning, scanState.scanning, setScanState]);

  const statusQuery = useQuery({
    queryKey: ["status"],
    queryFn: api.systemStatus,
    refetchInterval: 15000,
    staleTime: 10000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    placeholderData: (prev) => prev,
  });
  const watchlistQuery = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlistToday,
    refetchInterval: 15000,
    staleTime: 10000,
    gcTime: 300000,
    placeholderData: (previousData) => previousData,
  });
  const suggestionsQuery = useQuery<Suggestion[]>({ queryKey: ["suggestions"], queryFn: () => api.activeSuggestions(), refetchInterval: 15000, staleTime: 10000, placeholderData: (prev) => prev });
  const positionsQuery = useQuery({ queryKey: ["paperTrading", "positions"], queryFn: () => api.paper.positions(), refetchInterval: 10000, staleTime: 5000, placeholderData: (prev) => prev });
  const paperHistoryQuery = useQuery({ queryKey: ["paperTrading", "history"], queryFn: () => api.paper.history(), refetchInterval: 15000, staleTime: 10000, placeholderData: (prev) => prev });
  const indicesQuery = useQuery({ queryKey: ["indices"], queryFn: api.dashboardIndices, refetchInterval: 15000, staleTime: 10000, placeholderData: (prev) => prev });
  const regimeQuery = useQuery({ queryKey: ["regime"], queryFn: api.marketRegime, refetchInterval: 30000, staleTime: 20000, placeholderData: (prev) => prev });
  const monitoringQuery = useQuery({ queryKey: ["monitoring"], queryFn: api.intradayMonitoring, refetchInterval: 15000, staleTime: 10000, placeholderData: (prev) => prev });
  const indianContextQuery = useQuery({ queryKey: ["indian-context"], queryFn: api.indianContext, refetchInterval: 60000, staleTime: 45000, placeholderData: (prev) => prev });
  const customWatchlistQuery = useQuery({ queryKey: ["customWatchlist"], queryFn: api.customWatchlist, refetchInterval: 15000, staleTime: 10000, placeholderData: (prev) => prev });
  
  const scanning = scanState.scanning || Boolean(sessionQuery.data?.scanRunning);
  const isScanActive = scanning;
  
  const activeSymbols = useMemo(() => {
    const symbols = new Set<string>();
    (suggestionsQuery.data ?? []).filter(s => s.status === "ACTIVE" || s.status === "PENDING").forEach(s => symbols.add(s.symbol));
    (monitoringQuery.data?.monitoredStocks ?? []).forEach(s => symbols.add(s.symbol));
    return symbols;
  }, [suggestionsQuery.data, monitoringQuery.data]);

  const watchlistItems = useMemo(() => {
    const wl = watchlistQuery.data as (typeof watchlistQuery.data & { isFallback?: boolean }) | undefined;
    const hideStale = scanning && Boolean(wl?.isFallback);
    const items = hideStale ? [] : [...flattenWatchlist(wl)];
    const existingSymbols = new Set(items.map(i => i.symbol));

    if (scanLogs && scanLogs.length > 0) {
      scanLogs.forEach((log) => {
        if (!existingSymbols.has(log.symbol)) {
          items.push({
            symbol: log.symbol,
            name: log.symbol,
            category: "SCANNED",
            condition: log.reason || log.status || "Live Scan Candidate",
            priority: 15,
          });
          existingSymbols.add(log.symbol);
        }
      });
    }

    (suggestionsQuery.data ?? []).filter(s => s.status === "ACTIVE" || s.status === "PENDING").forEach(s => {
      if (!existingSymbols.has(s.symbol)) {
        items.unshift({
          symbol: s.symbol,
          name: s.symbol,
          category: "ACTIVE SIGNALS",
          condition: `Active ${s.direction} Signal @ ₹${fmtNum(s.entryPrice, 2)}`,
          priority: 100,
        });
        existingSymbols.add(s.symbol);
      } else {
        const idx = items.findIndex(i => i.symbol === s.symbol);
        if (idx !== -1) {
          items[idx] = {
            ...items[idx],
            category: "ACTIVE SIGNALS",
            condition: `Active ${s.direction} Signal @ ₹${fmtNum(s.entryPrice, 2)}`,
            priority: 100,
          };
        }
      }
    });

    return items.sort((a, b) => {
      const aActive = activeSymbols.has(a.symbol) ? 1 : 0;
      const bActive = activeSymbols.has(b.symbol) ? 1 : 0;
      return bActive - aActive || (b.priority ?? 0) - (a.priority ?? 0) || a.symbol.localeCompare(b.symbol);
    });
  }, [watchlistQuery.data, scanning, scanLogs, activeSymbols, suggestionsQuery.data]);

  const watchlistSymbolsKey = useMemo(() => watchlistItems.filter(r => r.category !== "SCANNED").map(r => r.symbol).join(","), [watchlistItems]);
  const watchlistSymbols = useMemo(() => (watchlistSymbolsKey ? watchlistSymbolsKey.split(",") : []), [watchlistSymbolsKey]);

  const [debouncedSymbols, setDebouncedSymbols] = useState<string[]>(watchlistSymbols);
  const lastUpdateRef = useRef(0);
  const handlerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current > 300) {
      setDebouncedSymbols(watchlistSymbols);
      lastUpdateRef.current = now;
      if (handlerRef.current) clearTimeout(handlerRef.current);
    } else {
      if (handlerRef.current) clearTimeout(handlerRef.current);
      handlerRef.current = setTimeout(() => {
        setDebouncedSymbols(watchlistSymbols);
        lastUpdateRef.current = Date.now();
      }, 300);
    }
    return () => {
      if (handlerRef.current) clearTimeout(handlerRef.current);
    };
  }, [watchlistSymbols]);

  const sparklinesQuery = useQuery({
    queryKey: ["sparklines", debouncedSymbols],
    queryFn: () => api.sparklines(debouncedSymbols),
    staleTime: 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (indicesQuery.data) {
      mergeIndices({
        nifty: { ltp: indicesQuery.data.nifty50?.ltp ?? null, changePct: indicesQuery.data.nifty50?.changePct ?? null },
        sensex: { ltp: indicesQuery.data.sensex?.ltp ?? null, changePct: indicesQuery.data.sensex?.changePct ?? null },
        banknifty: { ltp: indicesQuery.data.bankNifty?.ltp ?? null, changePct: indicesQuery.data.bankNifty?.changePct ?? null },
        finnifty: { ltp: indicesQuery.data.finnifty?.ltp ?? null, changePct: indicesQuery.data.finnifty?.changePct ?? null },
        vix: { ltp: indicesQuery.data.indiaVix?.ltp ?? null, changePct: indicesQuery.data.indiaVix?.changePct ?? null },
      });
      if (indicesQuery.data.nifty50?.ltp != null) marketDataStore.updateFromRest("NIFTY 50", { ltp: indicesQuery.data.nifty50.ltp, changePct: indicesQuery.data.nifty50.changePct });
      if (indicesQuery.data.sensex?.ltp != null) marketDataStore.updateFromRest("SENSEX", { ltp: indicesQuery.data.sensex.ltp, changePct: indicesQuery.data.sensex.changePct });
      if (indicesQuery.data.bankNifty?.ltp != null) marketDataStore.updateFromRest("BANK NIFTY", { ltp: indicesQuery.data.bankNifty.ltp, changePct: indicesQuery.data.bankNifty.changePct });
      if (indicesQuery.data.finnifty?.ltp != null) marketDataStore.updateFromRest("FIN NIFTY", { ltp: indicesQuery.data.finnifty.ltp, changePct: indicesQuery.data.finnifty.changePct });
      if (indicesQuery.data.indiaVix?.ltp != null) marketDataStore.updateFromRest("INDIA VIX", { ltp: indicesQuery.data.indiaVix.ltp, changePct: indicesQuery.data.indiaVix.changePct });
    }
  }, [indicesQuery.data, mergeIndices]);

  useEffect(() => {
    if (watchlistQuery.data) {
      const items = flattenWatchlist(watchlistQuery.data);
      items.forEach((item) => {
        const price = item.price ?? item.ltp;
        const changePct = item.changePct ?? null;
        if (price != null && Number.isFinite(price) && price > 0) {
          marketDataStore.updateFromRest(item.symbol, {
            ltp: price,
            changePct: changePct ?? null,
            prevClose: item.prevClose ?? null,
          });
        }
      });
    }
  }, [watchlistQuery.data]);

  useEffect(() => {
    if (!selectedSymbol && watchlistItems.length > 0) {
      setSelectedSymbol(watchlistItems[0]!.symbol);
    }
  }, [watchlistItems, selectedSymbol, setSelectedSymbol]);

  useEffect(() => {
    const customSymbols = (customWatchlistQuery.data?.data ?? []).map((i: { symbol: string }) => i.symbol);
    const allSymbols = new Set([...watchlistSymbols, ...customSymbols, ...Array.from(activeSymbols)]);
    if (selectedSymbol) allSymbols.add(selectedSymbol);
    if (allSymbols.size > 0) {
      subscribeWsSymbols(Array.from(allSymbols));
    }
  }, [watchlistSymbols, customWatchlistQuery.data, activeSymbols, selectedSymbol, wsConnected]);

  // Prefetch candles for active and adjacent top watchlist items so switching is 0ms instant
  useEffect(() => {
    if (!selectedSymbol) return;
    const topSymbols = [
      selectedSymbol,
      ...watchlistItems.slice(0, 5).map((i) => i.symbol).filter((s) => s !== selectedSymbol),
    ];
    topSymbols.forEach((sym) => {
      queryClient.prefetchQuery({
        queryKey: ["candles", sym, "day", 15],
        queryFn: () => api.candles(sym, "day", 15),
        staleTime: 15000,
      }).catch(() => {});
    });
  }, [selectedSymbol, watchlistItems, queryClient]);

  const prevScanActiveRef = useRef(false);
  useEffect(() => {
    if (scanning && !prevScanActiveRef.current) {
      queryClient.setQueryData(["watchlist"], undefined);
    }
    if (scanning && watchlistItems.length === 1 && watchlistItems[0]?.category === "SCANNED") {
      setSelectedSymbol(watchlistItems[0].symbol);
    }
    if (prevScanActiveRef.current && !isScanActive) {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] }).then(() => {
        useStore.getState().setScanLogs([]);
        if (watchlistItems.length > 0 && !watchlistItems.find(r => r.symbol === selectedSymbol)) {
          setSelectedSymbol(watchlistItems[0]?.symbol || "NIFTY 50");
        }
      });
    }
    prevScanActiveRef.current = isScanActive;
  }, [scanning, isScanActive, watchlistItems, selectedSymbol, setSelectedSymbol, queryClient]);

  const session = sessionQuery.data;
  const status = statusQuery.data;
  const suggestions = suggestionsQuery.data ?? [];
  const hasNoStocks = watchlistItems.length === 0 && suggestions.length === 0 && activeSymbols.size === 0;
  const showClock = isScanActive || hasNoStocks;
  const positions = positionsQuery.data ?? [];
  const regime = regimeQuery.data;
  const monitoring = monitoringQuery.data;
  const indianContext = indianContextQuery.data ?? { fiiDii: null, niftyOptionChain: null };

  const activeSymbol = selectedSymbol || watchlistItems[0]?.symbol || "NIFTY 50";

  const selectedPosition = useMemo(() => {
    const openPos = positions.find((p: import("@/modules/mimir/types/api").PaperPosition) => p.symbol === activeSymbol && (p.status === "OPEN" || p.quantity !== 0));
    if (openPos) return openPos;
    const histPos = (paperHistoryQuery.data ?? []).find((p: import("@/modules/mimir/types/api").PaperPosition) => p.symbol === activeSymbol);
    if (histPos) return histPos;
    return undefined;
  }, [positions, paperHistoryQuery.data, activeSymbol]);

  return {
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
    suggestionsQuery,
    customWatchlistQuery,
    activeSymbols,
  };
}
