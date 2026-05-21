import React, { useState, useEffect } from 'react';
import { isConnected, requestAccess } from '@stellar/freighter-api';
import { auth, db } from '../../config/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
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
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [monthlyUsage, setMonthlyUsage] = useState<number>(0);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [freeTierLimit, setFreeTierLimit] = useState<number>(100000);

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
  }, []);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      const connected = await isConnected();
      if (!connected || connected.error || !connected.isConnected) {
        alert("Freighter is not installed! Please install the browser extension.");
        setIsConnecting(false);
        return;
      }

      const access = await requestAccess();
      if (!access || access.error || !access.address) {
        console.error("User denied access or failed to obtain Freighter address", access?.error);
        setIsConnecting(false);
        return;
      }

      const publicKey = access.address;
      setStellarAddress(publicKey);

      if (user) {
        const userRef = doc(db, "merchants", user.uid);
        await setDoc(userRef, { stellarPublicKey: publicKey }, { merge: true });
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
    }
    setIsConnecting(false);
  };

  const disconnectWallet = async () => {
    setStellarAddress("");
    if (user) {
      const userRef = doc(db, "merchants", user.uid);
      await updateDoc(userRef, { stellarPublicKey: "" });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ padding: "4px" }}>
      <style>{`
        .st-grid-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .st-header-block { margin-bottom: 24px; }
        .st-header-block h1 { fontSize: 30px; fontWeight: 800; color: #fff; margin-bottom: 4px; fontFamily: 'Nunito', sans-serif; letterSpacing: -0.02em; }
        .st-header-block p { color: #9ca3af; fontSize: 13px; margin: 0; }
        .st-panel-card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; }
        .st-card-header { padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,.06); fontSize: 13px; fontWeight: 600; color: #e5e7eb; }
        .st-card-body { padding: 20px; flex: 1; display: flex; flex-direction: column; }

        @media (max-width: 992px) {
          .st-grid-layout { grid-template-columns: 1fr; gap: 16px; }
          .st-panel-card { min-height: auto; }
        }
      `}</style>

      <div className="st-header-block">
        <h1>Dashboard Overview</h1>
        <p>Monitor your monthly limits and connected services.</p>
      </div>

      <MonthlyUsageCard
        monthlyUsage={monthlyUsage}
        isSubscribed={isSubscribed}
        usageLimit={freeTierLimit}
      />

      <div className="st-header-block" style={{ marginTop: 40 }}>
        <h1>Settings</h1>
        <p>Manage your profile and connect your wallet.</p>
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

            {merchantData?.preferences && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: "auto" }}>
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
            )}
          </div>
        </div>

        <div className="st-panel-card">
          <div className="st-card-header">Connected Wallet</div>
          <div className="st-card-body">
            {stellarAddress ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(74,222,128,.08)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 8, marginBottom: 18, fontSize: 13, color: "#86efac" }}>
                  ✓ Freighter wallet connected
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Stellar Address</div>
                  <input readOnly value={stellarAddress} style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#9ca3af", fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }} />
                </div>
                <div style={{ marginTop: "auto" }}>
                  <button type="button" onClick={disconnectWallet} style={{ background: "rgba(248,113,113,.1)", color: "#f87171", border: "1px solid rgba(248,113,113,.25)", borderRadius: 7, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "'Nunito',sans-serif", transition: "all 0.2s" }}>
                    Disconnect Wallet
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(250,204,21,.08)", border: "1px solid rgba(250,204,21,.2)", borderRadius: 8, marginBottom: 18, fontSize: 13, color: "#fde047" }}>
                  ⚠ No wallet connected
                </div>
                <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>Connect your Freighter wallet to interact with the Stellar network.</p>
                <div style={{ marginTop: "auto" }}>
                  <button
                    type="button"
                    onClick={connectWallet}
                    disabled={isConnecting}
                    style={{ background: isConnecting ? "transparent" : "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", border: isConnecting ? "1px solid rgba(255,255,255,0.1)" : "none", borderRadius: 7, padding: "10px 16px", fontSize: 13, cursor: isConnecting ? "not-allowed" : "pointer", fontFamily: "'Nunito',sans-serif", fontWeight: 700, width: isConnecting ? "100%" : "auto" }}
                  >
                    {isConnecting ? <LoadingBadge text="Connecting..." variant="secure" /> : "Connect Freighter"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {stellarAddress && user && (
        <div style={{ marginTop: 24 }}>
          <InvoiceDashboard
            userUid={user.uid}
            stellarAddress={stellarAddress}
          />
        </div>
      )}
    </motion.div>
  );
}

