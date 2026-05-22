import { useEffect, useState } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { useNetwork } from "../contexts/NetworkContext";

export function useBalance(address?: string, token: "XLM" | "PHPC" | "USDC" = "PHPC") {
    const { networkConfig, systemConfig } = useNetwork();
    const [balance, setBalance] = useState<string>("0.00");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!address) return;
        let cancelled = false;
        const fetchBalance = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const server = new Horizon.Server(networkConfig.horizonUrl);
                const account = await server.loadAccount(address);

                const balanceObj = account.balances.find((b: any) => {
                    if (token === "XLM") return b.asset_type === "native";
                    const targetIssuer = token === "PHPC" ? systemConfig.phpcIssuerAddress : systemConfig.usdcIssuerAddress;
                    return b.asset_code === token && b.asset_issuer === targetIssuer;
                });

                if (!cancelled) setBalance(balanceObj ? parseFloat(balanceObj.balance).toLocaleString() : "0.00");
            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Failed to fetch balance");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        fetchBalance();

        return () => {
            cancelled = true;
        };
    }, [address, token, networkConfig.horizonUrl, systemConfig.phpcIssuerAddress, systemConfig.usdcIssuerAddress]);

    return { balance, isLoading, error };
}

export default useBalance;
