import React, { useState, useEffect, useMemo, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { Horizon } from "@stellar/stellar-sdk";
import { motion, AnimatePresence } from "framer-motion";
import { Scanner } from "@yudiel/react-qr-scanner";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const USAGE_LIMIT = 5000;

const TOKEN_ISSUERS = {
  PHPC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
};

interface FloatingNodeProps {
  delay?: number;
  x: string | number;
  y: string | number;
  size?: number;
}

const FloatingNode = ({ delay = 0, x, y, size = 1 }: FloatingNodeProps) => {
  const { randomDuration, randomDelay } = useMemo(() => ({
    randomDuration: 4 + Math.random() * 2,
    randomDelay: delay + Math.random()
  }), [delay]);

  return (
    <motion.div
      className="absolute rounded-full z-0"
      style={{ left: x, top: y, width: 2 * size, height: 2 * size, background: "#a78bfa" }}
      animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.5 * size, 1] }}
      transition={{ duration: randomDuration, delay: randomDelay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
};

export default function CreateInvoice() {
  const [amount, setAmount] = useState("15");
  const [description, setDescription] = useState("Sari-sari restock order");
  const [token, setToken] = useState<"XLM" | "PHPC" | "USDC">("USDC");
  const [customerName, setCustomerName] = useState("");

  const [merchantAddress, setMerchantAddress] = useState<string>("");
  const [memo, setMemo] = useState("");

  const [paymentStatus, setPaymentStatus] = useState<"idle" | "listening" | "success" | "scanning">("idle");
  const [receiptHash, setReceiptHash] = useState("");

  // --- DUAL SPEED STATE ---
  const [speeds, setSpeeds] = useState({ network: "0.00", total: "0.00" });

  // --- FIAT CURRENCY STATE ---
  const [fiatCurrency, setFiatCurrency] = useState<"PHP" | "USD">("PHP");
  const [amountInFiat, setAmountInFiat] = useState("500");
  const [realTimeRate, setRealTimeRate] = useState(1);
  const [usdToPhpRate, setUsdToPhpRate] = useState(56);

  // --- USAGE STATE ---
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // --- GLOBAL LOADING OVERLAY STATE ---
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Initializing dashboard...");

  const [paymentStartTime, setPaymentStartTime] = useState<number | null>(null);

  // --- STREAM REFERENCE FOR CANCELLATION ---
  const streamCloserRef = useRef<(() => void) | null>(null);

  // FETCH USAGE DATA
  useEffect(() => {
    const fetchUsageData = async (uid: string) => {
      setIsLoading(true);
      setLoadingMsg("Syncing monthly volume...");
      try {
        const merchantRef = doc(db, "merchants", uid);
        const merchantSnap = await getDoc(merchantRef);
        const merchantData = merchantSnap.data();

        setIsSubscribed(merchantData?.isSubscribed === true);

        const invoicesRef = collection(db, `merchants/${uid}/invoices`);
        const snapshot = await getDocs(invoicesRef);

        let currentMonthVolume = 0;
        const now = new Date();

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.timestamp && data.status !== "failed" && data.status !== "cancelled") {
            const txDate = new Date(data.timestamp);
            if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
              currentMonthVolume += parseFloat(data.fiatAmount || data.amount || 0);
            }
          }
        });

        setMonthlyUsage(currentMonthVolume);
      } catch (err) {
        console.error("Failed to fetch usage data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (auth.currentUser) {
      fetchUsageData(auth.currentUser.uid);
    }
  }, [paymentStatus]);

  // EXCHANGE RATE LOGIC
  useEffect(() => {
    let isMounted = true;
    const fetchRate = async () => {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=stellar,usd-coin&vs_currencies=php,usd`);
        const data = await res.json();
        if (!isMounted) return;

        setUsdToPhpRate(data['usd-coin'].php);

        let rate = 1;
        if (token === "USDC") {
          rate = fiatCurrency === "USD" ? 1 : data['usd-coin'].php;
        } else if (token === "XLM") {
          rate = fiatCurrency === "USD" ? data.stellar.usd : data.stellar.php;
        } else if (token === "PHPC") {
          rate = fiatCurrency === "USD" ? (1 / data['usd-coin'].php) : 1;
        }

        setRealTimeRate(rate);

        const parsedFiat = parseFloat(amountInFiat);
        if (!isNaN(parsedFiat)) {
          setAmount((parsedFiat / rate).toFixed(2));
        }
      } catch (e) {
        console.error("Rate fetch failed, using default");
      }
    };
    fetchRate();
    return () => { isMounted = false; };
  }, [amountInFiat, token, fiatCurrency]);

  const handleCryptoAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCryptoAmount = e.target.value;
    setAmount(newCryptoAmount);

    const parsedCrypto = parseFloat(newCryptoAmount);
    if (!isNaN(parsedCrypto)) {
      setAmountInFiat((parsedCrypto * realTimeRate).toFixed(2));
    } else {
      setAmountInFiat("");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoading(true);
        setLoadingMsg("Loading merchant profile...");
        const merchantDoc = await getDoc(doc(db, "merchants", user.uid));
        if (merchantDoc.exists() && merchantDoc.data()?.stellarPublicKey) {
          setMerchantAddress(merchantDoc.data().stellarPublicKey);
        }
      }
    });
    setMemo(`INV${Math.floor(100000 + Math.random() * 900000)}`);
    return () => unsubscribe();
  }, []);

  // --- REAL-TIME LIMIT CHECKER ---
  const inputVolumePHP = fiatCurrency === "PHP"
    ? parseFloat(amountInFiat) || 0
    : (parseFloat(amountInFiat) || 0) * usdToPhpRate;

  const projectedUsage = monthlyUsage + inputVolumePHP;
  const willExceedLimit = !isSubscribed && projectedUsage > USAGE_LIMIT;

  const generateStellarURI = () => {
    if (!merchantAddress) return "";
    if (token === "XLM") {
      return `web+stellar:pay?destination=${merchantAddress}&amount=${amount}&memo=${memo}&memo_type=text`;
    } else {
      const issuer = TOKEN_ISSUERS[token];
      return `web+stellar:pay?destination=${merchantAddress}&amount=${amount}&asset_code=${token}&asset_issuer=${issuer}&memo=${memo}&memo_type=text`;
    }
  };

  const generateNewInvoiceId = () => {
    setMemo(`INV${Math.floor(100000 + Math.random() * 900000)}`);
    setPaymentStatus("idle");
    setReceiptHash("");
    setSpeeds({ network: "0.00", total: "0.00" });
  };

  // --- FIRESTORE HELPER TO LOG ALL TRANSACTION STATES ---
  const saveInvoiceToFirestore = async (
    status: "success" | "failed" | "cancelled",
    txHash: string = "",
    netSpeed: string = "0.00",
    totalSpeed: string = "0.00"
  ) => {
    if (!auth.currentUser) return;
    try {
      const invoiceRef = doc(db, `merchants/${auth.currentUser.uid}/invoices`, memo);
      await setDoc(invoiceRef, {
        type: "received",
        invoiceId: memo,
        amount: amount,
        token: token,
        fiatAmount: amountInFiat,
        fiatCurrency: fiatCurrency,
        description: description,
        customerName: customerName,
        txHash: txHash,
        status: status,
        timestamp: new Date().toISOString(),
        processingTimeSeconds: parseFloat(netSpeed), // Keep for legacy dashboards
        networkSpeedSeconds: parseFloat(netSpeed),   // The true blockchain speed
        totalWaitTimeSeconds: parseFloat(totalSpeed) // The human speed
      }, { merge: true });
    } catch (err) {
      console.error("Firestore Save Error:", err);
    }
  };

  const handleStartListening = async () => {
    if (willExceedLimit) {
      alert(`⚠️ This transaction exceeds your free tier limit (${USAGE_LIMIT.toLocaleString()} PHP). Please subscribe to continue.`);
      return;
    }

    setPaymentStartTime(Date.now());
    startListeningForPayment();
  };

  const cancelListening = async () => {
    let totalSpeed = "0.00";
    if (paymentStartTime) {
      totalSpeed = ((Date.now() - paymentStartTime) / 1000).toFixed(2);
    }

    // Stop listening to the Stellar network
    if (streamCloserRef.current) {
      streamCloserRef.current();
      streamCloserRef.current = null;
    }

    // Log the cancellation to Firestore
    await saveInvoiceToFirestore("cancelled", "", "0.00", totalSpeed);

    setPaymentStatus("idle");
  };

  const startListeningForPayment = () => {
    if (!merchantAddress) return;
    setPaymentStatus("listening");

    const server = new Horizon.Server(HORIZON_URL);
    const closeStream = server.transactions()
      .forAccount(merchantAddress)
      .cursor("now")
      .stream({
        onmessage: async (transaction: any) => {
          if (transaction.memo && transaction.memo.toString().trim() === memo.trim()) {

            if (streamCloserRef.current) {
              streamCloserRef.current();
              streamCloserRef.current = null;
            }

            setReceiptHash(transaction.hash);

            setIsLoading(true);
            setLoadingMsg("Confirming payment & generating receipt...");

            const receiveTime = Date.now();
            let totalSpeed = "0.00";
            let netSpeed = "0.00";

            // 1. Calculate Total User Wait Time
            if (paymentStartTime) {
              totalSpeed = ((receiveTime - paymentStartTime) / 1000).toFixed(2);
            }

            // 2. Calculate Pure Blockchain Speed
            if (transaction.created_at) {
              const ledgerTime = new Date(transaction.created_at).getTime();
              const speedSeconds = Math.max(0.1, Math.abs(receiveTime - ledgerTime) / 1000);
              netSpeed = speedSeconds.toFixed(2);
            } else {
              netSpeed = totalSpeed;
            }

            setSpeeds({ network: netSpeed, total: totalSpeed });

            // Log Success to Firestore
            await saveInvoiceToFirestore("success", transaction.hash, netSpeed, totalSpeed);

            setIsLoading(false);
            setPaymentStatus("success");
          }
        },
        onerror: async (error) => {
          console.error("Stream Error:", error);
          let totalSpeed = "0.00";
          if (paymentStartTime) {
            totalSpeed = ((Date.now() - paymentStartTime) / 1000).toFixed(2);
          }
          // Log Failure to Firestore
          await saveInvoiceToFirestore("failed", "", "0.00", totalSpeed);
        }
      });

    streamCloserRef.current = closeStream;
  };

  const handleScanSuccess = async (text: string) => {
    const address = text.includes("destination=")
      ? text.match(/destination=([A-Z0-9]+)/)?.[1] || text
      : text;

    alert(`Detected Customer Address: ${address.substring(0, 8)}... \n\nProceeding to initiate payment!`);
    setPaymentStatus("idle");
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>
          Receive Payment
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Generate a payment QR or scan a customer's wallet.</p>
      </div>

      <MonthlyUsageCard
        monthlyUsage={monthlyUsage}
        isSubscribed={isSubscribed}
        usageLimit={USAGE_LIMIT}
        projectedUsage={projectedUsage}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* LEFT PANEL */}
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>Invoice Details</div>
          <div style={{ padding: 20 }}>

            {/* FIAT INPUT */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em" }}>Base Amount</div>
                <select
                  value={fiatCurrency}
                  onChange={(e) => setFiatCurrency(e.target.value as "PHP" | "USD")}
                  disabled={paymentStatus !== "idle"}
                  style={{ background: "rgba(167, 139, 250, 0.1)", color: "#a78bfa", border: "1px solid rgba(167, 139, 250, 0.3)", borderRadius: 4, padding: "2px 6px", fontSize: 11, outline: "none", cursor: "pointer", fontWeight: "bold" }}
                >
                  <option value="PHP">PHP (₱)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              <input
                type="number"
                value={amountInFiat}
                onChange={e => setAmountInFiat(e.target.value)}
                disabled={paymentStatus !== "idle"}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* CRYPTO INPUTS */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Crypto Eqv.</div>
                <input
                  type="number"
                  value={amount}
                  onChange={handleCryptoAmountChange}
                  disabled={paymentStatus !== "idle"}
                  style={{ width: "100%", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 8, padding: "10px 13px", color: "#a78bfa", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Token</div>
                <select
                  value={token}
                  onChange={(e) => setToken(e.target.value as "XLM" | "PHPC" | "USDC")}
                  disabled={paymentStatus !== "idle"}
                  style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, outline: "none" }}
                >
                  <option value="XLM">XLM</option>
                  <option value="USDC">USDC</option>
                  <option value="PHPC">PHPC</option>
                </select>
              </div>
            </div>

            {/* DESCRIPTION */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Description</div>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={paymentStatus !== "idle"}
                style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {paymentStatus === "idle" && (
              <button onClick={generateNewInvoiceId} style={{ width: "100%", background: "transparent", color: "#a78bfa", border: "1px solid rgba(124,58,237,.4)", borderRadius: 8, padding: 13, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                Reset Form / New ID
              </button>
            )}
          </div>
        </div>

        {/* RIGHT PANEL - SCANNER/LISTENER */}
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, position: "relative", overflow: "hidden" }}>

          {paymentStatus === "idle" && (
            <div style={{ textAlign: "center", width: "100%" }}>
              <div style={{ width: 80, height: 80, background: "rgba(255,255,255,.05)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 30 }}>🧾</div>
              <h3 style={{ color: "#fff", fontFamily: "'Nunito',sans-serif", margin: "0 0 20px 0" }}>Invoice Ready</h3>

              <button
                onClick={handleStartListening}
                disabled={willExceedLimit}
                style={{
                  width: "100%",
                  background: willExceedLimit ? "rgba(239, 68, 68, 0.15)" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
                  color: willExceedLimit ? "#ef4444" : "#fff",
                  border: willExceedLimit ? "1px solid rgba(239, 68, 68, 0.4)" : "none",
                  borderRadius: 8,
                  padding: 13,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: willExceedLimit ? "not-allowed" : "pointer",
                  fontFamily: "'Nunito',sans-serif",
                  marginBottom: 12
                }}
              >
                {willExceedLimit ? "Limit Exceeded" : "Show QR & Listen"}
              </button>

              <button
                onClick={() => setPaymentStatus("scanning")}
                disabled={willExceedLimit}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.1)",
                  color: willExceedLimit ? "rgba(255,255,255,0.4)" : "#fff",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8,
                  padding: 13,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: willExceedLimit ? "not-allowed" : "pointer",
                  fontFamily: "'Nunito',sans-serif"
                }}
              >
                📷 Scan Customer
              </button>
            </div>
          )}

          {paymentStatus === "listening" && (
            <>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#10b981", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 20 }}>Awaiting Scan...</div>
              <div style={{ position: "relative", width: 180, height: 180, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FloatingNode delay={0} x="10%" y="10%" size={8} />
                <FloatingNode delay={0.5} x="80%" y="20%" size={12} />
                <FloatingNode delay={1.2} x="20%" y="80%" size={6} />
                <FloatingNode delay={0.8} x="85%" y="75%" size={10} />
                <div style={{ width: 160, height: 160, background: "#fff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, zIndex: 10, boxShadow: "0 0 20px rgba(16,185,129,.4)" }}>
                  <QRCodeSVG value={generateStellarURI()} size={144} />
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#a78bfa", marginBottom: 6 }}>
                {parseFloat(amount || "0").toLocaleString()} {token}
              </div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#6b7280", background: "rgba(255,255,255,.06)", padding: "5px 12px", borderRadius: 4, marginBottom: 20 }}>memo: {memo}</div>
              <button onClick={cancelListening} style={{ background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "8px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                Cancel / Hide QR
              </button>
            </>
          )}

          {paymentStatus === "scanning" && (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#60a5fa", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 20 }}>Point at Customer QR</div>
              <div style={{ width: "100%", maxWidth: 250, borderRadius: 12, overflow: "hidden", border: "2px solid #60a5fa", marginBottom: 20 }}>
                <Scanner onScan={(result) => handleScanSuccess(result[0].rawValue)} />
              </div>
              <button onClick={cancelListening} style={{ background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "8px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                Stop Scanning
              </button>
            </div>
          )}

          {paymentStatus === "success" && (
            <div style={{ textAlign: "center", width: "100%" }}>
              <div style={{ width: 80, height: 80, background: "#10b981", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 40, color: "#fff" }}>✓</div>
              <h2 style={{ color: "#fff", fontFamily: "'Nunito',sans-serif", margin: "0 0 8px 0" }}>Payment Received!</h2>
              <p style={{ color: "#a7f3d0", fontSize: 18, fontWeight: "bold", margin: "0 0 20px 0" }}>
                {parseFloat(amount || "0").toLocaleString()} {token}
              </p>

              <div style={{ background: "rgba(0,0,0,.3)", padding: 16, borderRadius: 8, textAlign: "left", marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Invoice ID</div>
                <div style={{ color: "#fff", fontFamily: "'DM Mono',monospace", fontSize: 13, marginBottom: 12 }}>{memo}</div>
                <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Tx Hash</div>
                <div style={{ color: "#34d399", fontSize: 11, wordBreak: "break-all", fontFamily: "'DM Mono',monospace" }}>
                  {receiptHash.substring(0, 20)}...
                </div>
              </div>

              {/* ⚡ DUAL SPEED BADGES */}
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 24 }}>
                <div style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                  ⚡ Network: {speeds.network}s
                </div>
                <div style={{ background: "rgba(167, 139, 250, 0.1)", color: "#a78bfa", border: "1px solid rgba(167, 139, 250, 0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                  ⏱️ Total Wait: {speeds.total}s
                </div>
              </div>

              <button onClick={generateNewInvoiceId} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}