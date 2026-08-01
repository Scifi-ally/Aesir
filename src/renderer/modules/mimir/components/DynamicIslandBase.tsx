import { AnimatePresence, motion } from "framer-motion";
import { useState, type CSSProperties, type ReactNode } from "react";
import { SPRING_STANDARD, FADE_FAST } from "@/modules/mimir/lib/motion";

export interface DynamicIslandProps {
  children?: ReactNode;
  collapsedContent?: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  toggleOnClick?: boolean;
  placement?: "center" | "top";
  className?: string;
  style?: CSSProperties;
  contentKey?: string | number;
}

const islandStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  width: "fit-content",
  maxWidth: "calc(100vw - 32px)",
  overflow: "hidden",
  boxShadow: "0 8px 16px rgba(0, 0, 0, 0.25)",
};

const contentStyle: CSSProperties = {
  display: "flex",
  width: "max-content",
  maxWidth: "100%",
  alignItems: "flex-start",
  justifyContent: "center",
};

// One smooth animation for everything the island does
const ISLAND_SPRING = { type: "spring", stiffness: 180, damping: 22, mass: 1 } as const;

export function DynamicIsland({
  children,
  collapsedContent,
  expanded: controlledExpanded,
  defaultExpanded = true,
  onExpandedChange,
  toggleOnClick = false,
  placement = "center",
  className,
  style,
  contentKey,
}: DynamicIslandProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] =
    useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : uncontrolledExpanded;

  const setExpanded = (nextExpanded: boolean) => {
    if (!isControlled) setUncontrolledExpanded(nextExpanded);
    onExpandedChange?.(nextExpanded);
  };

  return (
    <motion.div
      role="region"
      aria-label="Dynamic Island"
      aria-expanded={expanded}
      initial={
        placement === "top"
          ? { y: -140, opacity: 0 }
          : { y: 0, opacity: 1 }
      }
      animate={{ y: 0, opacity: 1 }}
      exit={
        placement === "top"
          ? { y: -140, opacity: 0, scale: 0.82 }
          : { y: 0, opacity: 0, scale: 0.82 }
      }
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      className={className}
      style={{
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        willChange: "transform, opacity",
        ...(placement === "top" && {
          position: "absolute",
          top: 16,
          left: 0,
          right: 0,
          zIndex: 9999,
        }),
      }}
    >
      <motion.div
        layout
        onClick={() => toggleOnClick && setExpanded(!expanded)}
        initial={false}
        animate={{
          y: expanded ? 0 : (collapsedContent ? 0 : -24),
          scale: expanded ? 1 : (collapsedContent ? 1 : 0.85),
          opacity: expanded ? 1 : (collapsedContent ? 1 : 0)
        }}
        transition={ISLAND_SPRING}
        className="bg-background text-foreground font-sans relative overflow-hidden"
        style={{
          ...islandStyle,
          boxShadow: "0 8px 16px rgba(0, 0, 0, 0.25)",
          pointerEvents: expanded ? "auto" : (collapsedContent ? "auto" : "none"),
          ...(expanded
            ? { minWidth: 36, minHeight: 36, borderRadius: 42, padding: "8px 12px" }
            : collapsedContent
              ? {
                  minWidth: 100,
                  minHeight: 36,
                  borderRadius: 999,
                  padding: "8px 16px",
                  cursor: toggleOnClick ? "pointer" : undefined,
                }
              : {
                  minWidth: 0,
                  minHeight: 0,
                  padding: 0,
                }),
          ...style,
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={contentKey ?? (expanded ? "expanded-content" : "collapsed-content")}
            initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{
              display: "flex",
              width: "max-content",
              maxWidth: "100%",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {expanded ? children : collapsedContent}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default DynamicIsland;
