import React, { useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "../../contexts/WalletContext";
import { useNetwork } from "../../contexts/NetworkContext";
import { invokeSorobanContract } from "../../services/soroban";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";

export default function Soroban() {
    const { address: walletAddress, connect, isConnecting, signTx } = useWallet();
    const { networkConfig } = useNetwork();
    const [contractId, setContractId] = useState("");
    const [functionName, setFunctionName] = useState("hello");
    const [argumentValue, setArgumentValue] = useState("1");
    const [result, setResult] = useState<string | null>(null

    );
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const handleInvoke = async () => {
        setError(null);
        setResult(null);

        if (!walletAddress) {
            await connect("stellar-wallets-kit");
            return;
        }

        if (!contractId) {
            setError("Please enter the deployed contract ID.");
            return;
        }

        if (!networkConfig?.sorobanRpcUrl) {
            setError("Missing Soroban RPC URL in network configuration.");
            return;
        }

        setIsBusy(true);
        try {
            const response = await invokeSorobanContract({
                sourcePublicKey: walletAddress,
                contractId,
                functionName,
                functionArgs: [argumentValue],
                horizonUrl: networkConfig.horizonUrl,
                sorobanRpcUrl: networkConfig.sorobanRpcUrl,
                networkPassphrase: networkConfig.networkPassphrase,
                walletSign: signTx,
            });

            setResult(JSON.stringify(response, null, 2));
        } catch (err: any) {
            console.error("Soroban invocation failed:", err);
            setError(err?.message || String(err));
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} style={{ padding: 16 }}>
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Soroban Contract Demo</h1>
                <p style={{ color: "#9ca3af", fontSize: 14, maxWidth: 720, lineHeight: 1.7 }}>
                    Use your connected Stellar wallet to invoke a Soroban smart contract via the configured Horizon and Soroban RPC endpoints.
                </p>
            </div>

            <div style={{ display: "grid", gap: 18, maxWidth: 800 }}>
                <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 22 }}>
                    <label style={{ display: "block", marginBottom: 10, color: "#9ca3af", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>Connected Wallet</label>
                    <div style={{ background: "rgba(0,0,0,.3)", borderRadius: 10, padding: 16, color: "#fff", fontSize: 14, minHeight: 52, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <span>{walletAddress || "No wallet connected."}</span>
                        {!walletAddress && (
                            <button type="button" onClick={() => connect("stellar-wallets-kit")} disabled={isConnecting} style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", cursor: isConnecting ? "not-allowed" : "pointer", fontWeight: 700 }}>
                                {isConnecting ? "Connecting…" : "Connect Wallet"}
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 22 }}>
                    <div style={{ display: "grid", gap: 14 }}>
                        <div>
                            <label style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6, display: "block" }}>Contract ID</label>
                            <input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="Enter contract ID" style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,.08)", background: "rgba(0,0,0,.3)", color: "#fff", padding: "12px 14px", fontSize: 14 }} />
                        </div>

                        <div>
                            <label style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6, display: "block" }}>Function Name</label>
                            <input value={functionName} onChange={(e) => setFunctionName(e.target.value)} placeholder="e.g. hello" style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,.08)", background: "rgba(0,0,0,.3)", color: "#fff", padding: "12px 14px", fontSize: 14 }} />
                        </div>

                        <div>
                            <label style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6, display: "block" }}>Argument Value</label>
                            <input value={argumentValue} onChange={(e) => setArgumentValue(e.target.value)} placeholder="1" style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,.08)", background: "rgba(0,0,0,.3)", color: "#fff", padding: "12px 14px", fontSize: 14 }} />
                        </div>

                        <button type="button" onClick={handleInvoke} disabled={isBusy || !walletAddress} style={{ width: "100%", borderRadius: 12, border: "none", background: isBusy ? "rgba(255,255,255,.1)" : "linear-gradient(135deg,#22c55e,#14b8a6)", color: "#fff", padding: "14px 18px", fontSize: 15, fontWeight: 700, cursor: isBusy ? "wait" : "pointer" }}>
                            {isBusy ? <LoadingBadge text="Submitting to Soroban…" variant="secure" /> : "Invoke Contract"}
                        </button>

                        {error && <div style={{ color: "#fca5a5", fontSize: 13, background: "rgba(248,113,113,0.12)", borderRadius: 10, padding: "12px" }}>{error}</div>}
                        {result && <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#d1d5db", background: "rgba(15,23,42,.8)", padding: "14px", borderRadius: 12, fontSize: 13, overflowX: "auto" }}>{result}</pre>}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
