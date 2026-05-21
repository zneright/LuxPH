import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { buildStellarNetworkConfig, DEFAULT_STELLAR_NETWORK_CONFIG, type StellarNetworkConfig, type StellarRuntimeEnvironment } from "../config/stellarNetwork";

export interface SystemConfigData {
    freeTierMonthlyCap: number;
    proTierMonthlyFee: number;
    invoiceExpiryDefault: string;
    phpcIssuerAddress: string;
    usdcIssuerAddress: string;
    pdaxAnchorUrl: string;
    pdaxAnchorAddress: string;
    stellarNetwork: StellarRuntimeEnvironment;
    horizonUrl?: string;
    sorobanRpcUrl?: string;
    sorobanContractId?: string;
}

export interface NetworkContextValue {
    networkConfig: StellarNetworkConfig;
    systemConfig: SystemConfigData;
    isLoading: boolean;
}

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
    const [networkConfig, setNetworkConfig] = useState<StellarNetworkConfig>(DEFAULT_STELLAR_NETWORK_CONFIG);
    const [systemConfig, setSystemConfig] = useState<SystemConfigData>({
        freeTierMonthlyCap: 100000,
        proTierMonthlyFee: 499,
        invoiceExpiryDefault: "24 hours",
        phpcIssuerAddress: "GBSTRH776KCSX6NRE4LHYOM3E5O6F4PC01MAINNETISSUER",
        usdcIssuerAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        pdaxAnchorUrl: "https://anchor.pdax.ph",
        pdaxAnchorAddress: "GDZRE7N6PHB6CCM3VBRB5V7SDRB6CS4U6MTUL6Q6OMJEXHUTVPHPC001",
        stellarNetwork: DEFAULT_STELLAR_NETWORK_CONFIG.stellarNetwork,
        sorobanContractId: "",
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initializeConfig = async () => {
            try {
                const configSnap = await getDoc(doc(db, "system_config", "global"));
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    const activeNetwork: StellarRuntimeEnvironment = data.stellarNetwork === "Mainnet (Public)" ? "Mainnet (Public)" : "Testnet (Futurenet)";
                    const normalizedConfig: SystemConfigData = {
                        freeTierMonthlyCap: data.freeTierMonthlyCap ?? 100000,
                        proTierMonthlyFee: data.proTierMonthlyFee ?? 499,
                        invoiceExpiryDefault: data.invoiceExpiryDefault ?? "24 hours",
                        phpcIssuerAddress: data.phpcIssuerAddress ?? "GBSTRH776KCSX6NRE4LHYOM3E5O6F4PC01MAINNETISSUER",
                        usdcIssuerAddress: data.usdcIssuerAddress ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
                        pdaxAnchorUrl: data.pdaxAnchorUrl ?? "https://anchor.pdax.ph",
                        pdaxAnchorAddress: data.pdaxAnchorAddress ?? "GDZRE7N6PHB6CCM3VBRB5V7SDRB6CS4U6MTUL6Q6OMJEXHUTVPHPC001",
                        stellarNetwork: activeNetwork,
                        horizonUrl: data.horizonUrl,
                        sorobanRpcUrl: data.sorobanRpcUrl,
                        sorobanContractId: data.sorobanContractId ?? "",
                    };

                    setSystemConfig(normalizedConfig);
                    setNetworkConfig(buildStellarNetworkConfig({
                        stellarNetwork: normalizedConfig.stellarNetwork,
                        horizonUrl: normalizedConfig.horizonUrl,
                        sorobanRpcUrl: normalizedConfig.sorobanRpcUrl,
                    }));
                } else {
                    setSystemConfig({
                        freeTierMonthlyCap: 100000,
                        proTierMonthlyFee: 499,
                        invoiceExpiryDefault: "24 hours",
                        phpcIssuerAddress: "GBSTRH776KCSX6NRE4LHYOM3E5O6F4PC01MAINNETISSUER",
                        usdcIssuerAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
                        pdaxAnchorUrl: "https://anchor.pdax.ph",
                        pdaxAnchorAddress: "GDZRE7N6PHB6CCM3VBRB5V7SDRB6CS4U6MTUL6Q6OMJEXHUTVPHPC001",
                        stellarNetwork: DEFAULT_STELLAR_NETWORK_CONFIG.stellarNetwork,
                        sorobanContractId: "",
                    });
                    setNetworkConfig(DEFAULT_STELLAR_NETWORK_CONFIG);
                }
            } catch (error) {
                console.error("NETWORK_CONFIG_LOAD_FAILURE:", error);
                setSystemConfig({
                    freeTierMonthlyCap: 100000,
                    proTierMonthlyFee: 499,
                    invoiceExpiryDefault: "24 hours",
                    phpcIssuerAddress: "GBSTRH776KCSX6NRE4LHYOM3E5O6F4PC01MAINNETISSUER",
                    usdcIssuerAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
                    pdaxAnchorUrl: "https://anchor.pdax.ph",
                    pdaxAnchorAddress: "GDZRE7N6PHB6CCM3VBRB5V7SDRB6CS4U6MTUL6Q6OMJEXHUTVPHPC001",
                    stellarNetwork: DEFAULT_STELLAR_NETWORK_CONFIG.stellarNetwork,
                    sorobanContractId: "",
                });
                setNetworkConfig(DEFAULT_STELLAR_NETWORK_CONFIG);
            } finally {
                setIsLoading(false);
            }
        };

        initializeConfig();
    }, []);

    return (
        <NetworkContext.Provider value={{ networkConfig, systemConfig, isLoading }}>
            {children}
        </NetworkContext.Provider>
    );
};

export const useNetwork = () => {
    const context = useContext(NetworkContext);
    if (!context) throw new Error("useNetwork must be used within a NetworkProvider");
    return context;
};
