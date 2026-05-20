import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { Horizon, TransactionBuilder, Networks, Operation, Asset } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";

// Hardcoded Testnet fallback settings for secure staging environment settlement routing
const FALLBACK_TREASURY = "GDZRE7N6PHB6CCM3VBRB5V7SDRB6CS4U6MTUL6Q6OMJEXHUTVPHPC001"; // Testnet Treasury
const FALLBACK_USDC = "GCAXCH6S643WNNRLOLW52Z6T7A6A6T43L234D7JEXUSDC001";   // Testnet USDC Issuer

export default function Subscription() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [merchantAddress, setMerchantAddress] = useState<string>("");
  const [monthlyUsage, setMonthlyUsage] = useState<number>(0);

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
        let currentUsdcIssuer = FALLBACK_USDC;
        let currentTreasury = FALLBACK_TREASURY;
        let currentProFee = 499;
        let currentFreeCap = 100000;

        if (configSnap.exists()) {
          const c = configSnap.data();
          const isTestnet = c.stellarNetwork ? c.stellarNetwork.includes("Testnet") : true;
          currentPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;
          currentHorizon = isTestnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
          currentIssuer = c.phpcIssuerAddress || FALLBACK_TREASURY;
          currentUsdcIssuer = c.usdcIssuerAddress || FALLBACK_USDC;
          currentTreasury = c.phpcIssuerAddress || FALLBACK_TREASURY;
          currentProFee = c.proTierMonthlyFee || 499;
          currentFreeCap = c.freeTierMonthlyCap || 100000;
        }

        setSysConfig({
          proFee: currentProFee,
          freeCap: currentFreeCap,
          networkPassphrase: currentPassphrase,
          horizonUrl: currentHorizon,
          phpcIssuer: currentIssuer,
          usdcIssuer: currentUsdcIssuer,
          treasuryAddress: currentTreasury
        });

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
      setCryptoAmount(fee.toFixed(2));
    } else if (token === "USDC") {
      const usdcToPhp = data['usd-coin'].php;
      setCryptoAmount((fee / usdcToPhp).toFixed(2));
    } else if (token === "XLM") {
      const xlmToPhp = data.stellar.php;
      setCryptoAmount((fee / xlmToPhp).toFixed(2));
    }
  };

  const handleTokenChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextToken = e.target.value as "XLM" | "PHPC" | "USDC";
    setSelectedToken(nextToken);
    calculateEquivalent(nextToken);
  };

  const handleStellarUpgrade = async () => {
    if (!user) return alert("Please login to proceed.");
    if (!merchantAddress) return alert("Please connect your Freighter wallet in Settings first.");

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

      setLoadingMsg(`Awaiting Freighter signature for ${cryptoAmount} ${selectedToken}...`);

      const signResponse = await signTransaction(transaction.toXDR(), {
        network: sysConfig.networkPassphrase === Networks.TESTNET ? "TESTNET" : "PUBLIC",
        networkPassphrase: sysConfig.networkPassphrase,
      });

      if (!signResponse || signResponse.error) {
        throw new Error("Payment signature rejected by user.");
      }

      setLoadingMsg("Confirming blockchain settlement...");

      const signedXdrString = typeof signResponse === "string" ? signResponse :
        (signResponse.signedTxXdr || Object.values(signResponse)[0] as string);

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
        .sub-layout-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px; }
        .sub-plan-card { border-radius: 14px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between; }
        .sub-header-block { margin-bottom: 24px; }
        .sub-header-block h1 { font-size: 30px; font-weight: 800; color: #fff; margin-bottom: 4px; fontFamily: 'Nunito', sans-serif; letter-spacing: -0.02em; }
        .sub-header-block p { color: #9ca3af; font-size: 13px; margin: 0; }
        .checkout-modal-overlay { position: fixed; inset: 0; background: rgba(8,11,20,.85); backdrop-filter: blur(4px); zIndex: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .checkout-modal-box { background: #111625; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); width: 100%; max-width: 440px; box-sizing: border-box; }

        @media (max-width: 768px) {
          .sub-layout-grid { grid-template-columns: 1fr; gap: 16px; }
          .sub-plan-card { gap: 16px; }
        }
      `}</style>

      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>

      <div className="sub-header-block">
        <h1>Subscription</h1>
        <p>
          Currently on the {" "}
          <span style={{ color: isSubscribed ? "#10b981" : "#a78bfa", fontWeight: "bold" }}>
            {isSubscribed ? "Pro Tier" : "Unsubscribed Tier"}
          </span>
        </p>
      </div>

      <MonthlyUsageCard
        monthlyUsage={monthlyUsage}
        isSubscribed={isSubscribed}
        usageLimit={sysConfig.freeCap}
      />

      <div className="sub-layout-grid" style={{ marginTop: "24px" }}>
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
          <div key={plan.name} className="sub-plan-card" style={{ border: `1px solid ${plan.current ? "rgba(124,58,237,.5)" : "rgba(255,255,255,.08)"}`, background: plan.current ? "rgba(124,58,237,.06)" : "rgba(255,255,255,.04)" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#a78bfa", marginBottom: 6 }}>{plan.name}</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 18 }}>{plan.price} <span style={{ fontSize: 14, color: "#9ca3af", font400: "true" }}>{plan.period}</span></div>
              {plan.features.map(([icon, feat], idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: icon === "✓" ? "#e5e7eb" : "#6b7280", marginBottom: 10 }}>
                  <span style={{ color: icon === "✓" ? "#4ade80" : "#374151" }}>{icon}</span>{feat}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20 }}>
              {plan.current ? (
                <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#4ade80", background: "rgba(74,222,128,.1)", border: "1px solid rgba(74,222,128,.25)", padding: "3px 10px", borderRadius: 20 }}>● Active Plan</span>
              ) : plan.name === "Standard" ? (
                <button type="button" onClick={handleDowngrade} style={{ background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", width: "100%" }}>
                  Unsubscribe (Downgrade)
                </button>
              ) : (
                <button type="button" onClick={() => setShowModal(true)} style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", border: "none", borderStyle: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", width: "100%" }}>
                  Upgrade to Pro
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 20px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, fontSize: 13, color: "#9ca3af", lineHeight: 1.7 }}>
        💡 A merchant processing ₱{sysConfig.freeCap.toLocaleString()}/month saves <strong style={{ color: "#a78bfa" }}>₱2,500+</strong> in traditional gateway fees. Pro at ₱{sysConfig.proFee} is a <strong style={{ color: "#fff" }}>5× ROI</strong> the moment you exceed the free tier.
      </div>

      {showModal && (
        <div className="checkout-modal-overlay">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="checkout-modal-box">
            <h3 style={{ color: "#fff", fontFamily: "'Nunito', sans-serif", fontSize: 20, fontWeight: 800, margin: "0 0 8px 0" }}>Premium Subscription Checkout</h3>
            <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 20px 0" }}>Select your preferred asset to settle the monthly platform tier fee of <strong>₱{sysConfig.proFee.toFixed(2)} PHP</strong>.</p>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Payment Asset</div>
              <select
                value={selectedToken}
                onChange={handleTokenChange}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", fontWeight: "bold", cursor: "pointer" }}
              >
                <option value="USDC" style={{ color: "#000" }}>USDC (USD Stablecoin)</option>
                <option value="PHPC" style={{ color: "#000" }}>PHPC (Philippine Stablecoin)</option>
                <option value="XLM" style={{ color: "#000" }}>XLM (Stellar Lumens)</option>
              </select>
            </div>

            <div style={{ background: "rgba(124, 58, 237, 0.05)", border: "1px solid rgba(124, 58, 237, 0.15)", borderRadius: 10, padding: 16, marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Mono',monospace" }}>Total Due Equivalent</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#a78bfa", marginTop: 4, fontFamily: "'Nunito',sans-serif" }}>
                {cryptoAmount} {selectedToken}
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#ef4444", textAlign: "center", marginBottom: 20, padding: "0 10px", lineHeight: 1.4 }}>
              * Please note: All subscription payments are strictly non-refundable once authorized and settled on-chain.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button type="button" onClick={handleStellarUpgrade} style={{ width: "100%", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", border: "none", color: "#fff", borderRadius: 8, padding: "14px", textAlign: "center", cursor: "pointer", fontWeight: "bold", fontFamily: "'Nunito',sans-serif", fontSize: 14 }}>
                🚀 Authorize {selectedToken} Transfer
              </button>
            </div>

            <button type="button" onClick={() => setShowModal(false)} style={{ width: "100%", background: "transparent", border: "none", color: "#6b7280", fontSize: 12, marginTop: 16, cursor: "pointer", textDecoration: "underline" }}>
              Cancel Payment
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}