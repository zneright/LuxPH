import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, addDoc, query, orderBy, limit, getDocs } from "firebase/firestore";
import {
    Horizon,
    Keypair,
    Asset,
    TransactionBuilder,
    Networks,
    Operation,
    Claimant,
    BASE_FEE
} from "@stellar/stellar-sdk";
import { motion, AnimatePresence } from "framer-motion";
import CryptoJS from "crypto-js";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";

// --- Configuration & Constants ---
const NETWORKS = {
    MAINNET: "https://horizon.stellar.org",
    TESTNET: "https://horizon-testnet.stellar.org"
};

const SUPPORTED_ASSETS = [
    { code: "PHPC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
    { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
    { code: "XLM", issuer: "" }
];

interface VaultConfig {
    isEnabled: boolean;
    deductionPercentage: number;
    lockDurationDays: number;
    autoRenew: boolean;
    networkUrl: string;
    targetAsset: string;
}

interface LockedFund {
    id: string;
    amount: string;
    assetCode: string;
    sponsor: string;
    unlockTimestamp: number;
    isUnlockable: boolean;
}

export default function ContingencyVault() {
    const [activeTab, setActiveTab] = useState<"dashboard" | "settings">("dashboard");

    const [config, setConfig] = useState<VaultConfig>({
        isEnabled: false,
        deductionPercentage: 5,
        lockDurationDays: 30,
        autoRenew: true,
        networkUrl: NETWORKS.TESTNET,
        targetAsset: "PHPC",
    });

    const [availableBalance, setAvailableBalance] = useState("0.00");
    const [lockedFunds, setLockedFunds] = useState<LockedFund[]>([]);
    const [totalLocked, setTotalLocked] = useState(0);

    // Security & Session State
    const [secretKey, setSecretKey] = useState<string>("");
    const [sessionPin, setSessionPin] = useState<string>("");
    const [isSessionUnlocked, setIsSessionUnlocked] = useState<boolean>(false);
    const [isReturningUser, setIsReturningUser] = useState<boolean>(false);
    const [isCheckingUser, setIsCheckingUser] = useState<boolean>(true);
    const [keyError, setKeyError] = useState("");

    // Engine State
    const [isSyncing, setIsSyncing] = useState(false);
    const [recentLogs, setRecentLogs] = useState<{ id: string, msg: string, time: Date, type: 'success' | 'warn' }[]>([]);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    const streamCloserRef = useRef<(() => void) | null>(null);
    const processedTxs = useRef<Set<string>>(new Set());

    useEffect(() => {
        const initVault = () => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    const mDoc = await getDoc(doc(db, "merchants", user.uid));
                    if (mDoc.exists()) {
                        const data = mDoc.data();

                        if (data.vaultConfig) {
                            setConfig({
                                isEnabled: data.vaultConfig.isEnabled ?? false,
                                deductionPercentage: data.vaultConfig.deductionPercentage ?? 5,
                                lockDurationDays: data.vaultConfig.lockDurationDays ?? 30,
                                autoRenew: data.vaultConfig.autoRenew ?? true,
                                networkUrl: data.vaultConfig.networkUrl || NETWORKS.TESTNET,
                                targetAsset: data.vaultConfig.targetAsset || "PHPC",
                            });
                        }

                        if (data.encryptedSecretKey && data.encryptedSecretKey !== "") {
                            setIsReturningUser(true);
                        } else {
                            setIsReturningUser(false);
                            setIsSessionUnlocked(false);
                        }
                    }
                    setIsCheckingUser(false);

                    try {
                        const q = query(collection(db, `merchants/${user.uid}/telemetry`), orderBy("time", "desc"), limit(10));
                        const snap = await getDocs(q);
                        const logs = snap.docs.map(d => {
                            const data = d.data();
                            return { id: d.id, msg: data.msg, time: new Date(data.time), type: data.type as 'success' | 'warn' };
                        });
                        setRecentLogs(logs);
                    } catch (err) {
                        console.error("Failed to load telemetry data", err);
                    }
                }
            });
        };
        initVault();

        return () => {
            if (streamCloserRef.current) streamCloserRef.current();
        };
    }, []);

    const syncHorizonData = async (kp: Keypair) => {
        setIsSyncing(true);
        try {
            const server = new Horizon.Server(config.networkUrl);
            const pubKey = kp.publicKey();

            const account = await server.loadAccount(pubKey);
            const targetBalance = account.balances.find(b =>
                (b as any).asset_code === config.targetAsset ||
                (config.targetAsset === "XLM" && b.asset_type === "native")
            );
            setAvailableBalance(targetBalance ? targetBalance.balance : "0.00");

            const claimables = await server.claimableBalances()
                .claimant(pubKey)
                .order("desc")
                .limit(100)
                .call();

            const parsedLocks: LockedFund[] = claimables.records.map((record) => {
                let unlockTime = 0;
                const predicate = record.claimants.find(c => c.destination === pubKey)?.predicate;

                if (predicate && predicate.not && predicate.not.abs_before) {
                    unlockTime = new Date(predicate.not.abs_before).getTime();
                }

                const isUnlockable = Date.now() >= unlockTime;

                return {
                    id: record.id,
                    amount: record.amount,
                    assetCode: record.asset.split(":")[0] === "native" ? "XLM" : record.asset.split(":")[0],
                    sponsor: record.sponsor,
                    unlockTimestamp: unlockTime,
                    isUnlockable
                };
            })
                .filter(lock => lock.assetCode === config.targetAsset)
                .sort((a, b) => b.unlockTimestamp - a.unlockTimestamp);

            setLockedFunds(parsedLocks);

            const total = parsedLocks.reduce((sum, lock) => sum + parseFloat(lock.amount), 0);
            setTotalLocked(total);
            setCurrentPage(1);

        } catch (error) {
            console.error("Horizon Sync Error:", error);
            addLog("Failed to synchronize with Horizon ledger.", "warn");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleAuthSession = async () => {
        try {
            setKeyError("");
            if (!auth.currentUser) throw new Error("Authentication required.");

            let finalSecretKey = secretKey;

            if (isReturningUser) {
                const mDoc = await getDoc(doc(db, "merchants", auth.currentUser.uid));
                const encryptedData = mDoc.data()?.encryptedSecretKey;

                if (!encryptedData) throw new Error("Vault data corrupted.");

                const bytes = CryptoJS.AES.decrypt(encryptedData, sessionPin);
                finalSecretKey = bytes.toString(CryptoJS.enc.Utf8);

                if (!finalSecretKey) throw new Error("Incorrect PIN. Decryption failed.");
            } else {
                if (sessionPin.length < 4) throw new Error("PIN must be at least 4 characters.");
                Keypair.fromSecret(secretKey);

                const ciphertext = CryptoJS.AES.encrypt(secretKey, sessionPin).toString();

                await setDoc(doc(db, "merchants", auth.currentUser.uid), {
                    encryptedSecretKey: ciphertext
                }, { merge: true });

                setIsReturningUser(true);
            }

            const kp = Keypair.fromSecret(finalSecretKey);
            setSecretKey(finalSecretKey);

            localStorage.setItem("luxph_vault_pin", sessionPin);

            setIsSessionUnlocked(true);
            syncHorizonData(kp);

            if (config.isEnabled) {
                startPaymentListener(kp, config);
                addLog("Vault Engine Online. UI session unlocked.", "success");
            }
        } catch (err: any) {
            setKeyError(err.message || "Invalid input. Please check and try again.");
        }
    };

    const handleLockSession = () => {
        if (streamCloserRef.current) streamCloserRef.current();
        setSecretKey("");
        setSessionPin("");
        setIsSessionUnlocked(false);
        setLockedFunds([]);
        localStorage.removeItem("luxph_vault_pin");
        addLog("Session securely terminated. Keys cleared from memory.", "warn");
    };

    const startPaymentListener = (kp: Keypair, activeConfig: VaultConfig) => {
        if (streamCloserRef.current) streamCloserRef.current();

        const server = new Horizon.Server(activeConfig.networkUrl);
        streamCloserRef.current = server.payments()
            .forAccount(kp.publicKey())
            .cursor("now")
            .stream({
                onmessage: async (payment: any) => {
                    if (processedTxs.current.has(payment.transaction_hash)) return;
                    processedTxs.current.add(payment.transaction_hash);

                    const isNative = payment.asset_type === "native" && activeConfig.targetAsset === "XLM";
                    const isAssetMatch = payment.asset_code === activeConfig.targetAsset;

                    if ((isNative || isAssetMatch) && payment.to === kp.publicKey()) {
                        const amount = parseFloat(payment.amount);
                        const deduction = amount * (activeConfig.deductionPercentage / 100);

                        if (deduction > 0) {
                            addLog(`Detected payment: ${amount} ${activeConfig.targetAsset}. Processing ${deduction.toFixed(2)} lock...`, "success");
                            await executeVaultLock(kp, deduction.toFixed(7), activeConfig);
                        }
                    }
                }
            });
    };

    const executeVaultLock = async (kp: Keypair, amountToLock: string, activeConfig: VaultConfig) => {
        try {
            const server = new Horizon.Server(activeConfig.networkUrl);
            const account = await server.loadAccount(kp.publicKey());
            const isTestnet = activeConfig.networkUrl === NETWORKS.TESTNET;
            const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

            let asset: Asset;
            if (activeConfig.targetAsset === "XLM") {
                asset = Asset.native();
            } else {
                const issuerData = SUPPORTED_ASSETS.find(a => a.code === activeConfig.targetAsset)?.issuer || "";
                asset = new Asset(activeConfig.targetAsset, issuerData);
            }

            const unlockDate = new Date();
            unlockDate.setDate(unlockDate.getDate() + activeConfig.lockDurationDays);
            const unlockUnixSeconds = Math.floor(unlockDate.getTime() / 1000).toString();

            const strictTimePredicate = Claimant.predicateNot(
                Claimant.predicateBeforeAbsoluteTime(unlockUnixSeconds)
            );

            const op = Operation.createClaimableBalance({
                asset: asset,
                amount: amountToLock,
                claimants: [new Claimant(kp.publicKey(), strictTimePredicate)]
            });

            const transaction = new TransactionBuilder(account, {
                fee: BASE_FEE,
                networkPassphrase,
            })
                .addOperation(op)
                .setTimeout(30)
                .build();

            transaction.sign(kp);
            const response = await server.submitTransaction(transaction);

            addLog(`Vault allocation successful! Tx Hash: ${response.hash.substring(0, 12)}...`, "success");
            syncHorizonData(kp);

        } catch (error: any) {
            console.error("Lock Execution Failed", error.response?.data?.extras?.result_codes || error);
            addLog("Vault allocation failed during network broadcast.", "warn");
        }
    };

    const handleClaimFunds = async (lockId: string) => {
        if (!isSessionUnlocked) return;
        try {
            const kp = Keypair.fromSecret(secretKey);
            const server = new Horizon.Server(config.networkUrl);
            const account = await server.loadAccount(kp.publicKey());
            const networkPassphrase = config.networkUrl === NETWORKS.TESTNET ? Networks.TESTNET : Networks.PUBLIC;

            const op = Operation.claimClaimableBalance({ balanceId: lockId });

            const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
                .addOperation(op)
                .setTimeout(30)
                .build();

            transaction.sign(kp);
            await server.submitTransaction(transaction);

            addLog("Successfully retrieved mature vault funds.", "success");
            syncHorizonData(kp);
        } catch (error: any) {
            addLog(`Claim rejected by Horizon node. Funds remain cryptographically locked.`, "warn");
        }
    };

    const handleClaimAllMature = async () => {
        if (!isSessionUnlocked) return;

        const matureLocks = lockedFunds.filter(lock => lock.isUnlockable);
        if (matureLocks.length === 0) return;

        try {
            addLog(`Sweeping ${matureLocks.length} mature allocations...`, "success");
            setIsSyncing(true);

            const kp = Keypair.fromSecret(secretKey);
            const server = new Horizon.Server(config.networkUrl);
            const account = await server.loadAccount(kp.publicKey());
            const networkPassphrase = config.networkUrl === NETWORKS.TESTNET ? Networks.TESTNET : Networks.PUBLIC;

            let txBuilder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase });
            const locksToClaim = matureLocks.slice(0, 100);

            locksToClaim.forEach(lock => {
                txBuilder.addOperation(Operation.claimClaimableBalance({ balanceId: lock.id }));
            });

            const transaction = txBuilder.setTimeout(30).build();
            transaction.sign(kp);

            await server.submitTransaction(transaction);

            addLog(`Successfully swept ${locksToClaim.length} mature allocations.`, "success");
            syncHorizonData(kp);
        } catch (error: any) {
            console.error("Batch claim failed:", error);
            addLog(`Batch claim rejected by Horizon node.`, "warn");
            setIsSyncing(false);
        }
    };

    const saveSettings = async (newConfig: VaultConfig) => {
        setConfig(newConfig);

        if (auth.currentUser) {
            const userRef = doc(db, "merchants", auth.currentUser.uid);
            await setDoc(userRef, { vaultConfig: newConfig }, { merge: true }).catch(err => {
                console.error("Failed to save settings to Firestore", err);
            });
        }

        if (isSessionUnlocked && newConfig.isEnabled) {
            const kp = Keypair.fromSecret(secretKey);
            startPaymentListener(kp, newConfig);
            addLog("Engine settings updated and saved.", "success");
        } else if (!newConfig.isEnabled && streamCloserRef.current) {
            streamCloserRef.current();
            streamCloserRef.current = null;
            addLog("Engine halted. Settings saved.", "warn");
        }
    };

    const addLog = async (msg: string, type: 'success' | 'warn') => {
        const newLog = { id: Math.random().toString(), msg, time: new Date(), type };
        setRecentLogs(prev => [newLog, ...prev].slice(0, 10));

        if (auth.currentUser) {
            try {
                await addDoc(collection(db, `merchants/${auth.currentUser.uid}/telemetry`), {
                    msg: newLog.msg,
                    time: newLog.time.toISOString(),
                    type: newLog.type
                });
            } catch (err) {
                console.error("Telemetry save failed:", err);
            }
        }
    };

    const matureCount = lockedFunds.filter(lock => lock.isUnlockable).length;
    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentItems = lockedFunds.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(lockedFunds.length / ITEMS_PER_PAGE);

    if (isCheckingUser) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                <div style={{ color: "#6b7280", fontFamily: "'DM Mono', monospace", fontWeight: 700, animation: "pulse 2s infinite" }}>
                    Initializing Vault Architecture...
                </div>
            </div>
        );
    }

    return (
        <div style={{ fontFamily: "'Nunito',sans-serif", color: "#111827", padding: "16px", boxSizing: "border-box", maxWidth: "1000px", margin: "0 auto" }}>
            <style>{`
                /* --- Light Mode Refinements --- */
                .vault-card { 
                    background: #ffffff; 
                    border: 1px solid #f3f4f6; 
                    box-shadow: 0 10px 30px -10px rgba(0,0,0,0.05); 
                    border-radius: 24px; 
                    padding: 32px; 
                }
                
                .tab-btn { 
                    background: transparent; 
                    border: none; 
                    color: #6b7280; 
                    font-family: 'Nunito', sans-serif; 
                    font-weight: 800; 
                    font-size: 15px; 
                    padding: 12px 24px; 
                    cursor: pointer; 
                    transition: 0.3s; 
                    position: relative; 
                }
                .tab-btn.active { color: #10b981; }
                .tab-indicator {
                    position: absolute;
                    bottom: -1px;
                    left: 15%;
                    right: 15%;
                    height: 3px;
                    background: #10b981;
                    border-radius: 3px 3px 0 0;
                }

                .stat-box { 
                    background: #f9fafb; 
                    border: 1px solid #e5e7eb; 
                    padding: 24px; 
                    border-radius: 16px; 
                    transition: all 0.3s ease;
                }
                .stat-box:hover {
                    box-shadow: 0 8px 20px -8px rgba(0,0,0,0.06);
                    transform: translateY(-2px);
                }

                .styled-input { 
                    width: 100%; 
                    background: #f9fafb; 
                    border: 1px solid #e5e7eb; 
                    border-radius: 12px; 
                    padding: 16px; 
                    color: #111827; 
                    font-size: 15px; 
                    outline: none; 
                    transition: all 0.3s; 
                    font-family: 'DM Mono', monospace; 
                }
                .styled-input:focus { 
                    border-color: #10b981; 
                    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1); 
                    background: #ffffff;
                }

                .allocation-row {
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    padding: 20px; 
                    background: #ffffff; 
                    border: 1px solid #e5e7eb; 
                    border-radius: 16px; 
                    transition: all 0.2s ease;
                }
                .allocation-row:hover {
                    box-shadow: 0 4px 15px -5px rgba(0,0,0,0.05);
                    border-color: #d1d5db;
                }

                .btn-pro {
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: #fff;
                    border: none;
                    border-radius: 14px;
                    padding: 16px;
                    font-weight: 800;
                    font-size: 16px;
                    cursor: pointer;
                    box-shadow: 0 8px 20px -6px rgba(16, 185, 129, 0.4);
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .btn-pro:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 25px -8px rgba(16, 185, 129, 0.5);
                }
                .btn-pro:active {
                    transform: translateY(1px) scale(0.98);
                }

                .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
                @media (max-width: 768px) { 
                    .settings-grid { grid-template-columns: 1fr; gap: 24px; } 
                    .vault-card { padding: 20px; }
                    .allocation-row { flex-direction: column; align-items: flex-start; gap: 16px; }
                    .allocation-row button { width: 100%; }
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>

            <div style={{ marginBottom: 32, padding: "0 8px" }}>
                <h1 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: "-0.02em", color: "#111827" }}>Contingency Vault</h1>
                <p style={{ color: "#6b7280", fontSize: 15, marginTop: 6, fontWeight: 500 }}>Automated ledger-locked savings engine utilizing Time-Bound Claimable Balances.</p>
            </div>

            {!isSessionUnlocked ? (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="vault-card" style={{ maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
                    <div style={{ fontSize: 56, marginBottom: 20 }}>🔒</div>
                    <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, color: "#111827" }}>Secure Session Import</h2>
                    <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
                        {isReturningUser
                            ? "Your encrypted vault data was detected. Please enter your PIN to view or edit vault settings."
                            : "To automate contingency deductions, your secret key is required. It will be encrypted locally using a PIN."}
                        <br /><span style={{ color: "#10b981", fontWeight: 700, display: "inline-block", marginTop: 8 }}>Keys are never transmitted or logged in plaintext.</span>
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
                        {!isReturningUser && (
                            <input
                                type="password"
                                placeholder="Stellar Secret Key (S...)"
                                value={secretKey}
                                onChange={(e) => setSecretKey(e.target.value)}
                                className="styled-input"
                                style={{ textAlign: "center", borderColor: keyError && !secretKey ? "#ef4444" : "#e5e7eb" }}
                            />
                        )}

                        <input
                            type="password"
                            placeholder={isReturningUser ? "Enter Vault PIN to Decrypt UI" : "Create Vault PIN (Min 4 chars)"}
                            value={sessionPin}
                            onChange={(e) => setSessionPin(e.target.value)}
                            className="styled-input"
                            style={{ textAlign: "center", borderColor: keyError && !sessionPin ? "#ef4444" : "#e5e7eb" }}
                        />
                    </div>

                    <AnimatePresence>
                        {keyError && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ color: "#ef4444", fontSize: 13, marginBottom: 16, fontWeight: 700 }}>
                                {keyError}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button className="btn-pro" onClick={handleAuthSession} style={{ width: "100%" }}>
                        {isReturningUser ? "Decrypt & Unlock Vault" : "Encrypt & Initialize Vault"}
                    </button>
                </motion.div>
            ) : (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: "grid", gap: "24px" }}>

                    {/* Status Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 16, padding: "16px 24px", flexWrap: "wrap", gap: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 0 4px rgba(16,185,129,0.2)" }} />
                            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "#065f46" }}>
                                Session Secure • {config.networkUrl.includes('testnet') ? 'TESTNET' : 'MAINNET'}
                            </span>
                        </div>
                        <button
                            onClick={handleLockSession}
                            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all 0.2s" }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#fee2e2"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "#fef2f2"}
                        >
                            TERMINATE SESSION
                        </button>
                    </div>

                    {/* Navigation Tabs */}
                    <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 8, position: "relative" }}>
                        <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                            Vault Overview
                            {activeTab === 'dashboard' && <motion.div layoutId="activeTab" className="tab-indicator" />}
                        </button>
                        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                            Engine Configuration
                            {activeTab === 'settings' && <motion.div layoutId="activeTab" className="tab-indicator" />}
                        </button>
                    </div>

                    <AnimatePresence mode="wait">
                        {activeTab === 'dashboard' ? (
                            <motion.div key="dashboard" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="vault-card">

                                {/* Metrics Grid */}
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 40 }}>
                                    <div className="stat-box">
                                        <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#6b7280", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Total Immutable Value</div>
                                        <div style={{ fontSize: 32, fontWeight: 900, color: "#111827" }}>{totalLocked.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: 18, color: "#9ca3af" }}>{config.targetAsset}</span></div>
                                    </div>
                                    <div className="stat-box">
                                        <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#6b7280", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Liquid / Available</div>
                                        <div style={{ fontSize: 32, fontWeight: 900, color: "#111827" }}>{parseFloat(availableBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: 18, color: "#9ca3af" }}>{config.targetAsset}</span></div>
                                    </div>
                                    <div className="stat-box">
                                        <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#6b7280", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Engine Status</div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: config.isEnabled ? "#10b981" : "#ef4444" }} />
                                            <div style={{ fontSize: 16, fontWeight: 800, color: config.isEnabled ? "#059669" : "#dc2626" }}>
                                                {config.isEnabled ? "ACTIVE (Auto-Deduct ON)" : "HALTED"}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Allocations List */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #f3f4f6", paddingBottom: 16, marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
                                    <h3 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: "#111827" }}>Encrypted Allocations</h3>
                                    {matureCount > 0 && !isSyncing && (
                                        <button className="btn-pro" onClick={handleClaimAllMature} style={{ padding: "10px 20px", fontSize: 14 }}>
                                            Sweep All Mature ({matureCount})
                                        </button>
                                    )}
                                </div>

                                {isSyncing ? (
                                    <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}>
                                        <LoadingBadge text="Synchronizing Horizon State..." variant="secure" />
                                    </div>
                                ) : (
                                    <div style={{ display: "grid", gap: 16 }}>
                                        {lockedFunds.length === 0 ? (
                                            <div style={{ textAlign: "center", padding: 60, background: "#f9fafb", borderRadius: 16, border: "1px dashed #d1d5db" }}>
                                                <div style={{ fontSize: 24, marginBottom: 12 }}>🕸️</div>
                                                <div style={{ color: "#6b7280", fontWeight: 600, fontSize: 15 }}>No cryptographic locks identified on the ledger.</div>
                                            </div>
                                        ) : (
                                            <motion.div variants={{ show: { transition: { staggerChildren: 0.05 } } }} initial="hidden" animate="show">
                                                {currentItems.map(lock => (
                                                    <motion.div
                                                        key={lock.id}
                                                        variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                                                        className="allocation-row"
                                                    >
                                                        <div>
                                                            <div style={{ fontSize: 22, fontWeight: 900, color: "#111827", marginBottom: 6 }}>
                                                                {parseFloat(lock.amount).toLocaleString()} <span style={{ fontSize: 16, color: "#6b7280" }}>{lock.assetCode}</span>
                                                            </div>
                                                            <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#9ca3af", marginBottom: 8 }}>ID: {lock.id.substring(0, 16)}...</div>

                                                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: lock.isUnlockable ? "#ecfdf5" : "#fffbeb", borderRadius: 6, border: `1px solid ${lock.isUnlockable ? "#a7f3d0" : "#fde68a"}` }}>
                                                                <span style={{ fontSize: 12 }}>{lock.isUnlockable ? "🔓" : "🔒"}</span>
                                                                <span style={{ fontSize: 11, fontWeight: 800, color: lock.isUnlockable ? "#059669" : "#d97706", textTransform: "uppercase" }}>
                                                                    {lock.isUnlockable ? "Mature - Ready" : `Locked: ${new Date(lock.unlockTimestamp).toLocaleDateString()}`}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleClaimFunds(lock.id)}
                                                            disabled={!lock.isUnlockable}
                                                            style={{
                                                                background: lock.isUnlockable ? "#111827" : "#f3f4f6",
                                                                color: lock.isUnlockable ? "#fff" : "#9ca3af",
                                                                border: "none",
                                                                padding: "12px 24px",
                                                                borderRadius: 10,
                                                                fontWeight: 800,
                                                                cursor: lock.isUnlockable ? "pointer" : "not-allowed",
                                                                transition: "all 0.2s",
                                                                boxShadow: lock.isUnlockable ? "0 4px 12px rgba(0,0,0,0.1)" : "none"
                                                            }}
                                                        >
                                                            Redeem Yield
                                                        </button>
                                                    </motion.div>
                                                ))}
                                            </motion.div>
                                        )}

                                        {/* Pagination */}
                                        {totalPages > 1 && (
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, padding: "16px", background: "#f9fafb", borderRadius: 12 }}>
                                                <button
                                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                    disabled={currentPage === 1}
                                                    style={{ padding: "8px 16px", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.5 : 1, fontWeight: 700 }}
                                                >
                                                    &larr; Prev
                                                </button>
                                                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>Page {currentPage} of {totalPages}</span>
                                                <button
                                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                                    disabled={currentPage === totalPages}
                                                    style={{ padding: "8px 16px", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.5 : 1, fontWeight: 700 }}
                                                >
                                                    Next &rarr;
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Telemetry Logs */}
                                <h3 style={{ fontSize: 16, fontWeight: 800, borderBottom: "1px solid #f3f4f6", paddingBottom: 12, marginTop: 48, marginBottom: 16, color: "#111827" }}>Horizon Telemetry Logs</h3>
                                <div style={{ background: "#1f2937", borderRadius: 16, padding: 20, fontFamily: "'DM Mono', monospace", fontSize: 12, minHeight: "100px", maxHeight: "250px", overflowY: "auto", boxShadow: "inset 0 2px 10px rgba(0,0,0,0.1)" }}>
                                    {recentLogs.map(log => (
                                        <div key={log.id} style={{ display: "flex", gap: 12, marginBottom: 10, color: log.type === 'success' ? "#6ee7b7" : "#fca5a5" }}>
                                            <span style={{ color: "#9ca3af", flexShrink: 0 }}>[{log.time.toLocaleTimeString()}]</span>
                                            <span style={{ lineHeight: 1.4 }}>{log.msg}</span>
                                        </div>
                                    ))}
                                    {recentLogs.length === 0 && <span style={{ color: "#9ca3af" }}>Awaiting telemetry data...</span>}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="settings" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="vault-card">
                                <div className="settings-grid">
                                    {/* Left Column */}
                                    <div>
                                        <div style={{ marginBottom: 32 }}>
                                            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: "#f9fafb", padding: 20, borderRadius: 16, border: "1px solid #e5e7eb" }}>
                                                <div>
                                                    <div style={{ fontSize: 16, fontWeight: 900, color: "#111827", marginBottom: 4 }}>Master Engine Toggle</div>
                                                    <div style={{ fontSize: 13, color: "#6b7280" }}>Automatically intercept and vault incoming payments.</div>
                                                </div>
                                                <div style={{ width: 52, height: 28, background: config.isEnabled ? "#10b981" : "#d1d5db", borderRadius: 20, position: "relative", transition: "0.3s" }} onClick={() => saveSettings({ ...config, isEnabled: !config.isEnabled })}>
                                                    <motion.div layout style={{ width: 24, height: 24, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: config.isEnabled ? 26 : 2, boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }} />
                                                </div>
                                            </label>
                                        </div>

                                        <div style={{ marginBottom: 32 }}>
                                            <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#6b7280", letterSpacing: ".06em", marginBottom: 12, fontWeight: 800, textTransform: "uppercase" }}>Deduction Allocation (%)</div>
                                            <input
                                                type="range" min="1" max="50"
                                                value={config.deductionPercentage}
                                                onChange={(e) => saveSettings({ ...config, deductionPercentage: Number(e.target.value) })}
                                                style={{ width: "100%", accentColor: "#10b981", height: 6, borderRadius: 3 }}
                                            />
                                            <div style={{ textAlign: "right", fontSize: 15, fontWeight: 900, color: "#059669", marginTop: 12 }}>{config.deductionPercentage}% per transaction</div>
                                        </div>

                                        <div style={{ marginBottom: 32 }}>
                                            <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#6b7280", letterSpacing: ".06em", marginBottom: 12, fontWeight: 800, textTransform: "uppercase" }}>Cryptographic Lock Duration (Days)</div>
                                            <input
                                                type="number" min="1" max="365"
                                                value={config.lockDurationDays}
                                                onChange={(e) => saveSettings({ ...config, lockDurationDays: Number(e.target.value) })}
                                                className="styled-input"
                                                style={{ fontWeight: 800, fontSize: 18 }}
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column */}
                                    <div>
                                        <div style={{ marginBottom: 32 }}>
                                            <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#6b7280", letterSpacing: ".06em", marginBottom: 12, fontWeight: 800, textTransform: "uppercase" }}>Target Asset</div>
                                            <select
                                                value={config.targetAsset}
                                                onChange={(e) => saveSettings({ ...config, targetAsset: e.target.value })}
                                                className="styled-input" style={{ appearance: "none", cursor: "pointer", fontWeight: 700 }}
                                            >
                                                <option value="PHPC">PHPC (Philippine Peso Stablecoin)</option>
                                                <option value="USDC">USDC</option>
                                                <option value="XLM">XLM (Native)</option>
                                            </select>
                                        </div>

                                        {/* Preserved Architecture Note */}
                                        <div style={{ padding: 24, background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 16 }}>
                                            <div style={{ fontSize: 14, fontWeight: 900, color: "#92400e", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                                                <span>⚠️</span> Architecture Note
                                            </div>
                                            <div style={{ fontSize: 13, color: "#b45309", lineHeight: 1.6, fontWeight: 500 }}>
                                                Settings are saved dynamically. Adjusting the Lock Duration only affects <strong>future</strong> allocations. Existing locked balances map strictly to their original on-chain timestamp predicates.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </div>
    );
}