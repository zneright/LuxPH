import React from "react";

// 1. Define the props the component expects to receive
interface MonthlyUsageCardProps {
    monthlyUsage: number;
    isSubscribed: boolean;
    usageLimit?: number; // Defaults to 5000
    projectedUsage?: number; // NEW: Tracks the active input amount
}

export default function MonthlyUsageCard({
    monthlyUsage,
    isSubscribed,
    usageLimit = 5000,
    projectedUsage = 0
}: MonthlyUsageCardProps) {

    // 2. Calculate the UI states based on the effective usage
    const effectiveUsage = projectedUsage > monthlyUsage ? projectedUsage : monthlyUsage;
    const isOverLimit = effectiveUsage > usageLimit;

    // Calculate percentages for the stacked progress bar
    const basePercentage = Math.min((monthlyUsage / usageLimit) * 100, 100);
    const projectedPercentage = projectedUsage > monthlyUsage
        ? Math.min(((projectedUsage - monthlyUsage) / usageLimit) * 100, 100)
        : 0;

    return (
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>
                    Monthly Volume {projectedUsage > monthlyUsage && !isSubscribed && <span style={{ color: isOverLimit ? "#ef4444" : "#fcd34d" }}>(Projected)</span>}
                </span>
                <span style={{ fontSize: 13, color: isSubscribed ? "#10b981" : (isOverLimit ? "#ef4444" : "#a78bfa"), fontWeight: 700 }}>
                    {isSubscribed
                        ? "Unlimited (Subscribed)"
                        : `${effectiveUsage.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} / ${usageLimit.toLocaleString()} PHP`}
                </span>
            </div>

            {!isSubscribed && (
                <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,.06)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    {/* Base Usage Bar */}
                    <div
                        style={{
                            width: `${basePercentage}%`,
                            height: "100%",
                            background: isOverLimit ? "#ef4444" : "linear-gradient(90deg, #7c3aed, #a78bfa)",
                            transition: "width 0.3s ease, background 0.3s ease"
                        }}
                    />
                    {/* Projected Usage Ghost Bar */}
                    {projectedPercentage > 0 && (
                        <div
                            style={{
                                width: `${projectedPercentage}%`,
                                height: "100%",
                                background: isOverLimit ? "#ef4444" : "#fcd34d",
                                opacity: isOverLimit ? 1 : 0.6,
                                transition: "width 0.3s ease, background 0.3s ease"
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
}