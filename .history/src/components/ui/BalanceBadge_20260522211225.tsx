import React from "react";
import useBalance from "../../hooks/useBalance";

export const BalanceBadge = ({ address, token = "PHPC" }: { address?: string; token?: "XLM" | "PHPC" | "USDC" }) => {
    const { balance, isLoading } = useBalance(address, token);

    return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 999, fontSize: 13 }}>
            <strong style={{ color: "#10b981", fontFamily: "'DM Mono',monospace" }}>{token}</strong>
            <span style={{ color: "#e5e7eb", fontWeight: 700 }}>{isLoading ? "..." : balance}</span>
        </div>
    );
};

export default BalanceBadge;
