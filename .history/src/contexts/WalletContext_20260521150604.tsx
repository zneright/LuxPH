import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { StellarWalletsKit, Networks as StellarKitNetworks } from '@creit.tech/stellar-wallets-kit';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { Networks } from '@stellar/stellar-sdk';
import { useNetwork } from './NetworkContext';

// ==========================================
// 1. ADAPTER ABSTRACTION INTERFACES
// ==========================================
export type NetworkType = 'PUBLIC' | 'TESTNET' | 'FUTURENET';

export interface WalletAdapter {
    id: string;
    name: string;
    isAvailable(): boolean;
    connect(network?: StellarKitNetworks): Promise<string>;
    disconnect(): Promise<void>;
    signTransaction(xdr: string, networkPassphrase: string): Promise<string>;
}

// ==========================================
// 2. FREIGHTER ADAPTER IMPLEMENTATION
// ==========================================
class FreighterAdapter implements WalletAdapter {
    id = 'freighter';
    name = 'Freighter';

    isAvailable(): boolean {
        if (typeof window === 'undefined') return false;
        return !!(window as any).freighter;
    }

    async connect(): Promise<string> {
        if (!this.isAvailable()) throw new Error('Freighter is not installed.');

        const { requestAccess } = await import('@stellar/freighter-api');
        const access = await requestAccess();

        if (access.error) throw new Error(access.error);
        return access.address;
    }

    async disconnect(): Promise<void> {
        return Promise.resolve();
    }

    async signTransaction(xdr: string, networkPassphrase: string): Promise<string> {
        const { signTransaction } = await import('@stellar/freighter-api');
        const network = networkPassphrase.includes("Public") ? "PUBLIC" : "TESTNET";

        const response = await signTransaction(xdr, { network, networkPassphrase });

        if (!response || response.error) {
            throw new Error(response.error || 'Transaction signing was rejected.');
        }

        return typeof response === 'string'
            ? response
            : (response as any).signedTxXdr || Object.values(response)[0];
    }
}

class StellarWalletsKitAdapter implements WalletAdapter {
    id = 'stellar-wallets-kit';
    name = 'Stellar Wallets Kit';
    private initialized = false;

    private initializeKit(network: StellarKitNetworks = StellarKitNetworks.TESTNET) {
        if (typeof window === 'undefined') return;

        if (!document.getElementById('swk-global-modal-fix')) {
            const style = document.createElement('style');
            style.id = 'swk-global-modal-fix';
            style.innerHTML = `
                stellar-wallets-modal {
                    position: fixed !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    z-index: 2147483647 !important; 
                    margin: 0 !important;
                    bottom: auto !important;
                    right: auto !important;
                }
                stellar-wallets-modal::part(overlay) {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background: rgba(0, 0, 0, 0.65) !important;
                    backdrop-filter: blur(5px) !important;
                    z-index: 2147483646 !important;
                }
            `;
            document.head.appendChild(style);
        }

        const modules = [new AlbedoModule(), new FreighterModule(), new LobstrModule()];

        if (!this.initialized) {
            StellarWalletsKit.init({
                modules,
                network,
                authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
            });
            this.initialized = true;
            return;
        }

        StellarWalletsKit.setNetwork(network);
    }

    isAvailable(): boolean {
        return typeof window !== 'undefined';
    }

    async connect(network: StellarKitNetworks = StellarKitNetworks.TESTNET): Promise<string> {
        this.initializeKit(network);
        const result = await StellarWalletsKit.authModal({ container: document.body });

        if (!result || !result.address) {
            throw new Error('Wallet connection was cancelled or failed.');
        }
        return result.address;
    }

    async disconnect(): Promise<void> {
        if (typeof window === 'undefined') return;
        await StellarWalletsKit.disconnect();
    }

