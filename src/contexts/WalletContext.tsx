import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { StellarWalletsKit, Networks as StellarKitNetworks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
// 🚀 WALLETCONNECT RESTORED: This is the ONLY way to get the "Approve Connection" popup in Lobstr on mobile web.
import { WalletConnectModule } from '@creit.tech/stellar-wallets-kit/modules/wallet-connect';
import { Networks } from '@stellar/stellar-sdk';
import { useNetwork } from './NetworkContext';

export interface WalletAdapter {
    id: string;
    name: string;
    isAvailable(): boolean;
    connect(network?: StellarKitNetworks): Promise<{ address: string; name: string }>;
    disconnect(): Promise<void>;
    signTransaction(xdr: string, networkPassphrase: string): Promise<string>;
}

class StellarWalletsKitAdapter implements WalletAdapter {
    id = 'stellar-wallets-kit';
    name = 'Stellar Wallets Kit';
    private initialized = false;

    private initializeKit(network: StellarKitNetworks = StellarKitNetworks.TESTNET) {
        if (typeof window === 'undefined') return;

        // Ensure the modal overlays perfectly on mobile
        if (!document.getElementById('swk-global-modal-fix')) {
            const style = document.createElement('style');
            style.id = 'swk-global-modal-fix';
            style.innerHTML = `
                #stellar-wallets-kit-modal-root {
                    position: fixed !important; top: 0 !important; left: 0 !important;
                    width: 100vw !important; height: 100vh !important;
                    z-index: 9999999 !important; display: flex !important;
                    align-items: center !important; justify-content: center !important;
                }
                stellar-wallets-modal {
                    position: relative !important; top: auto !important; left: auto !important;
                    transform: none !important; z-index: 10000000 !important; pointer-events: auto !important;
                }
                stellar-wallets-modal::part(overlay) {
                    position: fixed !important; top: 0 !important; left: 0 !important;
                    width: 100vw !important; height: 100vh !important;
                    background: rgba(0, 0, 0, 0.5) !important; backdrop-filter: blur(4px) !important;
                }
                wcm-modal, w3m-modal { z-index: 2147483647 !important; position: relative; }
                @media (max-width: 768px) {
                    #stellar-wallets-kit-modal-root { align-items: flex-end !important; padding-bottom: env(safe-area-inset-bottom) !important; }
                    stellar-wallets-modal { width: 100% !important; max-width: 100vw !important; margin: 0 !important; border-radius: 24px 24px 0 0 !important; }
                }
            `;
            document.head.appendChild(style);
        }

        // xBull removed. WalletConnect active for mobile app approvals.
        const modules = [
            new WalletConnectModule({
                projectId: '6c527328e4624dc4f1573f3c62b3833d',
                metadata: {
                    name: 'Lux PH Merchant',
                    description: 'Official Lux PH Merchant Dashboard',
                    url: window.location.origin,
                    icons: ['https://stellar.org/favicon.ico']
                }
            }),
            new FreighterModule(),
            new LobstrModule()
        ];

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

    isAvailable(): boolean { return typeof window !== 'undefined'; }

    async connect(network: StellarKitNetworks = StellarKitNetworks.TESTNET): Promise<{ address: string; name: string }> {
        this.initializeKit(network);
        const result: any = await StellarWalletsKit.authModal({ container: document.body });

        if (!result || !result.address) throw new Error('Wallet connection was cancelled.');

        let actualWalletName = result.walletId || result.wallet || result.id || result.name || 'Secured Wallet';
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
            return typeof response === 'string' ? response : (response as any).signedTxXdr || (response as any).signedTransaction || '';
        } catch (error: any) {
            if (error && typeof error === 'object' && !error.message) throw new Error(`Wallet Error: ${JSON.stringify(error)}`);
            throw error;
        }
    }
}

interface WalletContextType {
    address: string;
    isConnecting: boolean;
    walletName: string;
    connect: () => Promise<void>;
    disconnect: () => void;
    signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);
const adapter = new StellarWalletsKitAdapter();

export const WalletProvider = ({ children }: { children: ReactNode }) => {
    const { networkConfig } = useNetwork();
    const [address, setAddress] = useState<string>('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [walletName, setWalletName] = useState<string>('');

    useEffect(() => {
        const savedAddress = localStorage.getItem('wallet_address');
        const savedName = localStorage.getItem('wallet_actual_name');
        if (savedAddress) {
            setAddress(savedAddress);
            if (savedName) setWalletName(savedName);
        }
    }, []);

    const connect = async () => {
        const networkKit = networkConfig.networkPassphrase === Networks.PUBLIC ? StellarKitNetworks.PUBLIC : StellarKitNetworks.TESTNET;
        setIsConnecting(true);
        try {
            const { address: pubKey, name: actualName } = await adapter.connect(networkKit);
            setAddress(pubKey);
            setWalletName(actualName);
            localStorage.setItem('wallet_address', pubKey);
            localStorage.setItem('wallet_actual_name', actualName);
        } catch (error: any) {
            console.error('Wallet connection failed:', error);
            if (error.message && !error.message.includes('cancelled')) alert(error.message);
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnect = async () => {
        await adapter.disconnect();
        setAddress('');
        setWalletName('');
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('wallet_actual_name');
    };

    const signTx = async (xdr: string, networkPassphrase: string): Promise<string> => {
        if (!address) throw new Error('No active wallet session. Please disconnect and reconnect your app.');
        return await adapter.signTransaction(xdr, networkPassphrase);
    };

    return (
        <WalletContext.Provider value={{ address, isConnecting, walletName, connect, disconnect, signTx }}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => {
    const context = useContext(WalletContext);
    if (!context) throw new Error('useWallet must be used within a WalletProvider');
    return context;
};