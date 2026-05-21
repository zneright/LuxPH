// ==========================================
// 1. IMPORTS & TYPES
// ==========================================
import { useState, useEffect } from "react";
import {
  doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch, type DocumentData,
  type QueryDocumentSnapshot
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion } from "framer-motion";

interface GlobalConfig {
  freeTierMonthlyCap: number;
  proTierMonthlyFee: number;
  invoiceExpiryDefault: string;
  phpcIssuerAddress: string;
  usdcIssuerAddress: string;
  stellarNetwork: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
}

const DEFAULT_CONFIG: GlobalConfig = {
  freeTierMonthlyCap: 100000,
  proTierMonthlyFee: 499,
  invoiceExpiryDefault: "24 hours",
  phpcIssuerAddress: "GBSTRH776KCSX6NRE4LHYOM3E5O6F4PC01MAINNETISSUER",
  usdcIssuerAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  stellarNetwork: "Testnet (Futurenet)",
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanRpcUrl: "https://rpc-futurenet.stellar.org",
};

// Helper utility to safely break arrays into chunks for safe multi-batch execution
const chunkArray = <T,>(array: T[], size: number): T[][] => {
  const chunked: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
};

// ==========================================
// 2. MAIN COMPONENT
// ==========================================
export default function PlatformConfig() {
  // --- STATE MANAGEMENT ---
  const [config, setConfig] = useState<GlobalConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);

  // Security locks to prevent accidental modifications to blockchain parameters
  const [isNetworkConfigUnlocked, setIsNetworkConfigUnlocked] = useState(false);

  // ==========================================
  // 3. FIREBASE FETCH (ON MOUNT)
  // ==========================================
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const configRef = doc(db, "system_config", "global");
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
          const systemData = configSnap.data();
          setConfig({
            freeTierMonthlyCap: systemData.freeTierMonthlyCap ?? DEFAULT_CONFIG.freeTierMonthlyCap,
            proTierMonthlyFee: systemData.proTierMonthlyFee ?? DEFAULT_CONFIG.proTierMonthlyFee,
            invoiceExpiryDefault: systemData.invoiceExpiryDefault ?? DEFAULT_CONFIG.invoiceExpiryDefault,
            phpcIssuerAddress: systemData.phpcIssuerAddress ?? DEFAULT_CONFIG.phpcIssuerAddress,
            usdcIssuerAddress: systemData.usdcIssuerAddress ?? DEFAULT_CONFIG.usdcIssuerAddress,
            stellarNetwork: systemData.stellarNetwork ?? DEFAULT_CONFIG.stellarNetwork,
            horizonUrl: systemData.horizonUrl ?? DEFAULT_CONFIG.horizonUrl,
            sorobanRpcUrl: systemData.sorobanRpcUrl ?? DEFAULT_CONFIG.sorobanRpcUrl,
          });
        } else {
          await setDoc(configRef, DEFAULT_CONFIG);
        }
      } catch (error) {
        console.error("BLOCKCHAIN_CONFIG_LOAD_FAILURE:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // ==========================================
  // 4. ACTION HANDLERS
  // ==========================================
  const handleConfigChange = (field: keyof GlobalConfig, value: string | number) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveConfig = async () => {
    // Standard Stellar public key validation pattern (G... 56 chars)
    const stellarAddressRegex = /^G[A-Z2-7]{55}$/;

    if (!stellarAddressRegex.test(config.phpcIssuerAddress)) {
      alert("CRITICAL ERROR: Invalid Stellar PHPC Issuer Address format. Must be a 56-character public key starting with 'G'.");
      return;
    }

    if (!stellarAddressRegex.test(config.usdcIssuerAddress)) {
      alert("CRITICAL ERROR: Invalid Stellar USDC Issuer Address format. Must be a 56-character public key starting with 'G'.");
      return;
    }

    setIsSaving(true);
    try {
      const configRef = doc(db, "system_config", "global");
      await setDoc(configRef, config, { merge: true });
      setIsNetworkConfigUnlocked(false);
      alert(`System configurations successfully integrated with environment: ${config.stellarNetwork}`);
    } catch (error) {
      console.error("ENVIRONMENT_CONFIG_SAVE_FAILURE:", error);
      alert("Failed to sync structural configuration with remote nodes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuspendFreeMerchants = async () => {
    const verificationPhrase = "SUSPEND ALL FREE TIER";
    const userConfirmation = window.prompt(
      `CRITICAL ADMINISTRATIVE DISASTER WARNING:\nThis will instantly take down and suspend operations for ALL non-subscribed merchant pipelines. To execute this, type exactly: "${verificationPhrase}"`
    );

    if (userConfirmation !== verificationPhrase) {
      alert("Action cancelled. Input did not match required safety parameters.");
      return;
    }

    setIsSuspending(true);
    try {
      const q = query(collection(db, "merchants"), where("isSubscribed", "==", false));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert("Zero free tier merchants resolved in search snapshot.");
        setIsSuspending(false);
        return;
      }

      const docsArray = querySnapshot.docs;
      const batchedChunks = chunkArray<QueryDocumentSnapshot<DocumentData, DocumentData>>(docsArray, 500);

      for (const chunk of batchedChunks) {
        const batch = writeBatch(db);
        chunk.forEach((document) => {
          batch.update(document.ref, { status: "Suspended", suspendedAt: new Date() });
        });
        await batch.commit();
      }

      alert(`Successfully secured and suspended ${querySnapshot.size} free tier merchant pipelines.`);
    } catch (error) {
      console.error("BATCH_SUSPENSION_CRASH:", error);
      alert("Batch operation failed mid-execution. Review system logs immediately.");
    } finally {
      setIsSuspending(false);
    }
  };

  // ==========================================
  // 5. RENDER UI
  // ==========================================
  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <LoadingBadge text="Loading Production Config..." variant="secure" />
      </div>
    );
  }

  const isTestnetActive = config.stellarNetwork.includes("Testnet");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} style={{ padding: "4px" }}>

      {/* HEADER SECTION */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, fontFamily: "system-ui, sans-serif", color: "#fff", marginBottom: 4, letterSpacing: "-0.02em" }}>
            Platform Configuration Gateway
          </h1>
          <p style={{ color: "#9ca3af", fontSize: 13, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: isTestnetActive ? "#f59e0b" : "#10b981" }} />
            Connected Environment: <strong style={{ color: isTestnetActive ? "#fbbf24" : "#34d399" }}>Stellar {config.stellarNetwork}</strong>
          </p>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={isSaving}
          style={{
            background: isSaving ? "#4b5563" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
            color: "#fff", border: "none", borderStyle: "none", borderRadius: 8, padding: "12px 24px",
            fontWeight: 700, fontSize: 13, cursor: isSaving ? "wait" : "pointer",
            display: "flex", alignItems: "center", gap: 8, transition: "opacity 0.2s"
          }}
        >
          {isSaving ? <LoadingBadge text="Syncing Nodes..." variant="secure" /> : "Commit All Changes"}
        </button>
      </div>

      {/* TWO COLUMN GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>

        {/* BLOCK 1: BUSINESS TIER PARAMS */}
        <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.05)", fontSize: 13, fontWeight: 700, color: "#f3f4f6", letterSpacing: "0.02em" }}>
            Tier Management Metrics
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                Runtime Stellar Network Configuration Layer
              </label>
              <select
                value={config.stellarNetwork}
                onChange={(e) => handleConfigChange("stellarNetwork", e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "11px 14px", color: "#fff", fontSize: 13, outline: "none" }}
              >
                <option value="Testnet (Futurenet)" style={{ background: "#1f2937" }}>Testnet (Futurenet / Testing Environment)</option>
                <option value="Mainnet (Public)" style={{ background: "#1f2937" }}>Mainnet (Public / Production Currency Hub)</option>
              </select>
            </div>

            {isNetworkConfigUnlocked && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                    Horizon URL
                  </label>
                  <input
                    type="text"
                    value={config.horizonUrl}
                    onChange={(e) => handleConfigChange("horizonUrl", e.target.value)}
                    style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "11px 14px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                    Soroban RPC URL
                  </label>
                  <input
                    type="text"
                    value={config.sorobanRpcUrl}
                    onChange={(e) => handleConfigChange("sorobanRpcUrl", e.target.value)}
                    style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "11px 14px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                Default Invoice Longevity
              </label>
              <select
                value={config.invoiceExpiryDefault}
                onChange={(e) => handleConfigChange("invoiceExpiryDefault", e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "11px 14px", color: "#fff", fontSize: 13, outline: "none" }}
              >
                {["30 minutes", "1 hour", "24 hours"].map(o => <option key={o} value={o} style={{ background: "#1f2937" }}>{o}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                Sandbox Tier Limit Threshold (PHPC Equivalent Volume)
              </label>
              <input
                type="number"
                value={config.freeTierMonthlyCap}
                onChange={(e) => handleConfigChange("freeTierMonthlyCap", Number(e.target.value))}
                style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "11px 14px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                Commercial Subscription Cost (PHP / Month)
              </label>
              <input
                type="number"
                value={config.proTierMonthlyFee}
                onChange={(e) => handleConfigChange("proTierMonthlyFee", Number(e.target.value))}
                style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "11px 14px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
        </div>

        {/* BLOCK 2: SECURED NETWORK SETTINGS */}
        <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.05)", fontSize: 13, fontWeight: 700, color: "#f3f4f6", display: "flex", justify- content: "space-between", alignItems: "center" }}>
          <span>Settlement Network Architecture</span>
          {!isNetworkConfigUnlocked && (
            <button
              onClick={() => setIsNetworkConfigUnlocked(true)}
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b", fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}
            >
              Unlock Architecture Fields
            </button>
          )}
        </div>
        <div style={{ padding: 20, opacity: isNetworkConfigUnlocked ? 1 : 0.65, transition: "opacity 0.2s" }}>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
              PHPC Token Core Mint/Issuer Address
            </label>
            <input
              type="text"
              disabled={!isNetworkConfigUnlocked}
              value={config.phpcIssuerAddress}
              onChange={(e) => handleConfigChange("phpcIssuerAddress", e.target.value)}
              style={{
                width: "100%",
                background: isNetworkConfigUnlocked ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.2)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 8, padding: "11px 14px",
                color: isNetworkConfigUnlocked ? "#fff" : "#9ca3af",
                fontSize: 13, outline: "none", boxSizing: "border-box",
                fontFamily: "'DM Mono',monospace",
                cursor: isNetworkConfigUnlocked ? "text" : "not-allowed"
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
              USDC Token Vault/Issuer Address
            </label>
            <input
              type="text"
              disabled={!isNetworkConfigUnlocked}
              value={config.usdcIssuerAddress}
              onChange={(e) => handleConfigChange("usdcIssuerAddress", e.target.value)}
              style={{
                width: "100%",
                background: isNetworkConfigUnlocked ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.2)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 8, padding: "11px 14px",
                color: isNetworkConfigUnlocked ? "#fff" : "#9ca3af",
                fontSize: 13, outline: "none", boxSizing: "border-box",
                fontFamily: "'DM Mono',monospace",
                cursor: isNetworkConfigUnlocked ? "text" : "not-allowed"
              }}
            />
          </div>
        </div>
      </div>
    </div>

      {/* BLOCK 3: HARDENED CRITICAL ACTIONS (DANGER ZONE) */ }
  <div style={{ marginTop: 20, background: "rgba(220,38,38,0.03)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 14, overflow: "hidden" }}>
    <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(220,38,38,0.15)", fontSize: 12, fontWeight: 800, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.06em" }}>
      Regulated Contingency Controls
    </div>
    <div style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
      <div style={{ minWidth: "260px", flex: 1 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: "#e5e7eb", margin: "0 0 4px 0" }}>Emergency Sandbox Suspension</h4>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, lineHeight: "1.4" }}>
          Batch updates state configurations across all Free Tier structures to <span style={{ color: "#ef4444", fontWeight: 600 }}>Suspended</span>. This breaks immediate access pipelines across non-authenticated merchant connections.
        </p>
      </div>
      <button
        onClick={handleSuspendFreeMerchants}
        disabled={isSuspending}
        style={{
          background: "rgba(220,38,38,0.1)", color: "#f87171", border: "1px solid rgba(220,38,38,0.3)",
          borderRadius: 8, padding: "12px 24px", fontWeight: 700, fontSize: 13,
          cursor: isSuspending ? "wait" : "pointer", flexShrink: 0, transition: "background 0.2s"
        }}
      >
        {isSuspending ? <LoadingBadge text="Executing Batches..." variant="warning" /> : "Decommission All Free Tiers"}
      </button>
    </div>
  </div>

    </motion.div >
  );
}