    async signTransaction(xdr: string, networkPassphrase: string): Promise<string> {
        // 🚨 FIX: Wake up the Kit if the user refreshed the page and bypassed the Connect button!
        const network = networkPassphrase.includes("Public") ? StellarKitNetworks.PUBLIC : StellarKitNetworks.TESTNET;
        this.initializeKit(network);

        try {
            const response = await StellarWalletsKit.signTransaction(xdr, { networkPassphrase });

            if (!response) {
                throw new Error('Transaction signing failed or was cancelled.');
            }

            return typeof response === 'string'
                ? response
                : (response as any).signedTxXdr || (response as any).signedTransaction || '';
        } catch (error: any) {
            // 🚨 FIX: Extract WalletConnect unformatted objects so it doesn't crash as [object Object]
            if (error && typeof error === 'object' && !error.message) {
                throw new Error(`Wallet Error: ${JSON.stringify(error)}`);
            }
            throw error;
        }
    }
}

// ==========================================
// 3. REACT CONTEXT PROVIDER
// ==========================================
interface WalletContextType {
    address: string;
    isConnecting: boolean;
    activeAdapterId: string | null;
    availableAdapters: WalletAdapter[];
    connect: (adapterId?: string | any) => Promise<void>;
    disconnect: () => void;
    signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const ADAPTERS: WalletAdapter[] = [
    new StellarWalletsKitAdapter(),
    new FreighterAdapter()
];

export const WalletProvider = ({ children }: { children: ReactNode }) => {
    const { networkConfig } = useNetwork();
    const [address, setAddress] = useState<string>('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [activeAdapterId, setActiveAdapterId] = useState<string | null>(null);

    useEffect(() => {
        const savedAddress = localStorage.getItem('wallet_address');
        const savedAdapter = localStorage.getItem('wallet_adapter');
        if (savedAddress && savedAdapter) {
            setAddress(savedAddress);
            setActiveAdapterId(savedAdapter);
        }
    }, []);

    const getActiveAdapter = (): WalletAdapter | undefined => {
        return ADAPTERS.find(a => a.id === activeAdapterId);
    };

    const connect = async (adapterInput?: string | any) => {
        const targetAdapterId = typeof adapterInput === 'string' ? adapterInput : 'freighter';
        const networkKit = networkConfig.networkPassphrase === Networks.PUBLIC ? StellarKitNetworks.PUBLIC : StellarKitNetworks.TESTNET;

        setIsConnecting(true);
        try {
            const adapter = ADAPTERS.find(a => a.id === targetAdapterId);
            if (!adapter) throw new Error(`Wallet adapter '${targetAdapterId}' not found.`);

            if (!adapter.isAvailable()) {
                throw new Error(`${adapter.name} is not installed on this browser.`);
            }

            const pubKey = await adapter.connect(networkKit);

            setAddress(pubKey);
            setActiveAdapterId(targetAdapterId);

            localStorage.setItem('wallet_address', pubKey);
            localStorage.setItem('wallet_adapter', targetAdapterId);
        } catch (error: any) {
            console.error('Wallet connection failed:', error);
            if (error.message && !error.message.includes('cancelled')) {
                alert(error.message);
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnect = async () => {
        const adapter = getActiveAdapter();
        if (adapter) await adapter.disconnect();

        setAddress('');
        setActiveAdapterId(null);
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('wallet_adapter');
    };

    const signTx = async (xdr: string, networkPassphrase: string): Promise<string> => {
        const adapter = getActiveAdapter();
        if (!adapter || !address) throw new Error('No active wallet session. Please disconnect and reconnect your app.');

        return await adapter.signTransaction(xdr, networkPassphrase);
    };

    return (
        <WalletContext.Provider value={{
            address,
            isConnecting,
            activeAdapterId,
            availableAdapters: ADAPTERS,
            connect,
            disconnect,
            signTx
        }}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => {
    const context = useContext(WalletContext);
    if (!context) throw new Error('useWallet must be used within a WalletProvider');
    return context;
};