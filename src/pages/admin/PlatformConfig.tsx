// ==========================================
// 1. IMPORTS & TYPES
// ==========================================
import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../../config/firebase";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion, AnimatePresence } from "framer-motion";

interface GlobalConfig {
  freeTierMonthlyCap: number;
  proTierMonthlyFee: number;
  invoiceExpiryDefault: string;
  phpcIssuerAddress: string;
  pdaxAnchorUrl: string;
  stellarNetwork: string;
}

const DEFAULT_CONFIG: GlobalConfig = {
  freeTierMonthlyCap: 100000,
  proTierMonthlyFee: 499,
  invoiceExpiryDefault: "24 hours",
  phpcIssuerAddress: "GBSTRH...PHPC01",
  pdaxAnchorUrl: "https://anchor.pdax.ph",
  stellarNetwork: "Mainnet (Public)"
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

  // ==========================================
  // 3. FIREBASE FETCH (ON MOUNT)
  // ==========================================
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const configRef = doc(db, "system_config", "global");
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
          setConfig({ ...DEFAULT_CONFIG, ...configSnap.data() } as GlobalConfig);
        } else {
          // If no config exists yet, initialize it with defaults
          await setDoc(configRef, DEFAULT_CONFIG);
        }
      } catch (error) {
        console.error("Failed to load platform config:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // ==========================================
  // 4. ACTION HANDLERS
  // ==========================================

  // Update state for input fields
  const handleConfigChange = (field: keyof GlobalConfig, value: string | number) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  // Save Config to Firestore
  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const configRef = doc(db, "system_config", "global");
      await setDoc(configRef, config, { merge: true });
      // Optional: Add a toast notification here
    } catch (error) {
      console.error("Failed to save config:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Batch suspend all Free Tier merchants
  const handleSuspendFreeMerchants = async () => {
    if (!window.confirm("CRITICAL WARNING: This will immediately suspend all Free Tier merchants. Proceed?")) return;

    setIsSuspending(true);
    try {
      // Query merchants where isSubscribed is false or undefined
      const q = query(collection(db, "merchants"), where("isSubscribed", "==", false));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert("No free merchants found to suspend.");
        setIsSuspending(false);
        return;
      }

      // Execute a bulk batch update
      const batch = writeBatch(db);
      querySnapshot.forEach((document) => {
        batch.update(document.ref, { status: "Suspended" });
      });

      await batch.commit();
      alert(`Successfully suspended ${querySnapshot.size} free merchants.`);
    } catch (error) {
      console.error("Failed to suspend merchants:", error);
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
        <LoadingBadge text="Loading System Config..." variant="secure" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>

      {/* HEADER */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Platform Config</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>Global settings for the Lux PH network</p>
        </div>

        {/* GLOBAL SAVE BUTTON */}
        <button
          onClick={handleSaveConfig}
          disabled={isSaving}
          style={{
            background: isSaving ? "#4b5563" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
            color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px",
            fontWeight: 800, fontSize: 13, cursor: isSaving ? "wait" : "pointer",
            fontFamily: "'Nunito',sans-serif", display: "flex", alignItems: "center", gap: 8
          }}
        >
          {isSaving ? <LoadingBadge text="Saving..." variant="secure" /> : "Save All Configurations"}
        </button>
      </div>

      {/* CONFIGURATION GRIDS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* BLOCK 1: TIER LIMITS */}
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>Tier Limits</div>
          <div style={{ padding: 20 }}>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Invoice Expiry Default</div>
              <select
                value={config.invoiceExpiryDefault}
                onChange={(e) => handleConfigChange("invoiceExpiryDefault", e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "'Nunito',sans-serif" }}
              >
                {["30 minutes", "1 hour", "24 hours"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Free Tier Monthly Cap (PHPC)</div>
              <input
                type="number"
                value={config.freeTierMonthlyCap}
                onChange={(e) => handleConfigChange("freeTierMonthlyCap", Number(e.target.value))}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#e5e7eb", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'Nunito',sans-serif" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Pro Tier Monthly Fee (₱)</div>
              <input
                type="number"
                value={config.proTierMonthlyFee}
                onChange={(e) => handleConfigChange("proTierMonthlyFee", Number(e.target.value))}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#e5e7eb", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'Nunito',sans-serif" }}
              />
            </div>

          </div>
        </div>

        {/* BLOCK 2: NETWORK SETTINGS */}
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>Network</div>
          <div style={{ padding: 20 }}>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Stellar Network</div>
              <select
                value={config.stellarNetwork}
                onChange={(e) => handleConfigChange("stellarNetwork", e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "'Nunito',sans-serif" }}
              >
                {["Mainnet (Public)", "Testnet (Futurenet)"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>PHPC Issuer Address</div>
              <input
                type="text"
                value={config.phpcIssuerAddress}
                onChange={(e) => handleConfigChange("phpcIssuerAddress", e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#e5e7eb", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>PDAX Anchor URL</div>
              <input
                type="text"
                value={config.pdaxAnchorUrl}
                onChange={(e) => handleConfigChange("pdaxAnchorUrl", e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#e5e7eb", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'Nunito',sans-serif" }}
              />
            </div>

          </div>
        </div>
      </div>

      {/* BLOCK 3: DANGER ZONE */}
      <div style={{ marginTop: 20, background: "rgba(248,113,113,.05)", border: "1px solid rgba(248,113,113,.2)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(248,113,113,.15)", fontSize: 13, fontWeight: 800, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Danger Zone
        </div>
        <div style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e5e7eb", marginBottom: 4 }}>Suspend all Free tier merchants</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>This will immediately disable operations for all non-subscribed merchant accounts on the network.</div>
          </div>
          <button
            onClick={handleSuspendFreeMerchants}
            disabled={isSuspending}
            style={{
              background: "rgba(248,113,113,.1)", color: "#f87171", border: "1px solid rgba(248,113,113,.3)",
              borderRadius: 8, padding: "9px 18px", fontWeight: 800, fontSize: 13,
              cursor: isSuspending ? "wait" : "pointer", fontFamily: "'Nunito',sans-serif", flexShrink: 0
            }}
          >
            {isSuspending ? <LoadingBadge text="Suspending..." variant="warning" /> : "Suspend All Free"}
          </button>
        </div>
      </div>

    </motion.div>
  );
}