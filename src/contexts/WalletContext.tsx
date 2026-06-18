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
    // 🚀 NEW: We now return the exact wallet NAME alongside the address!
    connect(network?: StellarKitNetworks): Promise<{ address: string; name: string }>;
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

    async connect(): Promise<{ address: string; name: string }> {
        if (!this.isAvailable()) throw new Error('Freighter is not installed.');

        const { requestAccess } = await import('@stellar/freighter-api');
        const access = await requestAccess();

        if (access.error) throw new Error(access.error);
        return { address: access.address, name: "freighter" }; // Identifies as freighter
    }

    async disconnect(): Promise<void> {
        return Promise.resolve();
    }

    async signTransaction(xdr: string, networkPassphrase: string): Promise<string> {
        const network = networkPassphrase.includes("Public") ? StellarKitNetworks.PUBLIC : StellarKitNetworks.TESTNET;
        this.initializeKit(network);

        try {
            const response = await StellarWalletsKit.signTransaction(xdr, { networkPassphrase });

            if (!response) throw new Error('Transaction signing failed or was cancelled.');

            return typeof response === 'string'
                ? response
                : (response as any).signedTxXdr || (response as any).signedTransaction || '';
        } catch (error: any) {
            if (error?.message === 'The connection key is missing' || error?.code === -1) {
                throw new Error("Your secure wallet session expired after a page refresh. Please Disconnect and Reconnect your wallet to continue.");
            }
            if (error && typeof error === 'object' && !error.message) {
                throw new Error(`Wallet Error: ${JSON.stringify(error)}`);
            }
            throw error;
        }
    }

    // Helper for waking up the kit (reusing SWK logic internally if needed)
    private initializeKit(network: StellarKitNetworks) {
        if (!document.getElementById('swk-global-modal-fix')) {
            const style = document.createElement('style');
            style.id = 'swk-global-modal-fix';
            style.innerHTML = `#stellar-wallets-kit-modal-root { display: none; }`;
            document.head.appendChild(style);
        }
        StellarWalletsKit.init({ modules: [new FreighterModule()], network, authModal: { showInstallLabel: true, hideUnsupportedWallets: false } });
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

            // 🚀 LIGHT MODE NUCLEAR UI FIX FOR THE MODAL 🚀
            style.innerHTML = `
                /* Absolute top layer containment */
                #stellar-wallets-kit-modal-root {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    z-index: 9999999 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    pointer-events: none !important;
                }

                /* Center the Web Component */
                stellar-wallets-modal {
                    position: relative !important;
                    top: auto !important;
                    left: auto !important;
                    transform: none !important;
                    z-index: 10000000 !important;
                    pointer-events: auto !important;
                }

                /* Dark blur overlay to make the Light Mode app fade out behind it */
                stellar-wallets-modal::part(overlay) {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background: rgba(0, 0, 0, 0.4) !important;
                    backdrop-filter: blur(6px) !important;
                }

                /* Mobile Bottom Sheet Override */
                @media (max-width: 768px) {
                    #stellar-wallets-kit-modal-root {
                        align-items: flex-end !important;
                        padding-bottom: env(safe-area-inset-bottom) !important;
                    }
                    stellar-wallets-modal {
                        width: 100% !important;
                        max-width: 100vw !important;
                        margin: 0 !important;
                        border-bottom-left-radius: 0 !important;
                        border-bottom-right-radius: 0 !important;
                    }
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

    async connect(network: StellarKitNetworks = StellarKitNetworks.TESTNET): Promise<{ address: string; name: string }> {
        this.initializeKit(network);
        const result: any = await StellarWalletsKit.authModal({ container: document.body });

        if (!result || !result.address) {
            throw new Error('Wallet connection was cancelled or failed.');
        }

        // 🚀 THE WALLET SNIFFER: Extracts the exact app picked in the modal!
        let actualWalletName = 'Secured Wallet';

        // Method A: The kit returned the ID directly in the payload
        if (result.walletId) actualWalletName = result.walletId;
        else if (result.wallet) actualWalletName = result.wallet;
        else if (result.id) actualWalletName = result.id;
        else if (result.name) actualWalletName = result.name;

        // Method B: Fallback to sniffing LocalStorage where SWK saves the session
        if (actualWalletName === 'Secured Wallet') {
            try {
                const lsWallet = localStorage.getItem('stellarWalletsKit');
                const lsSwk = localStorage.getItem('swk:active-wallet'); // Newer version key

                const activeLs = lsSwk || lsWallet;
                if (activeLs) {
                    if (activeLs.includes('{')) {
                        const parsed = JSON.parse(activeLs);
                        actualWalletName = parsed.id || parsed.name || parsed.activeWallet || 'Secured Wallet';
                    } else {
                        actualWalletName = activeLs;
                    }
                }
            } catch (e) {
                // Ignore parse errors silently
            }
        }

        return { address: result.address, name: actualWalletName };
    }

    async disconnect(): Promise<void> {
        if (typeof window === 'undefined') return;
        await StellarWalletsKit.disconnect();
    }

    async signTransaction(xdr: string, networkPassphrase: string): Promise<string> {
        const network = networkPassphrase.includes("Public") ? StellarKitNetworks.PUBLIC : StellarKitNetworks.TESTNET;
        this.initializeKit(network);

        try {
            const response = await StellarWalletsKit.signTransaction(xdr, { networkPassphrase });

            if (!response) throw new Error('Transaction signing failed or was cancelled.');

            return typeof response === 'string'
                ? response
                : (response as any).signedTxXdr || (response as any).signedTransaction || '';
        } catch (error: any) {
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
    walletName: string; // 🚀 EXPORT THE SNIFFED NAME
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
    const [walletName, setWalletName] = useState<string>(''); // 🚀 STATE FOR WALLET NAME

    useEffect(() => {
        const savedAddress = localStorage.getItem('wallet_address');
        const savedAdapter = localStorage.getItem('wallet_adapter');
        const savedName = localStorage.getItem('wallet_actual_name'); // Load sniffed name
        if (savedAddress && savedAdapter) {
            setAddress(savedAddress);
            setActiveAdapterId(savedAdapter);
            if (savedName) setWalletName(savedName);
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

            // 🚀 Extract BOTH the address and the specific name returned by the adapter
            const { address: pubKey, name: actualName } = await adapter.connect(networkKit);

            setAddress(pubKey);
            setActiveAdapterId(targetAdapterId);
            setWalletName(actualName); // Save the precise name to state

            localStorage.setItem('wallet_address', pubKey);
            localStorage.setItem('wallet_adapter', targetAdapterId);
            localStorage.setItem('wallet_actual_name', actualName); // Save for reloads
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
        setWalletName('');
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('wallet_adapter');
        localStorage.removeItem('wallet_actual_name');
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
            walletName, // Provide it to the rest of the app!
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