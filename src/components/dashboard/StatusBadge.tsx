import React from 'react';
import { motion } from 'framer-motion';

// 1. Define all possible loading variants in a dictionary
const LOADING_STYLES: Record<string, { bg: string; bgDim: string; text: string; defaultLabel: string }> = {
  default: { bg: "rgba(99, 102, 241, 0.15)", bgDim: "rgba(99, 102, 241, 0.05)", text: "#818cf8", defaultLabel: "Processing..." }, // Indigo
  network: { bg: "rgba(56, 189, 248, 0.15)", bgDim: "rgba(56, 189, 248, 0.05)", text: "#38bdf8", defaultLabel: "Syncing..." }, // Sky Blue
  secure: { bg: "rgba(167, 139, 250, 0.15)", bgDim: "rgba(167, 139, 250, 0.05)", text: "#a78bfa", defaultLabel: "Verifying..." }, // Purple
  warning: { bg: "rgba(245, 158, 11, 0.15)", bgDim: "rgba(245, 158, 11, 0.05)", text: "#f59e0b", defaultLabel: "Retrying..." }, // Amber
};

// 2. Add a fallback style for unrecognized variants
const FALLBACK_STYLE = {
  bg: "rgba(255, 255, 255, 0.15)",
  bgDim: "rgba(255, 255, 255, 0.05)",
  text: "#d1d5db",
  defaultLabel: "Loading..."
};

interface LoadingBadgeProps {
  /** Optional variant key that maps to LOADING_STYLES */
  variant?: string;
  /** Optional text override. If not provided, it uses the variant's defaultLabel */
  text?: string;
}

export function LoadingBadge({ variant = 'default', text }: LoadingBadgeProps) {
  // 3. SAFELY grab the style, or use the fallback if it doesn't exist
  const style = LOADING_STYLES[variant] || FALLBACK_STYLE;

  const displayLabel = text || style.defaultLabel;

  return (
    <motion.span
      animate={{ backgroundColor: [style.bg, style.bgDim, style.bg] }}
      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        color: style.text,
        padding: "4px 10px", // Exactly matches StatusBadge
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        whiteSpace: "nowrap"
      }}
    >
      {/* Sleek Crescent Micro-Spinner */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
        style={{
          width: "12px",
          height: "12px",
          border: `2px solid ${style.text}`,
          borderTopColor: "transparent",
          borderRightColor: "transparent",
          borderRadius: "50%",
          boxSizing: "border-box"
        }}
      />
      {/* Pulsing Text */}
      <motion.span
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      >
        {displayLabel}
      </motion.span>
    </motion.span>
  );
}