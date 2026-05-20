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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {

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
            if (data.timestamp) {
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
      const hasFreighter = await isConnected();
      if (!hasFreighter) {
        alert("Freighter is not installed! Please install the browser extension.");
        setIsConnecting(false);
        return;
      }

      const access = await requestAccess();
      if (access.error) {
        console.error("User denied access");
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
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>
          Dashboard Overview
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Monitor your monthly limits and connected services.</p>
      </div>

      <MonthlyUsageCard
        monthlyUsage={monthlyUsage}
        isSubscribed={isSubscribed}
        usageLimit={5000}
      />

      <div style={{ marginBottom: 24, marginTop: 40 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>
          Settings
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Manage your profile and connect your wallet.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>
            Account Profile
          </div>
          <div style={{ padding: 20 }}>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontFamily: "'Nunito',sans-serif", fontWeight: 800, color: "#fff" }}>
                {merchantData?.businessName ? merchantData.businessName.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : "U")}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff" }}>
                  {merchantData?.businessName || "Loading..."}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {merchantData?.email || user?.email || "Loading..."}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Email</div>
              <input type="email" readOnly value={merchantData?.email || user?.email || ""} style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'Nunito',sans-serif" }} />
            </div>

            {merchantData?.preferences && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Currency</div>
                  <div style={{ width: "100%", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, fontFamily: "'DM Mono',monospace" }}>
                    {merchantData.preferences.currency}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Invoices</div>
                  <div style={{ width: "100%", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, fontFamily: "'DM Mono',monospace" }}>
                    {merchantData.invoicesGenerated}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>
            Connected Wallet
          </div>
          <div style={{ padding: 20 }}>
            {stellarAddress ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(74,222,128,.08)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 8, marginBottom: 18, fontSize: 13, color: "#86efac" }}>
                  ✓ Freighter wallet connected
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Stellar Address</div>
                  <input readOnly value={stellarAddress} style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#9ca3af", fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }} />
                </div>
                <button onClick={disconnectWallet} style={{ background: "rgba(248,113,113,.1)", color: "#f87171", border: "1px solid rgba(248,113,113,.25)", borderRadius: 7, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "'Nunito',sans-serif", transition: "all 0.2s" }}>
                  Disconnect Wallet
                </button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(250,204,21,.08)", border: "1px solid rgba(250,204,21,.2)", borderRadius: 8, marginBottom: 18, fontSize: 13, color: "#fde047" }}>
                  ⚠ No wallet connected
                </div>
                <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>Connect your Freighter wallet to interact with the Stellar network.</p>
                <button
                  onClick={connectWallet}
                  disabled={isConnecting}
                  style={{ background: isConnecting ? "transparent" : "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", border: isConnecting ? "1px solid rgba(255,255,255,0.1)" : "none", borderRadius: 7, padding: "10px 16px", fontSize: 13, cursor: isConnecting ? "not-allowed" : "pointer", fontFamily: "'Nunito',sans-serif", fontWeight: 700 }}
                >
                  {isConnecting ? <LoadingBadge text="Connecting..." variant="secure" /> : "Connect Freighter"}
                </button>
              </>
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