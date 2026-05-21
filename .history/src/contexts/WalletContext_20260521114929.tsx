import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { StellarWalletsKit, Networks as StellarKitNetworks } from '@creit.tech/stellar-wallets-kit';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { WalletConnectModule } from '@creit.tech/stellar-wallets-kit/modules/wallet-connect';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';

// ==========================================
// 1. ADAPTER ABSTRACTION INTERFACES
// ==========================================
export type NetworkType = 'PUBLIC' | 'TESTNET' | 'FUTURENET';

export interface WalletAdapter {
    id: string;
    name: string;
    isAvailable(): boolean;
    connect(): Promise<string>;
    disconnect(): Promise<void>;
    signTransaction(xdr: string, networkPassphrase: string): Promise<string>;
}

// ==========================================
// 2. FREIGHTER ADAPTER IMPLEMENTATION
// ==========================================
class FreighterAdapter implements WalletAdapter {
    id = 'freighter';
    name = 'Freighter';

    // Safe SSR check
    isAvailable(): boolean {
        if (typeof window === 'undefined') return false;
        return !!(window as any).freighter;
    }

    async connect(): Promise<string> {
        if (!this.isAvailable()) throw new Error('Freighter is not installed.');

        // Dynamic import strictly prevents SSR compile crashes
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

        const response = await signTransaction(xdr, {
            network,
            networkPassphrase,
        });

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

    private initializeKit() {
        if (this.initialized || typeof window === 'undefined') {
            return;
        }

        StellarWalletsKit.init({
            modules: [
                new AlbedoModule(),
                new FreighterModule(),
                new WalletConnectModule(),
                new LOBSTRModule(),
            ],
            network: StellarKitNetworks.TESTNET,
            authModal: {
                showInstallLabel: true,
                hideUnsupportedWallets: false,
            },
        });

        this.initialized = true;
    }

    isAvailable(): boolean {
        return typeof window !== 'undefined';
    }

    async connect(): Promise<string> {
        this.initializeKit();

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
        const response = await StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase,
        });

        if (!response) {
            throw new Error('Transaction signing failed.');
        }

        return typeof response === 'string'
            ? response
            : (response as any).signedTxXdr || (response as any).signedTransaction || '';
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

// Register available wallet engines here
const ADAPTERS: WalletAdapter[] = [
    new StellarWalletsKitAdapter(),
    new FreighterAdapter()
];

export const WalletProvider = ({ children }: { children: ReactNode }) => {
    const [address, setAddress] = useState<string>('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [activeAdapterId, setActiveAdapterId] = useState<string | null>(null);

    // Auto-reconnect session logic
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

    // 🔥 FIX: Check if the argument is a valid string; if it's an event object, default to 'freighter'
    const connect = async (adapterInput?: string | any) => {
        const targetAdapterId = typeof adapterInput === 'string' ? adapterInput : 'freighter';

        setIsConnecting(true);
        try {
            const adapter = ADAPTERS.find(a => a.id === targetAdapterId);
            if (!adapter) throw new Error(`Wallet adapter '${targetAdapterId}' not found.`);

            if (!adapter.isAvailable()) {
                throw new Error(`${adapter.name} is not installed on this browser.`);
            }

            const pubKey = await adapter.connect();

            setAddress(pubKey);
            setActiveAdapterId(targetAdapterId);

            // Persist session
            localStorage.setItem('wallet_address', pubKey);
            localStorage.setItem('wallet_adapter', targetAdapterId);
        } catch (error: any) {
            console.error('Wallet connection failed:', error);
            alert(error.message); // Inform the user
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
        if (!adapter || !address) throw new Error('No active wallet session.');

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