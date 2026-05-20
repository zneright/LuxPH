import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

// 1. Define the TypeScript interfaces for props and styles
interface LoadingBadgeProps {
    variant?: 'default' | 'network' | 'secure' | 'warning';
    text?: string;
}

interface StyleConfig {
    bg: string;
    bgDim: string;
    text: string;
    defaultLabel: string;
}

// 2. Define the static style dictionaries outside the component
const LOADING_STYLES: Record<string, StyleConfig> = {
    default: { bg: "rgba(99, 102, 241, 0.15)", bgDim: "rgba(99, 102, 241, 0.05)", text: "#818cf8", defaultLabel: "Processing..." },
    network: { bg: "rgba(56, 189, 248, 0.15)", bgDim: "rgba(56, 189, 248, 0.05)", text: "#38bdf8", defaultLabel: "Syncing..." },
    secure: { bg: "rgba(167, 139, 250, 0.15)", bgDim: "rgba(167, 139, 250, 0.05)", text: "#a78bfa", defaultLabel: "Verifying..." },
    warning: { bg: "rgba(245, 158, 11, 0.15)", bgDim: "rgba(245, 158, 11, 0.05)", text: "#f59e0b", defaultLabel: "Retrying..." },
};

const FALLBACK_STYLE: StyleConfig = {
    bg: "rgba(255, 255, 255, 0.15)",
    bgDim: "rgba(255, 255, 255, 0.05)",
    text: "#d1d5db",
    defaultLabel: "Loading..."
};

// 3. Main component with optimized rendering
export function LoadingBadge({ variant = 'default', text }: LoadingBadgeProps) {

    // Calculate the active style and display label ONCE per variant/text change
    const { style, displayLabel } = useMemo(() => {
        const activeStyle = LOADING_STYLES[variant] || FALLBACK_STYLE;
        return {
            style: activeStyle,
            displayLabel: text || activeStyle.defaultLabel
        };
    }, [variant, text]);

    return (
        <motion.span
            animate={{ backgroundColor: [style.bg, style.bgDim, style.bg] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: style.text,
                padding: "4px 10px",
                borderRadius: "12px",
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                whiteSpace: "nowrap"
            }}
        >
            {/* Micro-Spinner Block */}
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

            {/* Text Label Block */}
            <motion.span
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            >
                {displayLabel}
            </motion.span>
        </motion.span>
    );
}