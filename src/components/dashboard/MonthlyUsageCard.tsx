import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";

interface MonthlyUsageCardProps {
    monthlyUsage: number;
    isSubscribed: boolean;
    usageLimit?: number;
    projectedUsage?: number;
}

export default function MonthlyUsageCard({
    monthlyUsage,
    isSubscribed,
    usageLimit,
    projectedUsage = 0
}: MonthlyUsageCardProps) {

    const [globalLimit, setGlobalLimit] = useState<number>(100000);

    useEffect(() => {
        const fetchGlobalLimit = async () => {
            try {
                const configSnap = await getDoc(doc(db, "system_config", "global"));
                if (configSnap.exists()) {
                    const configData = configSnap.data();
                    if (configData.freeTierMonthlyCap) {
                        setGlobalLimit(configData.freeTierMonthlyCap);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch global usage limit:", error);
            }
        };

        if (usageLimit === undefined) {
            fetchGlobalLimit();
        }
    }, [usageLimit]);

    const activeLimit = usageLimit !== undefined ? usageLimit : globalLimit;
    const effectiveUsage = projectedUsage > monthlyUsage ? projectedUsage : monthlyUsage;
    const isOverLimit = effectiveUsage > activeLimit;

    const basePercentage = Math.min((monthlyUsage / activeLimit) * 100, 100);
    const projectedPercentage = projectedUsage > monthlyUsage
        ? Math.min(((projectedUsage - monthlyUsage) / activeLimit) * 100, 100)
        : 0;

    return (
        <div className={`premium-usage-card ${isSubscribed ? "pro-tier-active" : "standard-tier-active"}`}>

            {/* 🚀 HIGH-END FINTECH ANIMATIONS ENGINE v2 */}
            <style>{`
                /* Base Card Layout & Entrance */
                @keyframes slideUpFade {
                    0% { opacity: 0; transform: translateY(16px) scale(0.98); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }

                .premium-usage-card {
                    border-radius: 24px;
                    padding: 32px 28px;
                    margin-bottom: 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                    animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }

                /* ⚪️ STANDARD TIER: Clean, crisp, subtle shadows */
                .standard-tier-active {
                    background: #ffffff;
                    border: 1px solid #f3f4f6;
                    box-shadow: 0 4px 20px -4px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02);
                }
                .standard-tier-active:hover {
                    box-shadow: 0 12px 30px -8px rgba(0,0,0,0.08);
                    transform: translateY(-2px);
                    border-color: #e5e7eb;
                }

                /* ✨ PRO TIER: Refined Holographic Apple Card Effect */
                .pro-tier-active {
                    background: linear-gradient(105deg, #ffffff 0%, #f0fdf4 25%, #fef3c7 50%, #ffffff 75%, #f0fdf4 100%);
                    background-size: 250% 250%;
                    animation: premiumShimmer 12s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                    border: 1px solid rgba(16, 185, 129, 0.15);
                    box-shadow: 0 10px 35px -5px rgba(16, 185, 129, 0.12), inset 0 0 30px rgba(255,255,255,0.9);
                }
                .pro-tier-active:hover {
                    transform: translateY(-2px) scale(1.01);
                    box-shadow: 0 15px 45px -5px rgba(16, 185, 129, 0.2), inset 0 0 30px rgba(255,255,255,1);
                }
                
                @keyframes premiumShimmer {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }

                /* PRO Liquid Text - Softer, more luxurious gradient */
                .liquid-gold-text {
                    background: linear-gradient(to right, #065f46 0%, #10b981 30%, #d97706 50%, #10b981 70%, #065f46 100%);
                    background-size: 200% auto;
                    color: transparent;
                    -webkit-background-clip: text;
                    background-clip: text;
                    animation: textFlow 6s linear infinite;
                }
                @keyframes textFlow {
                    to { background-position: 200% center; }
                }

                /* PRO Floating Star - Smoother breathing animation */
                .sparkle-icon {
                    animation: sparkleFloat 3s ease-in-out infinite;
                    display: inline-block;
                    margin-right: 6px;
                    transform-origin: center;
                }
                @keyframes sparkleFloat {
                    0%, 100% { transform: scale(1) translateY(0); opacity: 0.8; }
                    50% { transform: scale(1.15) translateY(-2px); opacity: 1; filter: drop-shadow(0 0 6px rgba(252, 211, 77, 0.6)); }
                }

                /* Layout */
                .usage-header-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
                @media (max-width: 480px) {
                    .usage-header-row { flex-direction: column; align-items: flex-start; gap: 12px; }
                }

                /* PRO BADGE: Frosted Glass */
                .pro-badge-pill {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 6px 14px;
                    border-radius: 99px;
                    background: rgba(255, 255, 255, 0.8);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    backdrop-filter: blur(12px);
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.08);
                    transition: all 0.3s ease;
                }
                .pro-badge-pill:hover {
                    background: rgba(255, 255, 255, 0.95);
                    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.15);
                }

                /* FREE BADGE */
                .standard-badge-pill {
                    display: inline-flex;
                    align-items: center;
                    padding: 6px 12px;
                    border-radius: 99px;
                    transition: all 0.3s ease;
                    font-weight: 700;
                }

                /* Progress Bar - Soft glow pulse instead of harsh scrolling */
                .data-stream-bar {
                    background: #4f46e5;
                    position: relative;
                    overflow: hidden;
                }
                .data-stream-bar::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%);
                    animation: shimmerSweep 2.5s infinite;
                }

                .data-stream-warning {
                    background: #ef4444;
                    position: relative;
                    overflow: hidden;
                    animation: warningPulse 2s infinite alternate;
                }

                @keyframes shimmerSweep {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes warningPulse {
                    0% { opacity: 0.8; }
                    100% { opacity: 1; box-shadow: 0 0 8px rgba(239, 68, 68, 0.6); }
                }

                /* Diagonal scrolling caution tape - softened colors */
                .caution-tape-scroll {
                    background-size: 28px 28px !important;
                    animation: tapeScroll 1.5s linear infinite !important;
                }
                @keyframes tapeScroll {
                    0% { background-position: 0 0; }
                    100% { background-position: 28px 0; }
                }
            `}</style>

            {/* Top Row: Info label and interactive badge */}
            <div className="usage-header-row">
                <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>
                    Monthly Volume {projectedUsage > monthlyUsage && !isSubscribed && <span style={{ color: isOverLimit ? "#ef4444" : "#f59e0b", transition: "color 0.3s" }}>(Projected)</span>}
                </span>

                {isSubscribed ? (
                    <div className="pro-badge-pill">
                        <span className="sparkle-icon">✨</span>
                        <span style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#047857",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                        }}>
                            PRO MEMBER
                        </span>
                    </div>
                ) : (
                    <div className="standard-badge-pill" style={{
                        background: isOverLimit ? "#fef2f2" : "#f3f4f6",
                        border: isOverLimit ? "1px solid #fca5a5" : "1px solid #e5e7eb"
                    }}>
                        <span style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: isOverLimit ? "#ef4444" : "#9ca3af",
                            marginRight: 8,
                            boxShadow: isOverLimit ? "0 0 6px rgba(239,68,68,0.5)" : "none",
                            transition: "all 0.3s"
                        }} />
                        <span style={{
                            fontSize: 11,
                            color: isOverLimit ? "#dc2626" : "#4b5563",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            letterSpacing: "0.04em"
                        }}>
                            {isOverLimit ? "OVER CAP" : "SANDBOX TIER"}
                        </span>
                    </div>
                )}
            </div>

            {/* Metrics Layout Block */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className={isSubscribed ? "liquid-gold-text" : ""} style={{ fontSize: 36, fontWeight: 800, color: "#111827", letterSpacing: "-0.04em", fontFamily: "system-ui, sans-serif" }}>
                    {isSubscribed
                        ? "Unlimited Volume"
                        : `₱ ${effectiveUsage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    }
                </span>
                {!isSubscribed && (
                    <span style={{ fontSize: 13, color: "#6b7280", fontFamily: "'DM Mono', monospace", letterSpacing: "-0.01em", fontWeight: 500 }}>
                        ALLOCATED CAP: <span style={{ color: "#111827", fontWeight: 700 }}>₱ {activeLimit.toLocaleString()}</span>
                    </span>
                )}
            </div>

            {/* 🚀 Sleek Animated Progress Bars for Free Tier */}
            {!isSubscribed && (
                <div style={{
                    width: "100%",
                    height: 8,
                    background: "#f3f4f6",
                    borderRadius: 99,
                    overflow: "hidden",
                    display: "flex",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
                    marginTop: 4
                }}>
                    {/* Spent Usage Strip (Smooth Light Sweep) */}
                    <div
                        className={isOverLimit ? "data-stream-warning" : "data-stream-bar"}
                        style={{
                            width: `${basePercentage}%`,
                            height: "100%",
                            borderRadius: projectedPercentage > 0 ? "99px 0 0 99px" : "99px",
                            transition: "width 1s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.5s"
                        }}
                    />

                    {/* Projected Usage Strip (Softened Scrolling Caution Tape) */}
                    {projectedPercentage > 0 && (
                        <div
                            className="caution-tape-scroll"
                            style={{
                                width: `${projectedPercentage}%`,
                                height: "100%",
                                background: isOverLimit
                                    ? "repeating-linear-gradient(45deg, #ef4444, #ef4444 8px, #dc2626 8px, #dc2626 16px)"
                                    : "repeating-linear-gradient(45deg, #fbbf24, #fbbf24 8px, #f59e0b 8px, #f59e0b 16px)",
                                opacity: 0.9,
                                borderRadius: "0 99px 99px 0",
                                transition: "width 1s cubic-bezier(0.16, 1, 0.3, 1)"
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
}