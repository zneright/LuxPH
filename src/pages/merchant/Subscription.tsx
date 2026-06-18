import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { Horizon, TransactionBuilder, Networks, Operation, Asset } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";
import { useWallet } from "../../contexts/WalletContext";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const FALLBACK_TREASURY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const FALLBACK_USDC = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export default function Subscription() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [merchantAddress, setMerchantAddress] = useState<string>("");
  const [monthlyUsage, setMonthlyUsage] = useState<number>(0);

  const { signTx, walletName } = useWallet();

  const [sysConfig, setSysConfig] = useState({
    proFee: 499,
    freeCap: 100000,
    networkPassphrase: Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    phpcIssuer: FALLBACK_TREASURY,
    usdcIssuer: FALLBACK_USDC,
    treasuryAddress: FALLBACK_TREASURY
  });

  const [showModal, setShowModal] = useState<boolean>(false);
  const [selectedToken, setSelectedToken] = useState<"XLM" | "PHPC" | "USDC">("USDC");
  const [cryptoAmount, setCryptoAmount] = useState<string>("0.00");
  const [ratesData, setRatesData] = useState<any>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingMsg, setLoadingMsg] = useState("Initializing system...");

  useEffect(() => {
    const initSystem = async () => {
      try {
        const configSnap = await getDoc(doc(db, "system_config", "global"));
        let currentPassphrase = Networks.TESTNET;
        let currentHorizon = "https://horizon-testnet.stellar.org";
        let currentIssuer = FALLBACK_TREASURY;
        let currentUsdcIssuer = FALLBACK_TREASURY;
        let currentTreasury = FALLBACK_TREASURY;
        let currentProFee = 499;
        let currentFreeCap = 100000;

        if (configSnap.exists()) {
          const c = configSnap.data();
          const isTestnet = c.stellarNetwork === "Testnet (Futurenet)";
          currentPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;
          currentHorizon = isTestnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
          currentIssuer = c.phpcIssuerAddress || FALLBACK_TREASURY;
          currentUsdcIssuer = c.usdcIssuerAddress || FALLBACK_TREASURY;
          currentTreasury = c.phpcIssuerAddress || FALLBACK_TREASURY;
          currentProFee = c.proTierMonthlyFee || 499;
          currentFreeCap = c.freeTierMonthlyCap || 100000;

          setSysConfig({
            proFee: currentProFee,
            freeCap: currentFreeCap,
            networkPassphrase: currentPassphrase,
            horizonUrl: currentHorizon,
            phpcIssuer: currentIssuer,
            usdcIssuer: currentUsdcIssuer,
            treasuryAddress: currentTreasury
          });
        }

        onAuthStateChanged(auth, async (currentUser) => {
          setUser(currentUser);
          if (currentUser) {
            const merchantDoc = await getDoc(doc(db, "merchants", currentUser.uid));
            if (merchantDoc.exists()) {
              const data = merchantDoc.data();
              setIsSubscribed(data?.isSubscribed === true);
              if (data?.stellarPublicKey) {
                setMerchantAddress(data.stellarPublicKey);
              }
            }

            try {
              const invoicesSnap = await getDocs(collection(db, `merchants/${currentUser.uid}/invoices`));
              let currentMonthVolume = 0;
              const now = new Date();

              invoicesSnap.forEach((docSnap) => {
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
              console.error("Failed to fetch internal usage data:", err);
            }
          }
          setIsLoading(false);
        });
      } catch (err) {
        console.error("Initialization error:", err);
        setIsLoading(false);
      }
    };

    initSystem();
  }, []);

  useEffect(() => {
    if (!showModal) return;

    const fetchRates = async () => {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=stellar,usd-coin&vs_currencies=php`);
        const data = await res.json();
        setRatesData(data);
        calculateEquivalent(selectedToken, data);
      } catch (e) {
        console.error("Failed to fetch conversion rates for checkout");
      }
    };
    fetchRates();
  }, [showModal, selectedToken]);

  const calculateEquivalent = (token: "XLM" | "PHPC" | "USDC", data = ratesData) => {
    if (!data) return;
    const fee = sysConfig.proFee;

    if (token === "PHPC") {
      setCryptoAmount(parseFloat(fee.toString()).toFixed(2));
    } else if (token === "USDC") {
      const usdcToPhp = data['usd-coin'].php;
      const calc = fee / usdcToPhp;
      setCryptoAmount(parseFloat(calc.toString()).toFixed(5));
    } else if (token === "XLM") {
      const xlmToPhp = data.stellar.php;
      const calc = fee / xlmToPhp;
      setCryptoAmount(parseFloat(calc.toString()).toFixed(5));
    }
  };

  const handleTokenChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextToken = e.target.value as "XLM" | "PHPC" | "USDC";
    setSelectedToken(nextToken);
    calculateEquivalent(nextToken);
  };

  const handleStellarUpgrade = async () => {
    if (!user) return alert("Please login to proceed.");
    if (!merchantAddress) return alert("Please connect your wallet in Settings first.");

    setShowModal(false);
    setIsLoading(true);
    setLoadingMsg(`Preparing your ${selectedToken} transaction invoice...`);

    try {
      const server = new Horizon.Server(sysConfig.horizonUrl);
      const sourceAccount = await server.loadAccount(merchantAddress);

      let paymentAsset = Asset.native();
      if (selectedToken === "PHPC") {
        paymentAsset = new Asset("PHPC", sysConfig.phpcIssuer);
      } else if (selectedToken === "USDC") {
        paymentAsset = new Asset("USDC", sysConfig.usdcIssuer);
      }

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: "1000",
        networkPassphrase: sysConfig.networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination: sysConfig.treasuryAddress,
          asset: paymentAsset,
          amount: cryptoAmount,
        }))
        .setTimeout(30)
        .build();

      const displayWalletName = walletName ? (walletName.charAt(0).toUpperCase() + walletName.slice(1)) : "Wallet App";
      setLoadingMsg(`Awaiting signature from your ${displayWalletName}...`);

      const signedXdrString = await signTx(transaction.toXDR(), sysConfig.networkPassphrase);

      if (!signedXdrString) {
        throw new Error("Payment signature rejected or failed.");
      }

      setLoadingMsg("Confirming blockchain settlement...");

      const txBody = new URLSearchParams();
      txBody.append("tx", signedXdrString);

      const submitResponse = await fetch(`${sysConfig.horizonUrl}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: txBody.toString()
      });

      if (!submitResponse.ok) {
        throw new Error(`On-chain execution failed. Ensure you possess enough ${selectedToken} tokens.`);
      }

      setLoadingMsg("Activating premium tier features...");

      const userRef = doc(db, "merchants", user.uid);
      await updateDoc(userRef, { isSubscribed: true });

      setIsSubscribed(true);
      alert("🚀 Settlement Confirmed! Welcome to LuxPH Pro.");

    } catch (error: any) {
      console.error(error);
      alert(error.message || "Subscription payment failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDowngrade = async () => {
    if (!user) return;

    const confirmCancel = window.confirm(
      "Are you sure you want to unsubscribe and downgrade to the Standard tier?\n\n⚠️ Please note: Previous subscription payments are strictly non-refundable."
    );

    if (!confirmCancel) return;

    setIsLoading(true);
    setLoadingMsg("Downgrading to Standard Tier...");

    try {
      const userRef = doc(db, "merchants", user.uid);
      await updateDoc(userRef, { isSubscribed: false });

      setIsSubscribed(false);
      alert("You have successfully downgraded to the Standard Tier.");
    } catch (error) {
      console.error(error);
      alert("Failed to downgrade subscription. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ position: "relative", minHeight: "80vh", padding: "4px", boxSizing: "border-box" }}>
      <style>{`
        /* ULTRA-CLEAN LIGHT MODE SUBSCRIPTION UI */
        .sub-layout-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 20px; }
        .sub-plan-card { border-radius: 24px; padding: 32px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; }
        
        .sub-header-block { margin-bottom: 24px; }
        .sub-header-block h1 { font-size: 32px; font-weight: 900; color: #111827; margin-bottom: 4px; fontFamily: 'Nunito', sans-serif; letter-spacing: -0.02em; }
        .sub-header-block p { color: #6b7280; font-size: 15px; margin: 0; font-weight: 500; }
        
        .checkout-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .checkout-modal-box { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 24px; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); width: 100%; max-width: 440px; box-sizing: border-box; }

        @media (max-width: 768px) {
          .sub-layout-grid { grid-template-columns: 1fr; gap: 16px; }
          .sub-plan-card { padding: 24px; gap: 16px; }
        }
      `}</style>

      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>

      <div className="sub-header-block">
        <h1>Subscription</h1>
        <p>
          Currently on the {" "}
          <span style={{ color: isSubscribed ? "#059669" : "#6366f1", fontWeight: "800" }}>
            {isSubscribed ? "Pro Tier" : "Unsubscribed Tier"}
          </span>
        </p>
      </div>

      <MonthlyUsageCard
        monthlyUsage={monthlyUsage}
        isSubscribed={isSubscribed}
        usageLimit={sysConfig.freeCap}
      />

      <div className="sub-layout-grid" style={{ marginTop: "32px" }}>
        {[
          {
            name: "Standard",
            price: "₱0",
            period: "/ month",
            current: !isSubscribed,
            features: [
              ["✓", `Up to ₱${sysConfig.freeCap.toLocaleString()} monthly volume limit`],
              ["✓", "Unlimited invoices generated"],
              ["✓", "QR code generation"],
              ["–", "Advanced analytics tools"],
              ["–", "API production access"],
              ["–", "Priority customer support"]
            ]
          },
          {
            name: "Pro",
            price: `₱${sysConfig.proFee}`,
            period: "/ month",
            current: isSubscribed,
            features: [
              ["✓", "Unlimited monthly volume limit"],
              ["✓", "Unlimited invoices generated"],
              ["✓", "QR code generation"],
              ["✓", "Advanced analytics tools"],
              ["✓", "API production access"],
              ["✓", "Priority customer support"]
            ]
          },
        ].map(plan => (
          <div key={plan.name} className="sub-plan-card" style={{
            border: `1px solid ${plan.current ? "rgba(16,185,129,0.3)" : "#e5e7eb"}`,
            background: plan.current ? "#f0fdf4" : "#ffffff",
            boxShadow: plan.current ? "0 10px 30px rgba(16,185,129,0.1)" : "0 4px 6px rgba(0,0,0,0.02)"
          }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: plan.name === "Pro" ? "#059669" : "#374151", marginBottom: 6 }}>{plan.name}</div>
              <div style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#111827", marginBottom: 24 }}>{plan.price} <span style={{ fontSize: 15, color: "#6b7280", fontWeight: 600 }}>{plan.period}</span></div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {plan.features.map(([icon, feat], idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: icon === "✓" ? "#374151" : "#9ca3af", fontWeight: icon === "✓" ? 600 : 400 }}>
                    <span style={{
                      color: icon === "✓" ? "#10b981" : "#d1d5db",
                      background: icon === "✓" ? "rgba(16,185,129,0.1)" : "transparent",
                      width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%",
                      fontSize: 12, fontWeight: 900
                    }}>{icon}</span>{feat}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 32 }}>
              {plan.current ? (
                <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: "#059669", background: "#d1fae5", border: "1px solid #10b981", padding: "6px 14px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.05em" }}>● Active Plan</span>
              ) : plan.name === "Standard" ? (
                <button type="button" onClick={handleDowngrade} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif", width: "100%", transition: "all 0.2s" }}>
                  Unsubscribe (Downgrade)
                </button>
              ) : (
                <button type="button" onClick={() => setShowModal(true)} style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", border: "none", borderRadius: 12, padding: "14px 18px", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Nunito',sans-serif", width: "100%", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
                  Upgrade to Pro
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "18px 24px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 16, fontSize: 14, color: "#1e3a8a", lineHeight: 1.7, fontWeight: 500 }}>
        💡 A merchant processing ₱{sysConfig.freeCap.toLocaleString()}/month saves <strong style={{ color: "#2563eb", fontWeight: 800 }}>₱2,500+</strong> in traditional gateway fees. Pro at ₱{sysConfig.proFee} is a <strong style={{ color: "#1d4ed8", fontWeight: 800 }}>5× ROI</strong> the moment you exceed the free tier.
      </div>

      {showModal && (
        <div className="checkout-modal-overlay">
          <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="checkout-modal-box">
            <h3 style={{ color: "#111827", fontFamily: "'Nunito', sans-serif", fontSize: 24, fontWeight: 900, margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>Secure Checkout</h3>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 24px 0", lineHeight: 1.5, fontWeight: 500 }}>Select your preferred asset to settle the monthly platform tier fee of <strong style={{ color: "#374151" }}>₱{sysConfig.proFee.toFixed(2)} PHP</strong>.</p>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700 }}>Payment Asset</div>
              <select
                value={selectedToken}
                onChange={handleTokenChange}
                style={{ width: "100%", background: "#f9fafb", border: "1px solid #d1d5db", borderRadius: 12, padding: "16px 14px", color: "#111827", fontSize: 15, outline: "none", fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}
              >
                <option value="USDC">USDC (USD Stablecoin)</option>
                <option value="PHPC">PHPC (Philippine Stablecoin)</option>
                <option value="XLM">XLM (Stellar Lumens)</option>
              </select>
            </div>

            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 16, padding: 20, marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>Total Due Equivalent</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#059669", marginTop: 4, fontFamily: "'Nunito',sans-serif", letterSpacing: "-1px" }}>
                {cryptoAmount} {selectedToken}
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#dc2626", textAlign: "center", marginBottom: 24, padding: "0 10px", lineHeight: 1.5, fontWeight: 600 }}>
              * Please note: All subscription payments are strictly non-refundable once authorized and settled on-chain.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button type="button" onClick={handleStellarUpgrade} style={{ width: "100%", background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff", borderRadius: 14, padding: "18px", textAlign: "center", cursor: "pointer", fontWeight: 800, fontFamily: "'Nunito',sans-serif", fontSize: 16, boxShadow: "0 4px 15px rgba(16,185,129,0.3)" }}>
                🚀 Authorize Transfer
              </button>
            </div>

            <button type="button" onClick={() => setShowModal(false)} style={{ width: "100%", background: "transparent", border: "none", color: "#6b7280", fontSize: 14, fontWeight: 700, marginTop: 16, cursor: "pointer" }}>
              Cancel Checkout
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}