import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

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

// Light Mode UI Overhaul
const LOADING_STYLES: Record<string, StyleConfig> = {
    default: { bg: "#e0e7ff", bgDim: "#eef2ff", text: "#4f46e5", defaultLabel: "Processing..." }, // Clean Indigo
    network: { bg: "#e0f2fe", bgDim: "#f0f9ff", text: "#0284c7", defaultLabel: "Syncing..." }, // Clean Sky
    secure: { bg: "#f3e8ff", bgDim: "#faf5ff", text: "#7e22ce", defaultLabel: "Verifying..." }, // Clean Purple
    warning: { bg: "#fef3c7", bgDim: "#fffbeb", text: "#d97706", defaultLabel: "Retrying..." }, // Clean Amber
};

const FALLBACK_STYLE: StyleConfig = {
    bg: "#f3f4f6",
    bgDim: "#f9fafb",
    text: "#4b5563",
    defaultLabel: "Loading..."
};

export function LoadingBadge({ variant = 'default', text }: LoadingBadgeProps) {

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
                whiteSpace: "nowrap",
                border: `1px solid ${style.bg}`
            }}
        >
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
            <motion.span
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            >
                {displayLabel}
            </motion.span>
        </motion.span>
    );
}