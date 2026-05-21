import React, { useState, useEffect } from 'react';
import { auth, db } from '../../config/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useWallet } from '../../contexts/WalletContext';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";
import InvoiceDashboard from './InvoiceDashboard';
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion } from "framer-motion";

interface MerchantData {
  businessName: string;
  email: string;
  invoicesGenerated: number;
  totalRevenue: number;
  stellarPublicKey?: string;
  isSubscribed?: boolean;
  preferences?: {
    currency: string;
    notificationsEnabled: boolean;
  };
}

export default function Settings() {
  const [user, setUser] = useState<User | null>(null);
  const [merchantData, setMerchantData] = useState<MerchantData | null>(null);
  const [stellarAddress, setStellarAddress] = useState<string>("");
  const { address: walletAddress, isConnecting, connect: connectWalletAdapter, disconnect: disconnectWalletAdapter } = useWallet();
  const [monthlyUsage, setMonthlyUsage] = useState<number>(0);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [freeTierLimit, setFreeTierLimit] = useState<number>(100000);
  const [contingencyPercentage, setContingencyPercentage] = useState<number>(0);
  const [contingencyLockValue, setContingencyLockValue] = useState<number>(30);
  const [contingencyLockUnit, setContingencyLockUnit] = useState<string>("days");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const configSnap = await getDoc(doc(db, "system_config", "global"));
          if (configSnap.exists()) {
            const configData = configSnap.data();
            if (configData.freeTierMonthlyCap) {
              setFreeTierLimit(Number(configData.freeTierMonthlyCap));
            }
          }
        } catch (err) {
          console.error("Failed to fetch dynamic platform cap limits:", err);
        }

        const merchantDoc = await getDoc(doc(db, "merchants", currentUser.uid));
        if (merchantDoc.exists()) {
          const data = merchantDoc.data() as MerchantData;
          setMerchantData(data);
          setIsSubscribed(data.isSubscribed === true);

          if (data.stellarPublicKey) {
            setStellarAddress(data.stellarPublicKey);
          }
          if ((data as any).contingencyConfig) {
            const cc = (data as any).contingencyConfig;
            setContingencyPercentage(Number(cc.percentage || 0));
            setContingencyLockValue(Number(cc.lockValue || 30));
            setContingencyLockUnit(cc.lockUnit || "days");
          }
        }

        try {
          const invoicesRef = collection(db, `merchants/${currentUser.uid}/invoices`);
          const snapshot = await getDocs(invoicesRef);

          let currentMonthVolume = 0;
          const now = new Date();

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.timestamp && data.status !== "failed" && data.status !== "cancelled") {
              const txDate = new Date(data.timestamp);
              if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
                currentMonthVolume += parseFloat(data.fiatAmount || data.amount || "0");
              }
            }
          });

          setMonthlyUsage(currentMonthVolume);
        } catch (err) {
          console.error("Failed to fetch usage data:", err);
        }
      }
    });

    return () => unsubscribe();
  }, [walletAddress, user, merchantData]);

  useEffect(() => {
    const effectiveAddress = walletAddress || merchantData?.stellarPublicKey || "";
    setStellarAddress(effectiveAddress);

    if (user && walletAddress && walletAddress !== merchantData?.stellarPublicKey) {
      const syncAddress = async () => {
        try {
          const userRef = doc(db, "merchants", user.uid);
          await setDoc(userRef, { stellarPublicKey: walletAddress }, { merge: true });
        } catch (error) {
          console.error("Failed to sync wallet address to merchant profile:", error);
        }
      };
      syncAddress();
    }
  }, [walletAddress, merchantData?.stellarPublicKey, user]);

  const connectWallet = async () => {
    await connectWalletAdapter('stellar-wallets-kit');
  };

  const disconnectWallet = async () => {
    await disconnectWalletAdapter();
    setStellarAddress("");
    if (user) {
      const userRef = doc(db, "merchants", user.uid);
      await updateDoc(userRef, { stellarPublicKey: "" });
    }
  };

  const saveContingencySettings = async () => {
    if (!user) return alert("Sign in to save contingency settings");
    try {
      const userRef = doc(db, "merchants", user.uid);
      await setDoc(userRef, { contingencyConfig: { percentage: contingencyPercentage, lockValue: contingencyLockValue, lockUnit: contingencyLockUnit } }, { merge: true });
      alert("Contingency settings saved.");
      const updated = await getDoc(userRef);
      if (updated.exists()) setMerchantData(updated.data() as MerchantData);
    } catch (err) {
      console.error("Failed to save contingency settings:", err);
      alert("Failed to save contingency settings.");
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ padding: "4px" }}>
      <style>{`
        .st-grid-layout { display: grid; grid-template-columns: 1fr; gap: 20px; }
        .st-header-block { margin-bottom: 24px; }
        .st-header-block h1 { fontSize: 30px; fontWeight: 800; color: #fff; margin-bottom: 4px; fontFamily: 'Nunito', sans-serif; letterSpacing: -0.02em; }
        .st-header-block p { color: #9ca3af; fontSize: 13px; margin: 0; }
        .st-panel-card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; }
        
        .st-wallet-banner { background: rgba(79, 70, 229, 0.05); border: 1px solid rgba(79, 70, 229, 0.2); border-radius: 12px; padding: 32px 24px; margin-bottom: 30px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .st-app-links { display: flex; gap: 12px; margin-top: 20px; justify-content: center; flex-wrap: wrap; }
        .st-app-link-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #e5e7eb; padding: 10px 16px; border-radius: 8px; fontSize: 12px; text-decoration: none; display: flex; align-items: center; gap: 8px; transition: all 0.2s; fontFamily: 'Nunito', sans-serif; font-weight: 600; }
        .st-app-link-btn:hover { background: rgba(255,255,255,0.1); transform: translateY(-1px); }
        
        .st-card-header { padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,.06); fontSize: 13px; fontWeight: 600; color: #e5e7eb; }
        .st-card-body { padding: 20px; flex: 1; display: flex; flex-direction: column; }
        
        @media (min-width: 992px) {
          .st-grid-layout { grid-template-columns: 1fr 1fr; }
        }

        /* 🚨 Standardized override for Stellar Wallets Kit 🚨 */
        stellar-wallets-modal,
        #stellar-wallets-kit-modal-root,
        [id^="stellar-wallets-modal"] {
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
        }
      `}</style>

      <div className="st-header-block">
        <h1>App Connection & Settings</h1>
        <p>Connect your wallet to interact with the Stellar network and manage your profile.</p>
      </div>

      <div className="st-wallet-banner">
        {stellarAddress ? (
          <div style={{ width: "100%", maxWidth: "500px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "rgba(74,222,128,.1)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 20, marginBottom: 20, fontSize: 13, color: "#86efac", fontWeight: 700 }}>
              ✓ App Linked Successfully
            </div>
            <div style={{ marginBottom: 20, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Active Stellar Address</div>
              <input readOnly value={stellarAddress} style={{ width: "100%", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px 16px", color: "#e5e7eb", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace", textAlign: "center" }} />
            </div>
            <button type="button" onClick={disconnectWallet} style={{ background: "rgba(248,113,113,.1)", color: "#f87171", border: "1px solid rgba(248,113,113,.25)", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Nunito',sans-serif", transition: "all 0.2s" }}>
              Disconnect App
            </button>
          </div>
        ) : (
          <div style={{ width: "100%", maxWidth: "450px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "rgba(250,204,21,.1)", border: "1px solid rgba(250,204,21,.2)", borderRadius: 20, marginBottom: 16, fontSize: 13, color: "#fde047", fontWeight: 700 }}>
              ⚠ Secure Connection Required
            </div>
            <h2 style={{ color: "#fff", fontSize: 22, fontFamily: "'Nunito',sans-serif", margin: "0 0 12px 0" }}>Link Your Wallet App</h2>
            <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 20, lineHeight: 1.5 }}>
              Click below to automatically launch the connection portal. If you are on mobile, it will route directly to your wallet app.
            </p>

            {/* 🚨 NEW: Desktop Extension Notice 🚨 */}
            <div style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "10px", padding: "14px", marginBottom: "24px", textAlign: "left" }}>
              <div style={{ fontSize: "13px", color: "#60a5fa", fontWeight: 800, marginBottom: "6px", fontFamily: "'Nunito',sans-serif", display: "flex", alignItems: "center", gap: "6px" }}>
                🖥️ Desktop Browser Setup
              </div>
              <div style={{ fontSize: "13px", color: "#d1d5db", lineHeight: "1.5" }}>
                If you are on a computer, you <strong>must</strong> have a wallet extension installed in Chrome/Brave (like Freighter) before connecting. Make sure it is unlocked!
              </div>
            </div>

            <button
              type="button"
              onClick={connectWallet}
              disabled={isConnecting}
              style={{ background: isConnecting ? "transparent" : "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", border: isConnecting ? "1px solid rgba(255,255,255,0.1)" : "none", borderRadius: 8, padding: "16px 24px", fontSize: 16, cursor: isConnecting ? "not-allowed" : "pointer", fontFamily: "'Nunito',sans-serif", fontWeight: 800, width: "100%", display: "flex", justifyContent: "center", boxShadow: "0 4px 14px rgba(79, 70, 229, 0.4)" }}
            >
              {isConnecting ? <LoadingBadge text="Connecting App..." variant="secure" /> : "Connect & Go to App"}
            </button>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Don't have a wallet extension yet? Get one here:</p>
              <div className="st-app-links">
                <a href="https://freighter.app/" target="_blank" rel="noreferrer" className="st-app-link-btn">
                  🚢 Get Freighter
                </a>
                <a href="https://lobstr.co/" target="_blank" rel="noreferrer" className="st-app-link-btn">
                  🦞 Get Lobstr
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      <MonthlyUsageCard
        monthlyUsage={monthlyUsage}
        isSubscribed={isSubscribed}
        usageLimit={freeTierLimit}
      />

      <div className="st-header-block" style={{ marginTop: 40 }}>
        <h1>Profile Settings</h1>
        <p>Manage your business profile and preferences.</p>
      </div>

      <div className="st-grid-layout">
        <div className="st-panel-card">
          <div className="st-card-header">Account Profile</div>
          <div className="st-card-body">
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#4f46e5)", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", fontSize: 24, fontFamily: "'Nunito',sans-serif", fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                {merchantData?.businessName ? merchantData.businessName.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : "U")}
              </div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {merchantData?.businessName || "Loading..."}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {merchantData?.email || user?.email || "Loading..."}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Email Address</div>
              <input type="email" readOnly value={merchantData?.email || user?.email || ""} style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'Nunito',sans-serif" }} />
            </div>
          </div>
        </div>

        {merchantData?.preferences && (
          <div className="st-panel-card">
            <div className="st-card-header">Preferences & Stats</div>
            <div className="st-card-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Currency</div>
                  <div style={{ width: "100%", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, fontFamily: "'DM Mono',monospace", boxSizing: "border-box" }}>
                    {merchantData.preferences.currency}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Invoices</div>
                  <div style={{ width: "100%", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, fontFamily: "'DM Mono',monospace", boxSizing: "border-box" }}>
                    {merchantData.invoicesGenerated}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {stellarAddress && user && (
        <div style={{ marginTop: 32 }}>
          <div className="st-header-block">
            <h1>Invoicing Engine</h1>
            <p>Generate and manage your ledger-anchored invoices directly.</p>
          </div>
          <InvoiceDashboard
            userUid={user.uid}
            stellarAddress={stellarAddress}
          />
        </div>
      )}
    </motion.div>
  );
}