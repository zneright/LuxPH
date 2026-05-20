// ==========================================
// 1. IMPORTS & TYPES
// ==========================================
import React, { useState, useEffect } from "react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Horizon, TransactionBuilder, Networks, Operation, Asset } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";

// Fallback values in case the config document isn't fully set up yet
const FALLBACK_TREASURY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const FALLBACK_USDC = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// ==========================================
// 2. MAIN COMPONENT
// ==========================================
export default function Subscription() {

  // --- USER & AUTH STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [merchantAddress, setMerchantAddress] = useState<string>("");

  // --- SYSTEM CONFIG STATE ---
  const [sysConfig, setSysConfig] = useState({
    proFee: 499,
    freeCap: 100000,
    networkPassphrase: Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    phpcIssuer: FALLBACK_TREASURY,
  });

  // --- UI & MODAL STATES ---
  const [showModal, setShowModal] = useState<boolean>(false);
  const [selectedToken, setSelectedToken] = useState<"XLM" | "PHPC" | "USDC">("USDC");
  const [cryptoAmount, setCryptoAmount] = useState<string>("0.00");
  const [ratesData, setRatesData] = useState<any>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingMsg, setLoadingMsg] = useState("Initializing system...");

  // ==========================================
  // 3. INITIALIZATION (FETCH CONFIG & USER)
  // ==========================================
  useEffect(() => {
    const initSystem = async () => {
      try {
        // 1. Fetch Global Platform Config
        const configSnap = await getDoc(doc(db, "system_config", "global"));
        if (configSnap.exists()) {
          const c = configSnap.data();
          const isTestnet = c.stellarNetwork === "Testnet (Futurenet)";

          setSysConfig({
            proFee: c.proTierMonthlyFee || 499,
            freeCap: c.freeTierMonthlyCap || 100000,
            networkPassphrase: isTestnet ? Networks.TESTNET : Networks.PUBLIC,
            horizonUrl: isTestnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org",
            phpcIssuer: c.phpcIssuerAddress || FALLBACK_TREASURY,
          });
        }

        // 2. Listen for Auth & Sync Billing
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

  // ==========================================
  // 4. LIVE EXCHANGE RATE CALCULATIONS
  // ==========================================
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

  // Recalculates exact crypto cost based on live PHP rates and the admin-defined proFee
  const calculateEquivalent = (token: "XLM" | "PHPC" | "USDC", data = ratesData) => {
    if (!data) return;
    const fee = sysConfig.proFee;

    if (token === "PHPC") {
      setCryptoAmount(fee.toFixed(2)); // 1:1 Peg
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

  // ==========================================
  // 5. SECURE STELLAR PAYMENT ROUTER
  // ==========================================
  const handleStellarUpgrade = async () => {
    if (!user) return alert("Please login to proceed.");
    if (!merchantAddress) return alert("Please connect your Freighter wallet in Settings first.");

    setShowModal(false);
    setIsLoading(true);
    setLoadingMsg(`Preparing your ${selectedToken} transaction invoice...`);

    try {
      const server = new Horizon.Server(sysConfig.horizonUrl);
      const sourceAccount = await server.loadAccount(merchantAddress);

      // Dynamically select the correct asset issuer
      let paymentAsset = Asset.native();
      if (selectedToken === "PHPC") {
        paymentAsset = new Asset("PHPC", sysConfig.phpcIssuer);
      } else if (selectedToken === "USDC") {
        paymentAsset = new Asset("USDC", FALLBACK_USDC);
      }

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: sysConfig.networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination: FALLBACK_TREASURY, // Using fallback treasury for now
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

  // ==========================================
  // 6. DOWNGRADE LOGIC
  // ==========================================
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

  // ==========================================
  // 7. RENDER UI
  // ==========================================
  return (
    <div style={{ position: "relative", minHeight: "80vh" }}>
      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Subscription</h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>
          Currently on the {" "}
          <span style={{ color: isSubscribed ? "#10b981" : "#a78bfa", fontWeight: "bold" }}>
            {isSubscribed ? "Pro Tier" : "Unsubscribed Tier"}
          </span>
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
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
          <div key={plan.name} style={{ border: `1px solid ${plan.current ? "rgba(124,58,237,.5)" : "rgba(255,255,255,.08)"}`, borderRadius: 14, padding: 24, background: plan.current ? "rgba(124,58,237,.06)" : "rgba(255,255,255,.04)" }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#a78bfa", marginBottom: 6 }}>{plan.name}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 18 }}>{plan.price} <span style={{ fontSize: 14, color: "#9ca3af", fontWeight: 400 }}>{plan.period}</span></div>
            {plan.features.map(([icon, feat], idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: icon === "✓" ? "#e5e7eb" : "#6b7280", marginBottom: 10 }}>
                <span style={{ color: icon === "✓" ? "#4ade80" : "#374151" }}>{icon}</span>{feat}
              </div>
            ))}

            {/* DYNAMIC BUTTON LOGIC */}
            <div style={{ marginTop: 20 }}>
              {plan.current ? (
                <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#4ade80", background: "rgba(74,222,128,.1)", border: "1px solid rgba(74,222,128,.25)", padding: "3px 10px", borderRadius: 20 }}>● Active Plan</span>
              ) : plan.name === "Standard" ? (
                // Shows on the Standard plan ONLY when user is subscribed to Pro
                <button onClick={handleDowngrade} style={{ background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                  Unsubscribe (Downgrade)
                </button>
              ) : (
                // Shows on the Pro plan ONLY when user is on Standard
                <button onClick={() => setShowModal(true)} style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
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

      {/* --- PRODUCTION CHECKOUT MODAL --- */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,11,20,.85)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md" style={{ background: "#111625", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 24, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)" }}>
            <h3 style={{ color: "#fff", fontFamily: "'Nunito', sans-serif", fontSize: 20, fontWeight: 800, margin: "0 0 8px 0" }}>Premium Subscription Checkout</h3>
            <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 20px 0" }}>Select your preferred asset to settle the monthly platform tier fee of <strong>₱{sysConfig.proFee.toFixed(2)} PHP</strong>.</p>

            {/* TOKEN ASSET SELECTOR CHIPS */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Payment Asset</div>
              <select
                value={selectedToken}
                onChange={handleTokenChange}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", fontWeight: "bold", cursor: "pointer" }}
              >
                <option value="USDC">USDC (USD Stablecoin)</option>
                <option value="PHPC">PHPC (Philippine Stablecoin)</option>
                <option value="XLM">XLM (Stellar Lumens)</option>
              </select>
            </div>

            {/* DYNAMIC CONVERSION CARD */}
            <div style={{ background: "rgba(124, 58, 237, 0.05)", border: "1px solid rgba(124, 58, 237, 0.15)", borderRadius: 10, padding: 16, marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Mono',monospace" }}>Total Due Equivalent</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#a78bfa", marginTop: 4, fontFamily: "'Nunito',sans-serif" }}>
                {cryptoAmount} {selectedToken}
              </div>
            </div>

            {/* NON-REFUNDABLE WARNING */}
            <div style={{ fontSize: 11, color: "#ef4444", textAlign: "center", marginBottom: 20, padding: "0 10px", lineHeight: 1.4 }}>
              * Please note: All subscription payments are strictly non-refundable once authorized and settled on-chain.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button onClick={handleStellarUpgrade} style={{ width: "100%", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", border: "none", color: "#fff", borderRadius: 8, padding: "14px", textAlign: "center", cursor: "pointer", fontWeight: "bold", fontFamily: "'Nunito',sans-serif", fontSize: 14 }}>
                🚀 Authorize {selectedToken} Transfer
              </button>
            </div>

            <button onClick={() => setShowModal(false)} style={{ width: "100%", background: "transparent", border: "none", color: "#6b7280", fontSize: 12, marginTop: 16, cursor: "pointer", textDecoration: "underline" }}>
              Cancel Payment
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}