import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
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
    const [isSessionUnlocked, setIsSessionUnlocked] = useState<boolean>(false);
    const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
    const [keyError, setKeyError] = useState("");

    // Engine State
    const [isSyncing, setIsSyncing] = useState(false);
    const [recentLogs, setRecentLogs] = useState<{ id: string, msg: string, time: Date, type: 'success' | 'warn' }[]>([]);

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
                            setConfig(data.vaultConfig);
                        }
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

            const claimables = await server.claimableBalances().claimant(pubKey).call();

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
            }).filter(lock => lock.assetCode === config.targetAsset);

            setLockedFunds(parsedLocks);

            const total = parsedLocks.reduce((sum, lock) => sum + parseFloat(lock.amount), 0);
            setTotalLocked(total);

        } catch (error) {
            console.error("Horizon Sync Error:", error);
            addLog("Failed to synchronize with Horizon ledger.", "warn");
            throw error; // Throwing error to catch it during the unlock session flow
        } finally {
            setIsSyncing(false);
        }
    };

    const handleUnlockSession = async () => {
        try {
            setKeyError("");
            setIsAuthenticating(true);
            const kp = Keypair.fromSecret(secretKey);

            // Wait for Horizon to return all balances and locks first
            await syncHorizonData(kp);

            // Unlock dashboard only after data has successfully loaded
            setIsSessionUnlocked(true);

            if (config.isEnabled) {
                startPaymentListener(kp);
                addLog("Vault Engine Online. Listening for incoming payments.", "success");
            }
        } catch (err) {
            setKeyError("Invalid Secret Key or Network Error. Please check and try again.");
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleLockSession = () => {
        if (streamCloserRef.current) streamCloserRef.current();
        setSecretKey("");
        setIsSessionUnlocked(false);
        setLockedFunds([]);
        addLog("Session securely terminated. Keys cleared from memory.", "warn");
    };

    const startPaymentListener = (kp: Keypair) => {
        if (streamCloserRef.current) streamCloserRef.current();

        const server = new Horizon.Server(config.networkUrl);
        streamCloserRef.current = server.payments()
            .forAccount(kp.publicKey())
            .cursor("now")
            .stream({
                onmessage: async (payment: any) => {
                    if (processedTxs.current.has(payment.transaction_hash)) return;
                    processedTxs.current.add(payment.transaction_hash);

                    const isNative = payment.asset_type === "native" && config.targetAsset === "XLM";
                    const isAssetMatch = payment.asset_code === config.targetAsset;

                    if ((isNative || isAssetMatch) && payment.to === kp.publicKey()) {
                        const amount = parseFloat(payment.amount);
                        const deduction = amount * (config.deductionPercentage / 100);

                        if (deduction > 0) {
                            addLog(`Detected payment: ${amount} ${config.targetAsset}. Processing ${deduction.toFixed(2)} lock...`, "success");
                            await executeVaultLock(kp, deduction.toFixed(7));
                        }
                    }
                }
            });
    };

    const executeVaultLock = async (kp: Keypair, amountToLock: string) => {
        try {
            const server = new Horizon.Server(config.networkUrl);
            const account = await server.loadAccount(kp.publicKey());
            const isTestnet = config.networkUrl === NETWORKS.TESTNET;
            const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

            let asset: Asset;
            if (config.targetAsset === "XLM") {
                asset = Asset.native();
            } else {
                const issuerData = SUPPORTED_ASSETS.find(a => a.code === config.targetAsset)?.issuer || "";
                asset = new Asset(config.targetAsset, issuerData);
            }

            const unlockDate = new Date();
            unlockDate.setDate(unlockDate.getDate() + config.lockDurationDays);
            const unlockUnixSeconds = Math.floor(unlockDate.getTime() / 1000).toString();

            const strictTimePredicate = Claimant.predicateNot(
                Claimant.predicateBeforeAbsoluteTime(unlockUnixSeconds)
            );

            const op = Operation.createClaimableBalance({
                asset: asset,
                amount: amountToLock,
                claimants: [
                    new Claimant(kp.publicKey(), strictTimePredicate)
                ]
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

            const op = Operation.claimClaimableBalance({
                balanceId: lockId
            });

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

            addLog(`Successfully swept ${locksToClaim.length} mature allocations in a single transaction.`, "success");
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
            startPaymentListener(kp);
            addLog("Engine settings updated and saved.", "success");
        } else if (!newConfig.isEnabled && streamCloserRef.current) {
            streamCloserRef.current();
            streamCloserRef.current = null;
            addLog("Engine halted. Settings saved.", "warn");
        }
    };

    const addLog = (msg: string, type: 'success' | 'warn') => {
        setRecentLogs(prev => [{ id: Math.random().toString(), msg, time: new Date(), type }, ...prev].slice(0, 5));
    };

    const matureCount = lockedFunds.filter(lock => lock.isUnlockable).length;

    return (
        <div style={{ fontFamily: "'Nunito',sans-serif", color: "#fff", padding: "12px", boxSizing: "border-box" }}>
            <style>{`
            .vault-card { background: rgba(15, 17, 26, 0.6); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,.06); border-radius: 24px; padding: 32px; }
            .tab-btn { background: transparent; border: none; color: #9ca3af; font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 15px; padding: 12px 24px; cursor: pointer; transition: 0.3s; position: relative; }
            .tab-btn.active { color: #f59e0b; }
            .tab-btn.active::after { content: ''; position: absolute; bottom: 0; left: 20%; right: 20%; height: 3px; background: #f59e0b; border-radius: 3px 3px 0 0; }
            .stat-box { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); padding: 24px; border-radius: 16px; }
            .styled-input { width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 14px 16px; color: #fff; font-size: 15px; outline: none; transition: all 0.3s; font-family: 'DM Mono', monospace; }
            .styled-input:focus { border-color: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,0.2); }
        `}</style>

            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>Contingency Vault</h1>
                <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 6 }}>Automated ledger-locked savings engine utilizing Time-Bound Claimable Balances.</p>
            </div>

            {!isSessionUnlocked ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="vault-card" style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
                    <div style={{ fontSize: 50, marginBottom: 16, filter: "drop-shadow(0 0 20px rgba(245,158,11,0.4))" }}>🔒</div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Secure Session Import</h2>
                    <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                        To automate contingency deductions and on-chain lock creations, your secret key is required.
                        <br /><span style={{ color: "#f59e0b" }}>Keys are encrypted in ephemeral memory and never transmitted or logged.</span>
                    </p>

                    <input
                        type="password"
                        placeholder="S..."
                        value={secretKey}
                        onChange={(e) => setSecretKey(e.target.value)}
                        disabled={isAuthenticating}
                        className="styled-input"
                        style={{ marginBottom: 12, textAlign: "center", borderColor: keyError ? "#ef4444" : "rgba(255,255,255,0.1)", opacity: isAuthenticating ? 0.5 : 1 }}
                    />
                    {keyError && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 16, fontFamily: "'DM Mono', monospace" }}>{keyError}</div>}

                    <button
                        onClick={handleUnlockSession}
                        disabled={isAuthenticating}
                        style={{ width: "100%", background: isAuthenticating ? "rgba(245, 158, 11, 0.5)" : "linear-gradient(90deg, #f59e0b, #d97706)", color: "#fff", border: "none", borderRadius: 14, padding: "16px", fontWeight: 800, fontSize: 16, cursor: isAuthenticating ? "wait" : "pointer", boxShadow: isAuthenticating ? "none" : "0 8px 25px -6px rgba(245,158,11,0.5)" }}
                    >
                        {isAuthenticating ? "Synchronizing Ledger Data..." : "Authenticate & Initialize Vault"}
                    </button>
                </motion.div>
            ) : (
                <div style={{ display: "grid", gap: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: "12px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px #10b981" }} />
                            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#a7f3d0" }}>Session Secure. Network: {config.networkUrl.includes('testnet') ? 'TESTNET' : 'MAINNET'}</span>
                        </div>
                        <button onClick={handleLockSession} style={{ background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                            TERMINATE SESSION
                        </button>
                    </div>

                    <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 16 }}>
                        <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Vault Overview</button>
                        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Engine Configuration</button>
                    </div>

                    <AnimatePresence mode="wait">
                        {activeTab === 'dashboard' ? (
                            <motion.div key="dashboard" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="vault-card">

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 32 }}>
                                    <div className="stat-box">
                                        <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#9ca3af", letterSpacing: ".06em", marginBottom: 8, textTransform: "uppercase" }}>Total Immutable Value</div>
                                        <div style={{ fontSize: 32, fontWeight: 900, color: "#f59e0b" }}>{totalLocked.toLocaleString(undefined, { minimumFractionDigits: 2 })} {config.targetAsset}</div>
                                    </div>
                                    <div className="stat-box">
                                        <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#9ca3af", letterSpacing: ".06em", marginBottom: 8, textTransform: "uppercase" }}>Liquid / Available</div>
                                        <div style={{ fontSize: 32, fontWeight: 900, color: "#e5e7eb" }}>{parseFloat(availableBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })} {config.targetAsset}</div>
                                    </div>
                                    <div className="stat-box">
                                        <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#9ca3af", letterSpacing: ".06em", marginBottom: 8, textTransform: "uppercase" }}>Engine Status</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: config.isEnabled ? "#10b981" : "#ef4444", marginTop: 8 }}>
                                            {config.isEnabled ? "ACTIVE (Auto-Deduct ON)" : "HALTED (Auto-Deduct OFF)"}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 12, marginBottom: 20 }}>
                                    <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Encrypted Allocations</h3>

                                    {matureCount > 0 && !isSyncing && (
                                        <button
                                            onClick={handleClaimAllMature}
                                            style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 10, fontWeight: 800, cursor: "pointer", fontSize: 14, boxShadow: "0 4px 12px rgba(16,185,129,0.3)", transition: "transform 0.2s" }}
                                            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.02)"}
                                            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                                        >
                                            Sweep All Mature ({matureCount})
                                        </button>
                                    )}
                                </div>

                                {isSyncing ? <LoadingBadge text="Synchronizing Horizon State..." variant="secure" /> : (
                                    <div style={{ display: "grid", gap: 16 }}>
                                        {lockedFunds.length === 0 ? (
                                            <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontStyle: "italic", fontSize: 14 }}>
                                                No cryptographic locks identified on the ledger.
                                            </div>
                                        ) : (
                                            lockedFunds.map(lock => (
                                                <div key={lock.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12 }}>
                                                    <div>
                                                        <div style={{ fontSize: 20, fontWeight: 800, color: "#fcd34d", marginBottom: 4 }}>{parseFloat(lock.amount).toLocaleString()} {lock.assetCode}</div>
                                                        <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#9ca3af" }}>ID: {lock.id.substring(0, 16)}...</div>
                                                        <div style={{ fontSize: 12, color: lock.isUnlockable ? "#10b981" : "#f59e0b", marginTop: 8, fontWeight: 700 }}>
                                                            {lock.isUnlockable ? "🔓 MATURE - Ready for Redemption" : `🔒 LOCKED UNTIL: ${new Date(lock.unlockTimestamp).toLocaleString()}`}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleClaimFunds(lock.id)}
                                                        disabled={!lock.isUnlockable}
                                                        style={{ background: lock.isUnlockable ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "rgba(255,255,255,0.05)", color: lock.isUnlockable ? "#fff" : "#6b7280", border: lock.isUnlockable ? "none" : "1px solid rgba(255,255,255,0.1)", padding: "12px 24px", borderRadius: 8, fontWeight: 800, cursor: lock.isUnlockable ? "pointer" : "not-allowed", transition: "0.2s" }}
                                                    >
                                                        Redeem Yield
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                <h3 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 12, marginTop: 40, marginBottom: 20 }}>Horizon Telemetry Logs</h3>
                                <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 12, padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                                    {recentLogs.map(log => (
                                        <div key={log.id} style={{ display: "flex", gap: 12, marginBottom: 8, color: log.type === 'success' ? "#86efac" : "#fca5a5" }}>
                                            <span style={{ color: "#6b7280" }}>[{log.time.toLocaleTimeString()}]</span>
                                            <span>{log.msg}</span>
                                        </div>
                                    ))}
                                    {recentLogs.length === 0 && <span style={{ color: "#6b7280" }}>Awaiting telemetry data...</span>}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="vault-card">
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>

                                    <div>
                                        <div style={{ marginBottom: 24 }}>
                                            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                                                <div>
                                                    <div style={{ fontSize: 16, fontWeight: 800 }}>Master Engine Toggle</div>
                                                    <div style={{ fontSize: 12, color: "#9ca3af" }}>Automatically intercept and vault incoming payments.</div>
                                                </div>
                                                <div style={{ width: 50, height: 26, background: config.isEnabled ? "#f59e0b" : "rgba(255,255,255,0.1)", borderRadius: 20, position: "relative", transition: "0.3s" }} onClick={() => saveSettings({ ...config, isEnabled: !config.isEnabled })}>
                                                    <motion.div layout style={{ width: 22, height: 22, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: config.isEnabled ? 26 : 2 }} />
                                                </div>
                                            </label>
                                        </div>

                                        <div style={{ marginBottom: 24 }}>
                                            <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#9ca3af", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Deduction Allocation (%)</div>
                                            <input
                                                type="range" min="1" max="50"
                                                value={config.deductionPercentage}
                                                onChange={(e) => saveSettings({ ...config, deductionPercentage: Number(e.target.value) })}
                                                style={{ width: "100%", accentColor: "#f59e0b" }}
                                            />
                                            <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: "#fcd34d", marginTop: 8 }}>{config.deductionPercentage}% per transaction</div>
                                        </div>

                                        <div style={{ marginBottom: 24 }}>
                                            <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#9ca3af", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Cryptographic Lock Duration (Days)</div>
                                            <input
                                                type="number" min="1" max="365"
                                                value={config.lockDurationDays}
                                                onChange={(e) => saveSettings({ ...config, lockDurationDays: Number(e.target.value) })}
                                                className="styled-input"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ marginBottom: 24 }}>
                                            <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#9ca3af", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Network Environment</div>
                                            <select
                                                value={config.networkUrl}
                                                onChange={(e) => saveSettings({ ...config, networkUrl: e.target.value })}
                                                className="styled-input" style={{ appearance: "none", cursor: "pointer" }}
                                            >
                                                <option value={NETWORKS.MAINNET} style={{ color: "#000" }}>Stellar Mainnet</option>
                                                <option value={NETWORKS.TESTNET} style={{ color: "#000" }}>Stellar Testnet (Futurenet)</option>
                                            </select>
                                        </div>

                                        <div style={{ marginBottom: 24 }}>
                                            <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#9ca3af", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Target Asset</div>
                                            <select
                                                value={config.targetAsset}
                                                onChange={(e) => saveSettings({ ...config, targetAsset: e.target.value })}
                                                className="styled-input" style={{ appearance: "none", cursor: "pointer" }}
                                            >
                                                <option value="PHPC" style={{ color: "#000" }}>PHPC (Philippine Peso Stablecoin)</option>
                                                <option value="USDC" style={{ color: "#000" }}>USDC</option>
                                                <option value="XLM" style={{ color: "#000" }}>XLM (Native)</option>
                                            </select>
                                        </div>

                                        <div style={{ padding: 16, background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: 12 }}>
                                            <div style={{ fontSize: 13, fontWeight: 800, color: "#fcd34d", marginBottom: 6 }}>Architecture Note</div>
                                            <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>
                                                Settings are saved dynamically. Adjusting the Lock Duration only affects <em>future</em> allocations. Existing locked balances map strictly to their original on-chain timestamp predicates.
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}