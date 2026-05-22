import { useState, useEffect, useCallback } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { useNetwork } from "../contexts/NetworkContext";

type TokenType = "XLM" | "PHPC" | "USDC";

interface UseBalanceResult {
    balance: string;
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export default function useBalance(address?: string, token: TokenType = "PHPC"): UseBalanceResult {
    const { networkConfig, systemConfig } = useNetwork();

    const [balance, setBalance] = useState<string>("0.00");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBalance = useCallback(async () => {
        // If no address is provided or the network context isn't loaded yet, reset to 0.00
        if (!address) {
            setBalance("0.00");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 1. Initialize Horizon Server dynamically based on your NetworkContext
            const serverUrl = systemConfig.horizonUrl || networkConfig.horizonUrl || "https://horizon-testnet.stellar.org";
            const server = new Horizon.Server(serverUrl);

            // 2. Query the Stellar Ledger for the account
            const account = await server.loadAccount(address);

            // 3. Find the specific asset in the account's trustlines
            const targetBalance = account.balances.find((b: any) => {
                // XLM is the native asset
                if (token === "XLM") {
                    return b.asset_type === "native";
                }

                // For stablecoins, we must match BOTH the asset code and your system's trusted issuer
                const targetIssuer = token === "PHPC" ? systemConfig.phpcIssuerAddress : systemConfig.usdcIssuerAddress;
                return b.asset_code === token && b.asset_issuer === targetIssuer;
            });

            // 4. Format the balance if found, otherwise return 0.00
            if (targetBalance) {
                const numericBalance = parseFloat(targetBalance.balance);
                setBalance(numericBalance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }));
            } else {
                setBalance("0.00");
            }
        } catch (err: any) {
            console.error(`Failed to fetch ${token} balance for ${address}:`, err);

            // Handle 404s cleanly (Account not funded/created on ledger yet)
            if (err?.response?.status === 404) {
                setBalance("0.00");
                setError("Account not funded on ledger.");
            } else {
                setError("Network error fetching balance.");
                setBalance("0.00");
            }
        } finally {
            setIsLoading(false);
        }
    }, [address, token, systemConfig.horizonUrl, systemConfig.phpcIssuerAddress, systemConfig.usdcIssuerAddress, networkConfig.horizonUrl]);

    // Automatically fetch when the address, token type, or network changes
    useEffect(() => {
        let isMounted = true;

        if (isMounted) {
            fetchBalance();
        }

        return () => {
            isMounted = false;
        };
    }, [fetchBalance]);

    return { balance, isLoading, error, refetch: fetchBalance };
}