import React, { useState, useEffect, useMemo, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { Horizon } from "@stellar/stellar-sdk";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";
import { useNetwork } from "../../contexts/NetworkContext";
import { useWallet } from "../../contexts/WalletContext";
import { invokeSorobanContract } from "../../services/soroban";

// Hardcoded Testnet fallback issuer targets to match staging architecture configurations
const FALLBACK_ISSUER = "GDZRE7N6PHB6CCM3VBRB5V7SDRB6CS4U6MTUL6Q6OMJEXHUTVPHPC001"; // Testnet Issuer
const FALLBACK_USDC = "GCAXCH6S643WNNRLOLW52Z6T7A6A6T43L234D7JEXUSDC001";   // Testnet USDC Issuer

const FloatingNode = ({ delay = 0, x, y, size = 1, color = "#f59e0b", blur = 0 }: { delay?: number, x: string, y: string, size?: number, color?: string, blur?: number }) => {
  const { randomDuration, randomDelay } = useMemo(() => ({
    randomDuration: 5 + Math.random() * 5,
    randomDelay: delay + Math.random() * 2
  }), [delay]);

  return (
    <motion.div
      className="absolute rounded-full z-0 pointer-events-none"
      style={{
        left: x, top: y, width: 2 * size, height: 2 * size,
        background: color, filter: `blur(${blur}px)`, boxShadow: `0 0 ${size * 4}px ${size}px ${color}80`
      }}
      animate={{ opacity: [0.1, 0.5, 0.1], scale: [1, 1.4, 1], y: ["0%", "-40%", "0%"], x: ["0%", "15%", "0%"] }}
      transition={{ duration: randomDuration, delay: randomDelay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
};

export default function CreateInvoice() {
  const { networkConfig, systemConfig } = useNetwork();

  const [sysConfig, setSysConfig] = useState({
    horizonUrl: "https://horizon-testnet.stellar.org",
    phpcIssuer: FALLBACK_ISSUER,
    usdcIssuer: FALLBACK_USDC,
    freeTierCap: 100000,
  });

  const [amount, setAmount] = useState("15");
  const [description, setDescription] = useState("Sari-sari restock order");
  const [token, setToken] = useState<"XLM" | "PHPC" | "USDC">("USDC");
  const [customerName, setCustomerName] = useState("");
  const [memo, setMemo] = useState("");

  const [useContractInvoice, setUseContractInvoice] = useState(false);
  const [contractId, setContractId] = useState("");
  const [contractFunctionName, setContractFunctionName] = useState("record_invoice");
  const [contractArgs, setContractArgs] = useState("merchant,customerName,amount,token,memo"); // Kept for the input field UI
  const [contingencyPercentage, setContingencyPercentage] = useState(0);

  const [merchantAddress, setMerchantAddress] = useState<string>("");
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const [fiatCurrency, setFiatCurrency] = useState<"PHP" | "USD">("PHP");
  const [amountInFiat, setAmountInFiat] = useState("500");
  const [realTimeRate, setRealTimeRate] = useState(1);
  const [usdToPhpRate, setUsdToPhpRate] = useState(56);

  // Tracks which field the user typed in last for accurate conversions
  const [lastUpdatedField, setLastUpdatedField] = useState<"FIAT" | "CRYPTO">("FIAT");

  const [paymentStatus, setPaymentStatus] = useState<"idle" | "listening" | "success">("idle");
  const [receiptHash, setReceiptHash] = useState("");
  const [speeds, setSpeeds] = useState({ network: "0.00", total: "0.00" });
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Initializing dashboard...");
  const [paymentStartTime, setPaymentStartTime] = useState<number | null>(null);
  const streamCloserRef = useRef<(() => void) | null>(null);

  const { signTx } = useWallet();

  // Cleanup effect to prevent stream memory leaks
  useEffect(() => {
    return () => {
      if (streamCloserRef.current) {
        streamCloserRef.current();
        streamCloserRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const initSystem = async () => {
      try {
        onAuthStateChanged(auth, async (currentUser) => {
          if (currentUser) {
            const mDoc = await getDoc(doc(db, "merchants", currentUser.uid));
            if (mDoc.exists()) {
              const data = mDoc.data();
              setIsSubscribed(data?.isSubscribed === true);
              if (data?.stellarPublicKey) setMerchantAddress(data.stellarPublicKey);
              if (data?.contingencyConfig?.percentage) setContingencyPercentage(Number(data.contingencyConfig.percentage));
            }
            setMemo(`INV${Math.floor(100000 + Math.random() * 900000)}`);
            await fetchUsage(currentUser.uid);
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
    setSysConfig({
      horizonUrl: networkConfig.horizonUrl,
      phpcIssuer: systemConfig.phpcIssuerAddress,
      usdcIssuer: systemConfig.usdcIssuerAddress,
      freeTierCap: systemConfig.freeTierMonthlyCap,
    });

    if (!contractId && systemConfig.sorobanContractId) {
      setContractId(systemConfig.sorobanContractId);
    }
  }, [networkConfig, systemConfig]);

  const fetchUsage = async (uid: string) => {
    try {
      const invoicesRef = collection(db, `merchants/${uid}/invoices`);
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
    } catch (err) { console.error("Usage fetch failed:", err); }
  };

  useEffect(() => {
    if (paymentStatus === "success" && auth.currentUser) {
      fetchUsage(auth.currentUser.uid);
    }
  }, [paymentStatus]);

  useEffect(() => {
    let isMounted = true;
    const fetchRate = async () => {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=stellar,usd-coin&vs_currencies=php,usd`);
        const data = await res.json();
        if (!isMounted) return;

        setUsdToPhpRate(data['usd-coin'].php);

        let rate = 1;
        if (token === "USDC") rate = fiatCurrency === "USD" ? 1 : data['usd-coin'].php;
        else if (token === "XLM") rate = fiatCurrency === "USD" ? data.stellar.usd : data.stellar.php;
        else if (token === "PHPC") rate = fiatCurrency === "USD" ? (1 / data['usd-coin'].php) : 1;

        setRealTimeRate(rate);

        // Synchronize inputs based on what was last typed
        if (lastUpdatedField === "FIAT" && amountInFiat) {
          const cryptoDecimals = token === 'XLM' ? 7 : 2;
          setAmount((parseFloat(amountInFiat) / rate).toFixed(cryptoDecimals));
        } else if (lastUpdatedField === "CRYPTO" && amount) {
          setAmountInFiat((parseFloat(amount) * rate).toFixed(2));
        }
      } catch (e) {
        console.error("Rate fetch failed");
      }
    };
    fetchRate();
    // Changed polling to 2 minutes to prevent rate limiting
    const interval = setInterval(fetchRate, 120000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [token, fiatCurrency]);

  const handleFiatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAmountInFiat(val);
    setLastUpdatedField("FIAT");

    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      const cryptoDecimals = token === 'XLM' ? 7 : 2;
      setAmount((parsed / realTimeRate).toFixed(cryptoDecimals));
    } else {
      setAmount("");
    }
  };

  const handleCryptoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAmount(val);
    setLastUpdatedField("CRYPTO");

    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setAmountInFiat((parsed * realTimeRate).toFixed(2));
    } else {
      setAmountInFiat("");
    }
  };

  const inputVolumePHP = fiatCurrency === "PHP" ? parseFloat(amountInFiat) || 0 : (parseFloat(amountInFiat) || 0) * usdToPhpRate;
  const projectedUsage = monthlyUsage + inputVolumePHP;
  const willExceedLimit = !isSubscribed && projectedUsage > sysConfig.freeTierCap;

  const generateStellarURI = () => {
    if (!merchantAddress) return "";
    if (token === "XLM") {
      return `web+stellar:pay?destination=${merchantAddress}&amount=${amount}&memo=${memo}&memo_type=text`;
    } else {
      const issuer = token === "PHPC" ? sysConfig.phpcIssuer : sysConfig.usdcIssuer;
      return `web+stellar:pay?destination=${merchantAddress}&amount=${amount}&asset_code=${token}&asset_issuer=${issuer}&memo=${memo}&memo_type=text`;
    }
  };

  const saveInvoiceToFirestore = async (status: "success" | "failed" | "cancelled", txHash: string = "", netSpeed: string = "0.00", totalSpeed: string = "0.00") => {
    if (!auth.currentUser) return;
    try {
      const contingencyAmount = contingencyPercentage > 0 ? ((parseFloat(amount || "0") * contingencyPercentage) / 100).toFixed(2) : "0.00";
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
        paymentMechanism: useContractInvoice ? "soroban" : "horizon",
        contractId: useContractInvoice ? contractId : "",
        contractFunctionName: useContractInvoice ? contractFunctionName : "",
        contractArgs: useContractInvoice ? contractArgs : "",
        contingencyPercentage: contingencyPercentage,
        contingencyAmount: contingencyAmount,
        timestamp: new Date().toISOString(),
        processingTimeSeconds: parseFloat(netSpeed),
        networkSpeedSeconds: parseFloat(netSpeed),
        totalWaitTimeSeconds: parseFloat(totalSpeed)
      }, { merge: true });
    } catch (err) { console.error("Firestore Save Error:", err); }
  };

  const handleStartListening = async () => {
    if (!merchantAddress) {
      alert("Please connect your wallet in Settings to generate a receive address.");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid amount.");
      return;
    }
    if (willExceedLimit) {
      alert(`⚠️ This transaction exceeds your free tier limit (${sysConfig.freeTierCap.toLocaleString()} PHP). Please subscribe to continue.`);
      return;
    }

    if (useContractInvoice) {
      const effectiveContractId = contractId || systemConfig.sorobanContractId;
      if (!effectiveContractId) {
        return alert("Please provide the Soroban contract ID.");
      }
      if (!contractFunctionName) {
        return alert("Please provide the contract function name.");
      }
      if (!networkConfig?.sorobanRpcUrl) {
        return alert("Soroban RPC URL is not configured.");
      }

      const amountInStroops = Math.floor(parseFloat(amount) * 10000000);
      const tokenAddress = token === "PHPC"
        ? sysConfig.phpcIssuer
        : token === "USDC"
          ? sysConfig.usdcIssuer
          : merchantAddress;

      const parsedArgs = [
        merchantAddress,
        customerName || "Walk-in",
        amountInStroops,
        tokenAddress,
        memo
      ];
      try {
        setLoadingMsg("Submitting invoice to Soroban contract...");
        setIsLoading(true);
        await invokeSorobanContract({
          sourcePublicKey: merchantAddress,
          contractId: effectiveContractId,
          functionName: contractFunctionName,
          functionArgs: parsedArgs,
          horizonUrl: networkConfig.horizonUrl,
          sorobanRpcUrl: networkConfig.sorobanRpcUrl,
          networkPassphrase: networkConfig.networkPassphrase,
          walletSign: signTx,
          fee: "100",
          timeout: 300,
        });
      } catch (contractError: any) {
        setIsLoading(false);
        return alert(`Soroban invoice registration failed: ${contractError.message || contractError}`);
      }
    }

    setPaymentStartTime(Date.now());
    startListeningForPayment();
  };

  const cancelListening = async () => {
    let totalSpeed = "0.00";
    if (paymentStartTime) totalSpeed = ((Date.now() - paymentStartTime) / 1000).toFixed(2);

    if (streamCloserRef.current) {
      streamCloserRef.current();
      streamCloserRef.current = null;
    }
    await saveInvoiceToFirestore("cancelled", "", "0.00", totalSpeed);
    setPaymentStatus("idle");
  };

  const startListeningForPayment = () => {
    if (!merchantAddress) return;
    setPaymentStatus("listening");

    const server = new Horizon.Server(sysConfig.horizonUrl);
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

            if (paymentStartTime) totalSpeed = ((receiveTime - paymentStartTime) / 1000).toFixed(2);

            if (transaction.created_at) {
              const ledgerTime = new Date(transaction.created_at).getTime();
              const speedSeconds = Math.max(0.1, Math.abs(receiveTime - ledgerTime) / 1000);
              netSpeed = speedSeconds.toFixed(2);
            } else {
              netSpeed = totalSpeed;
            }

            setSpeeds({ network: netSpeed, total: totalSpeed });
            await saveInvoiceToFirestore("success", transaction.hash, netSpeed, totalSpeed);

            setIsLoading(false);
            setPaymentStatus("success");
          }
        },
        onerror: async (error) => {
          console.error("Stream Error:", error);
          let totalSpeed = "0.00";
          if (paymentStartTime) totalSpeed = ((Date.now() - paymentStartTime) / 1000).toFixed(2);
          await saveInvoiceToFirestore("failed", "", "0.00", totalSpeed);
        }
      });

    streamCloserRef.current = closeStream;
  };

  const generateNewInvoiceId = () => {
    setMemo(`INV${Math.floor(100000 + Math.random() * 900000)}`);
    setPaymentStatus("idle");
    setReceiptHash("");
    setSpeeds({ network: "0.00", total: "0.00" });
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", zIndex: 1, paddingBottom: 60, boxSizing: "border-box" }}>
      <style>{`
        .inv-layout-split { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
        .inv-dual-fields { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: end; margin-bottom: 20px; }
        .inv-card-left { backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,.06); border-radius: 24px; padding: 32px; position: relative; overflow: hidden; }
        .inv-card-right { backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,.06); border-radius: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; position: relative; overflow: hidden; min-height: 450px; box-sizing: border-box; }
        .qr-frame-box { position: relative; width: 100%; max-width: 260px; aspect-ratio: 1/1; margin-bottom: 24px; display: flex; align-items: center; justify-content: center; background: #ffffff; border-radius: 32px; padding: 20px; box-sizing: border-box; }

        @media (max-width: 992px) {
          .inv-layout-split { grid-template-columns: 1fr; gap: 24px; }
        }
        @media (max-width: 576px) {
          .inv-dual-fields { grid-template-columns: 1fr; gap: 12px; align-items: stretch; }
          .inv-dual-fields > div:nth-child(2) { display: none !important; }
          .inv-card-left, .inv-card-right { padding: 20px; min-height: auto; }
          .qr-frame-box { max-width: 220px; padding: 12px; }
        }
      `}</style>

      {isSubscribed && (
        <motion.div
          style={{ position: "absolute", top: "5%", left: "20%", width: 800, height: 800, background: "radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 60%)", borderRadius: "50%", zIndex: -1, pointerEvents: "none" }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
          Receive Payment
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 6 }}>Generate a payment QR code for your customers to scan.</p>
      </div>

      <MonthlyUsageCard
        monthlyUsage={monthlyUsage}
        isSubscribed={isSubscribed}
        usageLimit={sysConfig.freeTierCap}
        projectedUsage={projectedUsage}
      />

      <div className="inv-layout-split">
        <motion.div
          animate={isSubscribed ? {
            boxShadow: ["0px 0px 0px rgba(245,158,11,0)", "0px 10px 40px rgba(245,158,11,0.12)", "0px 0px 0px rgba(245,158,11,0)"],
            borderColor: ["rgba(255,255,255,0.06)", "rgba(245,158,11,0.3)", "rgba(255,255,255,0.06)"]
          } : {}}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="inv-card-left"
          style={{ background: isSubscribed ? "rgba(15, 17, 26, 0.6)" : "rgba(255,255,255,.04)" }}
        >
          <div className="inv-dual-fields">
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Base</div>
                <select value={fiatCurrency} onChange={(e) => setFiatCurrency(e.target.value as "PHP" | "USD")} disabled={paymentStatus !== "idle"} style={{ background: "transparent", color: "#a78bfa", border: "none", fontSize: 12, outline: "none", cursor: "pointer", fontWeight: "bold" }}>
                  <option value="PHP" style={{ color: "#000" }}>PHP (₱)</option>
                  <option value="USD" style={{ color: "#000" }}>USD ($)</option>
                </select>
              </div>
              <input
                type="number"
                value={amountInFiat}
                onChange={handleFiatChange}
                disabled={paymentStatus !== "idle"}
                placeholder="0.00"
                style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }}
              />
            </div>

            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} style={{ paddingBottom: 14, color: isSubscribed ? "#f59e0b" : "#6b7280", fontSize: 20, textAlign: "center" }}>
              ⇄
            </motion.div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Crypto</div>
                <select value={token} onChange={(e) => setToken(e.target.value as "XLM" | "PHPC" | "USDC")} disabled={paymentStatus !== "idle"} style={{ background: "transparent", color: "#a78bfa", border: "none", fontSize: 12, outline: "none", cursor: "pointer", fontWeight: "bold" }}>
                  <option value="USDC" style={{ color: "#000" }}>USDC</option>
                  <option value="PHPC" style={{ color: "#000" }}>PHPC</option>
                  <option value="XLM" style={{ color: "#000" }}>XLM</option>
                </select>
              </div>
              <input
                type="number"
                value={amount}
                onChange={handleCryptoChange}
                disabled={paymentStatus !== "idle"}
                placeholder={token === 'XLM' ? "0.0000000" : "0.00"}
                style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: isSubscribed ? "#fcd34d" : "#a78bfa", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700 }}>Description</div>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={paymentStatus !== "idle"}
              style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Invoice Mode</div>
              <button type="button" onClick={() => setUseContractInvoice(!useContractInvoice)} style={{ background: useContractInvoice ? "rgba(16,185,129,0.16)" : "rgba(59,130,246,0.12)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, color: "#fff", padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>
                {useContractInvoice ? "Contract Invoice" : "Standard Invoice"}
              </button>
            </div>
            {useContractInvoice && (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Soroban Contract ID</div>
                  <input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="CA..." style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Contract Function</div>
                  <input value={contractFunctionName} onChange={(e) => setContractFunctionName(e.target.value)} placeholder="record_invoice" style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Contract Args</div>
                  <input value={contractArgs} onChange={(e) => setContractArgs(e.target.value)} placeholder="merchant,customerName,amount,token,memo" style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none" }} />
                </div>
              </div>
            )}
          </div>

          {contingencyPercentage > 0 && (
            <div style={{ marginBottom: 24, padding: "16px", borderRadius: 16, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#10b981", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, marginBottom: 8 }}>Contingency Reserve</div>
              <div style={{ color: "#d1fae5", fontSize: 13, lineHeight: 1.6 }}>
                This merchant has a contingency reserve of <strong>{contingencyPercentage}%</strong>. When you receive payment, the system will calculate the contingency amount and preserve it as a locked reserve.
              </div>
            </div>
          )}

          {paymentStatus === "idle" ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartListening}
              disabled={willExceedLimit || !merchantAddress}
              style={{
                width: "100%",
                background: willExceedLimit ? "rgba(239, 68, 68, 0.15)" : (isSubscribed ? "linear-gradient(90deg, #f59e0b, #d97706)" : "linear-gradient(135deg,#7c3aed,#4f46e5)"),
                color: willExceedLimit ? "#ef4444" : "#fff",
                border: willExceedLimit ? "1px solid rgba(239, 68, 68, 0.4)" : "none",
                borderRadius: 14,
                padding: "18px 16px",
                fontWeight: 800,
                fontSize: 16,
                cursor: willExceedLimit || !merchantAddress ? "not-allowed" : "pointer",
                fontFamily: "'Nunito',sans-serif",
                position: "relative",
                overflow: "hidden",
                boxShadow: isSubscribed && !willExceedLimit ? "0 8px 25px -6px rgba(245,158,11,0.5)" : "0 8px 25px -6px rgba(124,58,237,0.4)"
              }}
            >
              {isSubscribed && !willExceedLimit && (
                <motion.div animate={{ left: ["-100%", "200%"] }} transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", repeatDelay: 3 }} style={{ position: "absolute", top: 0, bottom: 0, width: "25%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)", transform: "skewX(-20deg)" }} />
              )}
              {willExceedLimit ? "Limit Exceeded" : "Generate QR Code"}
            </motion.button>
          ) : (
            <button type="button" onClick={cancelListening} style={{ width: "100%", background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,.3)", borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", transition: "background 0.2s" }}>
              Cancel & Edit Invoice
            </button>
          )}
        </motion.div>

        <motion.div
          animate={isSubscribed ? {
            boxShadow: ["0px 0px 0px rgba(245,158,11,0)", "0px 10px 40px rgba(245,158,11,0.12)", "0px 0px 0px rgba(245,158,11,0)"],
            borderColor: ["rgba(255,255,255,0.06)", "rgba(245,158,11,0.2)", "rgba(255,255,255,0.06)"]
          } : {}}
          transition={{ duration: 5, delay: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="inv-card-right"
          style={{ background: isSubscribed ? "rgba(15, 17, 26, 0.6)" : "rgba(255,255,255,.04)" }}
        >
          {isSubscribed && (
            <>
              <FloatingNode delay={0} x="15%" y="20%" size={6} color="#f59e0b" blur={2} />
              <FloatingNode delay={0.7} x="85%" y="30%" size={12} color="#10b981" blur={4} />
              <FloatingNode delay={1.5} x="25%" y="75%" size={5} color="#a78bfa" blur={1} />
              <FloatingNode delay={1.0} x="75%" y="70%" size={8} color="#f59e0b" blur={3} />
            </>
          )}

          {paymentStatus === "idle" && (
            <motion.div animate={{ y: isSubscribed ? [-8, 8, -8] : 0 }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} style={{ textAlign: "center", color: "#9ca3af", fontSize: 15, zIndex: 10, maxWidth: 280, lineHeight: 1.6 }}>
              <div style={{ fontSize: 56, marginBottom: 20, filter: isSubscribed ? "drop-shadow(0 0 20px rgba(245,158,11,0.4))" : "none" }}>💸</div>
              Enter details on the left, then generate a QR code to receive payment.
            </motion.div>
          )}

          {paymentStatus === "listening" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10, width: "100%" }}>
              <div style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: isSubscribed ? "#fcd34d" : "#a78bfa", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 24, fontWeight: 700 }}>
                Awaiting Payment...
              </div>

              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, boxShadow: isSubscribed ? "0 0 40px rgba(245,158,11,0.6)" : "0 0 40px rgba(124,58,237,0.6)" }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="qr-frame-box"
                style={{ border: isSubscribed ? "4px solid rgba(245,158,11,0.8)" : "4px solid rgba(124,58,237,0.8)" }}
              >
                <QRCodeSVG value={generateStellarURI()} size={220} level="H" fgColor="#000000" style={{ width: "100%", height: "100%" }} />
              </motion.div>

              <div style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 8, filter: isSubscribed ? "drop-shadow(0 0 10px rgba(245,158,11,0.3))" : "none", textAlign: "center" }}>
                {parseFloat(amount || "0").toLocaleString()} {token}
              </div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#9ca3af", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.05)", padding: "8px 16px", borderRadius: 8, backdropFilter: "blur(12px)", textAlign: "center" }}>
                ID: <span style={{ color: "#fff" }}>{memo}</span>
              </div>
            </div>
          )}

          {paymentStatus === "success" && (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.5 }} style={{ textAlign: "center", width: "100%", zIndex: 10 }}>
              <div style={{ width: 80, height: 80, background: "linear-gradient(135deg, #10b981, #059669)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 40, color: "#fff", boxShadow: "0 10px 30px rgba(16,185,129,0.4)" }}>✓</div>
              <h3 style={{ color: "#fff", margin: "0 0 8px 0", fontFamily: "'Nunito',sans-serif", fontSize: 26, fontWeight: 900 }}>Payment Received!</h3>
              <p style={{ color: "#a7f3d0", fontSize: 22, fontWeight: 800, margin: "0 0 24px 0" }}>
                {parseFloat(amount || "0").toLocaleString()} {token}
              </p>

              <div style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,0.08)", padding: 20, borderRadius: 16, textAlign: "left", marginBottom: 24, backdropFilter: "blur(12px)" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Invoice ID</div>
                <div style={{ color: "#fff", fontFamily: "'DM Mono',monospace", fontSize: 14, marginBottom: 16 }}>{memo}</div>
                <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Tx Hash</div>
                <div style={{ color: "#34d399", fontSize: 12, wordBreak: "break-all", fontFamily: "'DM Mono',monospace" }}>
                  {receiptHash.substring(0, 24)}...
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 24, flexWrap: "wrap" }}>
                <div style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 20, padding: "8px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                  ⚡ Network: {speeds.network}s
                </div>
                <div style={{ background: "rgba(167, 139, 250, 0.15)", color: "#a78bfa", border: "1px solid rgba(167, 139, 250, 0.3)", borderRadius: 20, padding: "8px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                  ⏱️ Total Wait: {speeds.total}s
                </div>
              </div>
              <button type="button" onClick={generateNewInvoiceId} style={{ width: "100%", background: "rgba(255,255,255,.05)", color: "#fff", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                Make Another Invoice
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}