
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
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>
                    Monthly Volume {projectedUsage > monthlyUsage && !isSubscribed && <span style={{ color: isOverLimit ? "#ef4444" : "#fcd34d" }}>(Projected)</span>}
                </span>
                <span style={{ fontSize: 13, color: isSubscribed ? "#10b981" : (isOverLimit ? "#ef4444" : "#a78bfa"), fontWeight: 700 }}>
                    {isSubscribed
                        ? "Unlimited (Subscribed)"
                        : `${effectiveUsage.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} / ${activeLimit.toLocaleString()} PHP`}
                </span>
            </div>

            {!isSubscribed && (
                <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,.06)", borderRadius: 4, overflow: "hidden", display: "flex" }}>

                    <div
                        style={{
                            width: `${basePercentage}%`,
                            height: "100%",
                            background: isOverLimit ? "#ef4444" : "linear-gradient(90deg, #7c3aed, #a78bfa)",
                            transition: "width 0.3s ease, background 0.3s ease"
                        }}
                    />

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