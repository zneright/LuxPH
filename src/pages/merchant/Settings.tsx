import React, { useState, useEffect } from 'react';
import { auth, db } from '../../config/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useWallet } from '../../contexts/WalletContext';
import { doc, getDoc, setDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion } from "framer-motion";
import { QRCodeCanvas } from "qrcode.react";

interface MerchantData {
  businessName: string;
  email: string;
  stellarPublicKey?: string;
  isSubscribed?: boolean;
}

// 🚀 Helper to convert the exact AnimatedLogo SVG into an Image for Canvas
const generateLuxLogoImage = (): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    // Note: '#' is encoded as '%23' for the data URI
    const svg = `
      <svg width="240" height="240" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="luxGrad" x1="44" y1="40" x2="196" y2="196" gradientUnits="userSpaceOnUse">
            <stop stop-color="%2322C55E" />
            <stop offset="0.55" stop-color="%238B5CF6" />
            <stop offset="1" stop-color="%233B82F6" />
          </linearGradient>
        </defs>
        <path d="M76 42V134 C76 160 94 178 120 178H186" stroke="url(%23luxGrad)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="44" y="24" width="64" height="64" rx="20" fill="%2322C55E" />
        <rect x="154" y="146" width="64" height="64" rx="20" fill="%233B82F6" />
      </svg>
    `;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${svg}`;
  });
};

export default function Settings() {
  const [user, setUser] = useState<User | null>(null);
  const [merchantData, setMerchantData] = useState<MerchantData | null>(null);
  const [stellarAddress, setStellarAddress] = useState<string>("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const {
    address: walletAddress,
    walletName,
    isConnecting,
    connect: connectWalletAdapter,
    disconnect: disconnectWalletAdapter
  } = useWallet();

  const [monthlyUsage, setMonthlyUsage] = useState<number>(0);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [freeTierLimit, setFreeTierLimit] = useState<number>(100000);
  const [isGeneratingStandee, setIsGeneratingStandee] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const configSnap = await getDoc(doc(db, "system_config", "global"));
          if (configSnap.exists() && configSnap.data().freeTierMonthlyCap) {
            setFreeTierLimit(Number(configSnap.data().freeTierMonthlyCap));
          }
        } catch (err) {
          console.error("Config fetch error:", err);
        }

        const merchantDoc = await getDoc(doc(db, "merchants", currentUser.uid));
        if (merchantDoc.exists()) {
          const data = merchantDoc.data() as MerchantData;
          setMerchantData(data);
          setIsSubscribed(data.isSubscribed === true);
          if (data.stellarPublicKey) setStellarAddress(data.stellarPublicKey);
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
          console.error("Usage fetch error:", err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && walletAddress && merchantData && walletAddress !== merchantData.stellarPublicKey) {
      const syncNewAddress = async () => {
        try {
          await setDoc(doc(db, "merchants", user.uid), {
            stellarPublicKey: walletAddress,
            encryptedSecretKey: "",
            vaultConfig: { isEnabled: false }
          }, { merge: true });
          setStellarAddress(walletAddress);
          setMerchantData({ ...merchantData, stellarPublicKey: walletAddress });
        } catch (error) {
          console.error("Sync error:", error);
        }
      };
      syncNewAddress();
    }
  }, [walletAddress, user, merchantData]);

  const connectWallet = async () => await connectWalletAdapter('stellar-wallets-kit');

  const disconnectWallet = async () => {
    await disconnectWalletAdapter();
    setStellarAddress("");
    if (user) {
      await updateDoc(doc(db, "merchants", user.uid), {
        stellarPublicKey: "", encryptedSecretKey: "", "vaultConfig.isEnabled": false
      });
      setMerchantData(prev => prev ? { ...prev, stellarPublicKey: "" } : null);
    }
  };

  const getWalletDisplayName = () => {
    const rawName = (walletName || "App").toLowerCase();
    if (rawName.includes("lobstr")) return "Lobstr Vault";
    if (rawName.includes("freighter")) return "Freighter";
    if (rawName.includes("xbull")) return "xBull Wallet";
    return rawName.charAt(0).toUpperCase() + rawName.slice(1);
  };

  const offlineUri = stellarAddress ? `web+stellar:pay?destination=${stellarAddress}&memo=OFFLINE-QR&memo_type=text` : "";

  // 🚀 STANDEE GENERATOR: Dynamic Font Sizing & Logo Overlay
  const handleDownloadStandee = async () => {
    setIsGeneratingStandee(true);
    try {
      const qrCanvas = document.getElementById("hidden-qr-canvas") as HTMLCanvasElement;
      if (!qrCanvas) throw new Error("QR Canvas missing");

      const logoImg = await generateLuxLogoImage();

      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 1200;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context failed");

      // 1. Clean White Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 800, 1200);

      // 2. Premium Emerald/Blue Header Wave
      const grad = ctx.createLinearGradient(0, 0, 800, 0);
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(1, "#3b82f6");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(800, 0);
      ctx.lineTo(800, 240);
      ctx.quadraticCurveTo(400, 300, 0, 200);
      ctx.fill();

      // 3. Removed redundant header logo as requested
      // ctx.drawImage(logoImg, 340, 40, 120, 120);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 40px Arial";
      ctx.textAlign = "center";
      // Moved the text up slightly to balance the missing logo
      ctx.fillText("LUX PH", 400, 130);

      // 4. Store Branding & DYNAMIC FONT SIZING
      ctx.fillStyle = "#111827";
      ctx.font = "bold 20px monospace";
      ctx.letterSpacing = "2px";
      ctx.fillText("OFFICIAL MERCHANT", 400, 320);

      const bName = merchantData?.businessName || "Store";

      // 🚀 Auto-shrink font until it fits inside the Standee Width (max 700px)
      let fontSize = 56;
      ctx.font = `bold ${fontSize}px Arial`;
      while (ctx.measureText(bName).width > 700 && fontSize > 24) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px Arial`;
      }

      ctx.fillStyle = "#111827";
      ctx.fillText(bName, 400, 390);

      ctx.fillStyle = "#6b7280";
      ctx.font = "26px Arial";
      ctx.letterSpacing = "0px";
      ctx.fillText("Scan to pay securely via Stellar Network", 400, 440);

      // 5. Draw QR Code Frame & Shadow
      ctx.shadowColor = "rgba(0,0,0,0.1)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 20;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(160, 520, 480, 480, 40);
      ctx.fill();
      ctx.shadowColor = "transparent";

      ctx.strokeStyle = "#f3f4f6";
      ctx.lineWidth = 4;
      ctx.stroke();

      // 6. Draw Actual QR Code
      ctx.drawImage(qrCanvas, 200, 560, 400, 400);

      // 7. Draw the Logo smack in the middle of the QR Code!
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(400, 760, 50, 0, 2 * Math.PI); // Center X: 400, Center Y: 760
      ctx.fill();
      ctx.drawImage(logoImg, 355, 715, 90, 90);

      // 8. Footer Meta
      ctx.fillStyle = "#9ca3af";
      ctx.font = "bold 20px monospace";
      ctx.letterSpacing = "1px";
      ctx.fillText("NETWORK REF: OFFLINE-QR", 400, 1100);

      // 9. Trigger Download
      const link = document.createElement("a");
      link.download = `LuxPH_Standee_${bName.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error(err);
      alert("Failed to generate Standee.");
    } finally {
      setIsGeneratingStandee(false);
    }
  };

  const bentoVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 15 },
    show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "16px", maxWidth: 1000, margin: "0 auto", boxSizing: "border-box" }}>

      <style>{`
        /* 🚀 Fully Responsive Bento Grid */
        .bento-header { margin-bottom: 24px; padding-left: 8px; }
        .bento-header h1 { font-size: clamp(28px, 4vw, 36px); font-weight: 900; color: #111827; margin: 0 0 4px 0; font-family: 'Nunito', sans-serif; letter-spacing: -0.02em; }
        .bento-header p { color: #6b7280; font-size: 15px; margin: 0; font-weight: 500; }

        .bento-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
        }
        
        @media (min-width: 768px) {
            .bento-grid { grid-template-columns: repeat(2, 1fr); gap: 24px; }
            .col-span-2 { grid-column: span 2; }
        }

        .bento-card {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 32px;
            padding: 28px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.02);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
        }
        .bento-card:hover {
            box-shadow: 0 15px 35px -5px rgba(0,0,0,0.06);
            border-color: #d1d5db;
        }

        /* Gradient Overlays for aesthetics */
        .bento-gradient-top { position: absolute; top: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #3b82f6, #8b5cf6); }
        .bento-gradient-green { background: linear-gradient(90deg, #10b981, #059669); }

        .bento-title { font-size: 16px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'DM Mono', monospace; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }

        /* Inputs & Buttons */
        .bento-input { width: 100%; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 16px 20px; color: #111827; font-size: 15px; outline: none; font-family: 'DM Mono', monospace; font-weight: 700; transition: border 0.2s; box-sizing: border-box; }
        .bento-input:focus { border-color: #8b5cf6; background: #fff; }

        .bento-btn-primary { background: linear-gradient(135deg, #111827, #374151); color: #fff; border: none; border-radius: 16px; padding: 18px 24px; font-size: 15px; font-weight: 800; cursor: pointer; font-family: 'Nunito', sans-serif; transition: all 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; display: flex; justify-content: center; align-items: center; gap: 8px; box-sizing: border-box; }
        .bento-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); }
        .bento-btn-primary:active { transform: scale(0.97); }

        .bento-btn-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 16px; padding: 14px 20px; font-size: 14px; font-weight: 800; cursor: pointer; font-family: 'Nunito', sans-serif; transition: all 0.2s; width: 100%; box-sizing: border-box; }
        .bento-btn-danger:hover { background: #fee2e2; }

        .app-link { background: #f3f4f6; color: #374151; padding: 10px 16px; border-radius: 12px; font-size: 13px; font-weight: 800; text-decoration: none; border: 1px solid #e5e7eb; transition: all 0.2s; display: flex; flex: 1; justify-content: center; align-items: center; gap: 6px; box-sizing: border-box; white-space: nowrap; }
        .app-link:hover { background: #e5e7eb; border-color: #d1d5db; }
        
        .identity-flex { display: flex; align-items: center; gap: 20px; margin-bottom: 24px; }
        .identity-avatar { width: 72px; height: 72px; border-radius: 20px; background: linear-gradient(135deg,#8b5cf6,#6366f1); display: flex; align-items: center; justify-content: center; font-size: 32px; font-family: 'Nunito',sans-serif; font-weight: 900; color: #fff; flex-shrink: 0; box-shadow: 0 8px 20px rgba(139,92,246,0.3); }
        .links-row { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; margin-top: auto; }

        /* 🚀 Mobile scattered fix / Non-bento style */
        @media (max-width: 768px) {
          .bento-grid { 
            display: flex; 
            flex-direction: column; 
            gap: 0; 
          }
          .bento-card { 
            padding: 24px 0; 
            border: none; 
            border-radius: 0; 
            box-shadow: none; 
            border-bottom: 1px solid #e5e7eb; 
            background: transparent !important; 
          }
          .bento-card:last-child {
            border-bottom: none;
          }
          .bento-gradient-top { display: none; }
          
          .identity-flex { flex-direction: row; align-items: center; gap: 16px; }
          .identity-avatar { width: 56px; height: 56px; font-size: 24px; border-radius: 16px; }
          
          .standee-preview-container { 
            width: 100%; 
            max-width: 280px; 
            margin: 24px auto 0 auto; 
            transform: none !important; /* Disables rotation on mobile to save space */
          }
          
          .standee-flex-row { flex-direction: column; text-align: center; }
          .standee-flex-row button { justify-content: center; width: 100%; }
          
          .links-row { flex-direction: column; }
          .app-link { width: 100%; }
        }
      `}</style>

      {/* Hidden QR for Canvas extraction */}
      <div style={{ display: "none" }}>
        {/* We use level="H" (High Error Correction) so the QR still works even with a logo covering the center */}
        <QRCodeCanvas id="hidden-qr-canvas" value={offlineUri} size={400} level="H" />
      </div>

      <div className="bento-header">
        <h1>Hub & Settings</h1>
        <p>Your business identity, wallet connections, and physical store tools.</p>
      </div>

      <motion.div variants={bentoVariants} initial="hidden" animate="show" className="bento-grid">

        {/* 1. PROFILE IDENTITY (Span 1) */}
        <motion.div variants={cardVariants} className="bento-card">
          <div className="bento-gradient-top"></div>
          <div className="bento-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            Identity
          </div>

          <div className="identity-flex">
            <div className="identity-avatar">
              {merchantData?.businessName ? merchantData.businessName.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : "U")}
            </div>
            <div style={{ overflow: "hidden", flex: 1, width: "100%", textAlign: "left" }}>
              <div style={{ fontSize: "clamp(20px, 5vw, 24px)", fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {merchantData?.businessName || "Loading..."}
              </div>
              <div style={{ fontSize: "14px", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {merchantData?.email || user?.email}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "auto" }}>
            <input type="email" readOnly value={merchantData?.email || user?.email || ""} className="bento-input" style={{ color: "#6b7280", background: "#f3f4f6" }} />
          </div>
        </motion.div>

        {/* 2. WALLET CONNECTION (Span 1) */}
        <motion.div variants={cardVariants} className="bento-card">
          <div className="bento-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
            Blockchain Link
          </div>

          {stellarAddress ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 8, padding: "8px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 99, marginBottom: 20, fontSize: 13, color: "#065f46", fontWeight: 800 }}>
                ✓ Linked via {getWalletDisplayName()}
              </div>
              <input readOnly value={stellarAddress} className="bento-input" style={{ marginBottom: "auto" }} />
              <div style={{ marginTop: 24 }}>
                <button onClick={disconnectWallet} className="bento-btn-danger">Disconnect Wallet</button>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111827", margin: "0 0 8px 0", fontFamily: "'Nunito', sans-serif" }}>App Required</h2>
              <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 24px 0", lineHeight: 1.5 }}>Link your wallet to generate physical QRs and interact with the ledger.</p>
              <button onClick={connectWallet} disabled={isConnecting} className="bento-btn-primary" style={{ marginBottom: 20, background: isConnecting ? "#e5e7eb" : undefined, color: isConnecting ? "#9ca3af" : undefined, boxShadow: isConnecting ? "none" : undefined }}>
                {isConnecting ? <LoadingBadge text="Connecting..." variant="secure" /> : "Connect Wallet App"}
              </button>

              <div className="links-row">
                <a href="https://lobstr.co/" target="_blank" rel="noreferrer" className="app-link">🦀 Lobstr</a>
                <a href="https://freighter.app/" target="_blank" rel="noreferrer" className="app-link">⚓ Freighter</a>
              </div>
            </div>
          )}
        </motion.div>

        {/* 3. MONTHLY USAGE (Full Width) */}
        <motion.div variants={cardVariants} className="col-span-2">
          <MonthlyUsageCard monthlyUsage={monthlyUsage} isSubscribed={isSubscribed} usageLimit={freeTierLimit} />
        </motion.div>

        {/* 4. OFFLINE STANDEE STUDIO (Full Width) */}
        {stellarAddress && (
          <motion.div variants={cardVariants} className="bento-card col-span-2" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9)", border: "1px solid #cbd5e1" }}>
            <div className="bento-gradient-top bento-gradient-green"></div>

            <div className="bento-title" style={{ color: "#0f172a" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg>
              Physical Store Tools
            </div>

            <div className="standee-flex-row" style={{ display: "flex", gap: 32, alignItems: "center" }}>

              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 900, color: "#0f172a", margin: "0 0 12px 0", fontFamily: "'Nunito',sans-serif", lineHeight: 1.1, letterSpacing: "-0.02em", textAlign: isMobile ? "center" : "left" }}>
                  Printable Pay Standee
                </h2>
                <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.6, marginBottom: 24, fontWeight: 500, textAlign: isMobile ? "center" : "left" }}>
                  Generate an ultra-high resolution, print-ready QR standee. Scanning this automatically injects an <strong>OFFLINE-QR</strong> tracking tag into the blockchain so you can track in-store sales on your ledger.
                </p>
                <button onClick={handleDownloadStandee} disabled={isGeneratingStandee} className="bento-btn-primary" style={{ background: "linear-gradient(135deg, #10b981, #059669)", width: isMobile ? "100%" : "max-content", padding: "16px 32px" }}>
                  {isGeneratingStandee ? "Rendering Canvas..." : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Download Print-Ready PNG
                    </>
                  )}
                </button>
              </div>

              {/* 🚀 Mobile-Optimized Interactive Preview Box */}
              <div className="standee-preview-container" style={{ background: "#fff", padding: 16, borderRadius: 24, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1)", border: "4px solid #fff", position: "relative", transform: isMobile ? "rotate(0deg)" : "rotate(2deg)" }}>
                <div style={{ background: "linear-gradient(135deg, #10b981, #3b82f6)", height: 60, borderRadius: 12, marginBottom: 12 }} />

                {/* Visual Fake QR Preview with Logo */}
                <div style={{ width: "100%", aspectRatio: "1/1", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <QRCodeCanvas value={offlineUri} size={140} level="H" fgColor="#0f172a" />
                  {/* Fake UI Preview Logo Overlay */}
                  <div style={{ position: "absolute", background: "#fff", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", padding: 4 }}>
                    {/* Miniature SVG representation of the logo just for the UI preview */}
                    <svg width="24" height="24" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M76 42V134 C76 160 94 178 120 178H186" stroke="#22C55E" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
                      <rect x="44" y="24" width="64" height="64" rx="20" fill="#22C55E" />
                      <rect x="154" y="146" width="64" height="64" rx="20" fill="#3B82F6" />
                    </svg>
                  </div>
                </div>

                <div style={{ height: 12, background: "#f1f5f9", borderRadius: 4, width: "60%", margin: "16px auto 0" }} />
              </div>

            </div>
          </motion.div>
        )}

      </motion.div>
    </motion.div>
  );
}