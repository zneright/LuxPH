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
        <div style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 20,
            padding: "24px",
            marginBottom: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            position: "relative",
            overflow: "hidden"
        }}>

            {/* Ultra-Premium CSS Animations Engine */}
            <style>{`
                @keyframes auroraMove {
                    0% { background-position: 0% 50%; filter: hue-rotate(0deg); }
                    50% { background-position: 100% 50%; filter: hue-rotate(15deg); }
                    100% { background-position: 0% 50%; filter: hue-rotate(0deg); }
                }
                @keyframes particleOrbit {
                    0% { transform: rotate(0deg) translateX(40px) rotate(0deg); opacity: 1; }
                    50% { opacity: 0.4; }
                    100% { transform: rotate(360deg) translateX(40px) rotate(-360deg); opacity: 1; }
                }
                @keyframes pulseSoft {
                    0%, 100% { transform: scale(1); opacity: 0.5; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
                    50% { transform: scale(1.05); opacity: 0.9; box-shadow: 0 0 15px 4px rgba(16, 185, 129, 0.2); }
                }
                @keyframes progressShimmer {
                    0% { background-position: 0% 0%; }
                    100% { background-position: 200% 0%; }
                }

                /* Container optimization for mobile layout snapping */
                .usage-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 16px;
                    flex-wrap: wrap;
                }
                @media (max-width: 480px) {
                    .usage-header-row {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 12px;
                    }
                    .pro-badge-container, .free-badge-container {
                        align-self: flex-start;
                    }
                }

                /* Advanced Pro Badge Architecture */
                .pro-badge-container {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 6px 14px;
                    border-radius: 99px;
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%);
                    border: 1px solid rgba(52, 211, 153, 0.3);
                    overflow: visible;
                    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.15);
                }
                /* Ambient Glow Behind Badge */
                .pro-badge-container::before {
                    content: '';
                    position: absolute;
                    inset: -2px;
                    border-radius: 99px;
                    background: linear-gradient(90deg, #10b981, #34d399, #059669, #10b981);
                    background-size: 300% 300%;
                    animation: auroraMove 6s linear infinite;
                    z-index: -1;
                    opacity: 0.4;
                    filter: blur(4px);
                }
                /* Idle Moving Magic Particle */
                .pro-particle {
                    position: absolute;
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: #34d399;
                    box-shadow: 0 0 8px 2px #10b981;
                    animation: particleOrbit 3.5s linear infinite;
                    pointer-events: none;
                }
            `}</style>

            {/* Top Row: Info label and interactive badge */}
            <div className="usage-header-row">
                <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: ".08em" }}>
                    Monthly Volume {projectedUsage > monthlyUsage && !isSubscribed && <span style={{ color: isOverLimit ? "#f87171" : "#fbbf24" }}>(Projected)</span>}
                </span>

                {isSubscribed ? (
                    /* THE ULTIMATE IDLE-MOVING PRO BADGE */
                    <div className="pro-badge-container">
                        <div className="pro-particle" />
                        <span style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: "#34d399",
                            marginRight: 8,
                            animation: "pulseSoft 2s infinite"
                        }} />
                        <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: "#e6fffa",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            textShadow: "0 2px 4px rgba(0,0,0,0.2)"
                        }}>
                            PRO MEMBER
                        </span>
                    </div>
                ) : (
                    /* CRISP RE-DESIGNED STANDARD STATUS TIER */
                    <div className="free-badge-container" style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "5px 12px",
                        borderRadius: 99,
                        background: isOverLimit ? "rgba(239, 68, 68, 0.08)" : "rgba(255, 255, 255, 0.03)",
                        border: isOverLimit ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(255, 255, 255, 0.08)"
                    }}>
                        <span style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            backgroundColor: isOverLimit ? "#ef4444" : "#9ca3af",
                            marginRight: 6,
                            opacity: 0.8
                        }} />
                        <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: isOverLimit ? "#f87171" : "#9ca3af",
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
                <span style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.03em", fontFamily: "system-ui, sans-serif" }}>
                    {isSubscribed
                        ? "Unlimited Volume"
                        : `${effectiveUsage.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} PHP`
                    }
                </span>
                {!isSubscribed && (
                    <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "'DM Mono', monospace", letterSpacing: "-0.01em" }}>
                        allocated cap: <span style={{ color: "#9ca3af" }}>{activeLimit.toLocaleString()} PHP</span>
                    </span>
                )}
            </div>

            {/* Micro-engineered Interactive Loading & Projection Bars */}
            {!isSubscribed && (
                <div style={{
                    width: "100%",
                    height: 8,
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 99,
                    overflow: "hidden",
                    display: "flex",
                    border: "1px solid rgba(255,255,255,0.02)"
                }}>
                    {/* Spent Usage Strip */}
                    <div
                        style={{
                            width: `${basePercentage}%`,
                            height: "100%",
                            background: isOverLimit ? "#ef4444" : "linear-gradient(90deg, #4f46e5, #818cf8)",
                            borderRadius: projectedPercentage > 0 ? "99px 0 0 99px" : "99px",
                            transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
                        }}
                    />

                    {/* Warning / Projected Usage Strip */}
                    {projectedPercentage > 0 && (
                        <div
                            style={{
                                width: `${projectedPercentage}%`,
                                height: "100%",
                                background: isOverLimit
                                    ? "repeating-linear-gradient(45deg, #ef4444, #ef4444 6px, #b91c1c 6px, #b91c1c 12px)"
                                    : "repeating-linear-gradient(45deg, #fbbf24, #fbbf24 6px, #d97706 6px, #d97706 12px)",
                                backgroundSize: "200% 200%",
                                animation: "progressShimmer 3s linear infinite",
                                opacity: isOverLimit ? 1 : 0.85,
                                borderRadius: "0 99px 99px 0",
                                transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
}