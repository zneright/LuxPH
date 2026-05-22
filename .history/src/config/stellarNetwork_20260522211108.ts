import { Networks } from "@stellar/stellar-sdk";

export type StellarRuntimeEnvironment = "Testnet (Futurenet)" | "Mainnet (Public)";

export interface StellarNetworkConfig {
    stellarNetwork: StellarRuntimeEnvironment;
    networkPassphrase: string;
    horizonUrl: string;
    sorobanRpcUrl: string;
    explorerTxUrl: string;
}

export const STELLAR_ENVIRONMENTS = {
    TESTNET: "Testnet (Futurenet)" as StellarRuntimeEnvironment,
    MAINNET: "Mainnet (Public)" as StellarRuntimeEnvironment,
};

export const DEFAULT_STELLAR_NETWORK_CONFIG: StellarNetworkConfig = {
    stellarNetwork: STELLAR_ENVIRONMENTS.TESTNET,
    networkPassphrase: Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://rpc-futurenet.stellar.org",
    explorerTxUrl: "https://stellar.expert/explorer/testnet/tx/",
};

export function buildStellarNetworkConfig(config?: Partial<StellarNetworkConfig>): StellarNetworkConfig {
    const environment = config?.stellarNetwork || DEFAULT_STELLAR_NETWORK_CONFIG.stellarNetwork;
    const isTestnet = environment.includes("Testnet");
    const baseConfig: StellarNetworkConfig = {
        stellarNetwork: environment as StellarRuntimeEnvironment,
        networkPassphrase: isTestnet ? Networks.TESTNET : Networks.PUBLIC,
        horizonUrl: isTestnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org",
        sorobanRpcUrl: isTestnet ? "https://rpc-futurenet.stellar.org" : "https://soroban-rpc.stellar.org",
        explorerTxUrl: isTestnet ? "https://stellar.expert/explorer/testnet/tx/" : "https://stellar.expert/explorer/public/tx/",
    };

    const ensureProtocol = (u?: string, fallback?: string) => {
        const raw = u || fallback || "";
        if (!raw) return raw;
        if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
        return `https://${raw}`;
    };

    return {
        ...baseConfig,
        horizonUrl: ensureProtocol(config?.horizonUrl, baseConfig.horizonUrl),
        sorobanRpcUrl: ensureProtocol(config?.sorobanRpcUrl, baseConfig.sorobanRpcUrl),
        explorerTxUrl: ensureProtocol(config?.explorerTxUrl, baseConfig.explorerTxUrl),
    };
}
