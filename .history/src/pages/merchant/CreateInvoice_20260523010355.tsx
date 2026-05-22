import React, { useState, useEffect, useMemo, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, addDoc } from "firebase/firestore";
import {
  Horizon,
  Keypair,
  Asset,
  TransactionBuilder,
  Networks,
  Operation,
  Claimant,
  BASE_FEE
} from "@stellar/stellar-sdk";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const FALLBACK_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const FALLBACK_USDC = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

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
  const [sysConfig, setSysConfig] = useState({
    horizonUrl: "https://horizon-testnet.stellar.org",
    phpcIssuer: FALLBACK_ISSUER,
    usdcIssuer: FALLBACK_ISSUER,
    freeTierCap: 100000,
  });

  const [amount, setAmount] = useState("15");
  const [description, setDescription] = useState("Sari-sari restock order");
  const [token, setToken] = useState<"XLM" | "PHPC" | "USDC">("USDC");
  const [customerName, setCustomerName] = useState("");
  const [memo, setMemo] = useState("");

  const [merchantAddress, setMerchantAddress] = useState<string>("");
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // --- BALANCE STATE ---
  const [balance, setBalance] = useState("0.00");
  const [isBalanceHidden, setIsBalanceHidden] = useState(true);

  // --- VAULT STATE ---
  const [vaultConfig, setVaultConfig] = useState<any>(null);
  const [vaultSecretKey, setVaultSecretKey] = useState<string | null>(null);

  const [fiatCurrency, setFiatCurrency] = useState<"PHP" | "USD">("PHP");
  const [amountInFiat, setAmountInFiat] = useState("500");
  const [realTimeRate, setRealTimeRate] = useState(1);
  const [usdToPhpRate, setUsdToPhpRate] = useState(56);

  const [paymentStatus, setPaymentStatus] = useState<"idle" | "listening" | "success">("idle");
  const [receiptHash, setReceiptHash] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [speeds, setSpeeds] = useState({ network: "0.00", total: "0.00" });
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Initializing dashboard...");

  const paymentStartTimeRef = useRef<number | null>(null);
  const streamCloserRef = useRef<(() => void) | null>(null);
  const processedTxsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const initSystem = async () => {
      try {
        const configSnap = await getDoc(doc(db, "system_config", "global"));
        let currentFreeCap = 100000;
        let currentHorizon = "https://horizon-testnet.stellar.org";
        let currentIssuer = FALLBACK_ISSUER;
        let currentUsdcIssuer = FALLBACK_ISSUER;

        if (configSnap.exists()) {
          const c = configSnap.data();
          const isTestnet = c.stellarNetwork === "Testnet (Futurenet)";
          currentFreeCap = c.freeTierMonthlyCap || 100000;
          currentHorizon = isTestnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
          currentIssuer = c.phpcIssuerAddress || FALLBACK_ISSUER;
          currentUsdcIssuer = c.usdcIssuerAddress || FALLBACK_ISSUER;

          setSysConfig({
            horizonUrl: currentHorizon,
            phpcIssuer: currentIssuer,
            usdcIssuer: currentUsdcIssuer,
            freeTierCap: currentFreeCap,
          });
        }

        onAuthStateChanged(auth, async (currentUser) => {
          if (currentUser) {
            const mDoc = await getDoc(doc(db, "merchants", currentUser.uid));
            if (mDoc.exists()) {
              const data = mDoc.data();
              setIsSubscribed(data?.isSubscribed === true);
              if (data?.stellarPublicKey) setMerchantAddress(data.stellarPublicKey);

              if (data?.vaultConfig?.isEnabled && data?.encryptedSecretKey) {
                setVaultConfig(data.vaultConfig);
                setVaultSecretKey(data.encryptedSecretKey);
              }
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

  // Fetch Balance
  useEffect(() => {
    if (!merchantAddress) return;
    const fetchBalance = async () => {
      try {
        const server = new Horizon.Server(sysConfig.horizonUrl);
        const account = await server.loadAccount(merchantAddress);

        const balanceObj = account.balances.find((b: any) => {
          if (token === "XLM") return b.asset_type === "native";
          const targetIssuer = token === "PHPC" ? sysConfig.phpcIssuer : sysConfig.usdcIssuer;
          return b.asset_code === token && b.asset_issuer === targetIssuer;
        });

        setBalance(balanceObj ? parseFloat(balanceObj.balance).toLocaleString() : "0.00");
      } catch (e) {
        setBalance("0.00");
      }
    };
    fetchBalance();
  }, [merchantAddress, token, sysConfig.horizonUrl, sysConfig.phpcIssuer, sysConfig.usdcIssuer, paymentStatus]); // Refresh balance when paymentStatus changes

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

        const parsedFiat = parseFloat(amountInFiat);
        if (!isNaN(parsedFiat)) setAmount((parsedFiat / rate).toFixed(2));
      } catch (e) {
        console.error("Rate fetch failed");
      }
    };
    fetchRate();
    return () => { isMounted = false; };
  }, [amountInFiat, token, fiatCurrency]);

  const handleCryptoAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCryptoAmount = e.target.value;
    setAmount(newCryptoAmount);

    const parsedCrypto = parseFloat(newCryptoAmount);
    if (!isNaN(parsedCrypto)) setAmountInFiat((parsedCrypto * realTimeRate).toFixed(2));
    else setAmountInFiat("");
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

  const saveInvoiceToFirestore = async (
    status: "success" | "failed" | "cancelled",
    txHash: string = "",
    netSpeed: string = "0.00",
    totalSpeed: string = "0.00",
    invMemo = memo,
    invAmount = amount,
    invToken = token,
    invFiatCurrency = fiatCurrency,
    invFiatAmount = amountInFiat,
    invDesc = description,
    invCustomerName = customerName
  ) => {
    if (!auth.currentUser) return;
    try {
      const invoiceRef = doc(db, `merchants/${auth.currentUser.uid}/invoices`, invMemo);
      await setDoc(invoiceRef, {
        type: "received",
        invoiceId: invMemo,
        amount: invAmount,
        token: invToken,
        fiatAmount: invFiatAmount,
        fiatCurrency: invFiatCurrency,
        description: invDesc,
        customerName: invCustomerName,
        txHash: txHash,
        status: status,
        timestamp: new Date().toISOString(),
        processingTimeSeconds: parseFloat(netSpeed),
        networkSpeedSeconds: parseFloat(netSpeed),
        totalWaitTimeSeconds: parseFloat(totalSpeed)
      }, { merge: true });
    } catch (err) { console.error("Firestore Save Error:", err); }
  };

  const processInstantVaultDeduction = async (paidAmount: string) => {
    if (!vaultConfig || !vaultSecretKey || !vaultConfig.networkUrl) {
      console.error("Vault not initialized: Missing Config or URL");
      return;
    }

    try {
      const deduction = parseFloat(paidAmount) * (vaultConfig.deductionPercentage / 100);
      if (deduction <= 0) return;

      const kp = Keypair.fromSecret(vaultSecretKey);
      const server = new Horizon.Server(vaultConfig.networkUrl);
      const account = await server.loadAccount(kp.publicKey());

      const unlockDate = new Date();
      unlockDate.setDate(unlockDate.getDate() + vaultConfig.lockDurationDays);

      const timePredicate = Claimant.predicateNot(
        Claimant.predicateBeforeAbsoluteTime(Math.floor(unlockDate.getTime() / 1000).toString())
      );

      const vaultIssuer = vaultConfig.targetAsset === "PHPC" ? sysConfig.phpcIssuer : sysConfig.usdcIssuer;
      let assetToLock = vaultConfig.targetAsset === "XLM"
        ? Asset.native()
        : new Asset(vaultConfig.targetAsset, vaultIssuer);

      const op = Operation.createClaimableBalance({
        asset: assetToLock,
        amount: deduction.toFixed(7),
        claimants: [new Claimant(kp.publicKey(), timePredicate)]
      });

      const networkPassphrase = sysConfig.horizonUrl.includes("testnet") ? Networks.TESTNET : Networks.PUBLIC;

      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
        .addOperation(op)
        .setTimeout(30)
        .build();

      tx.sign(kp);
      const response = await server.submitTransaction(tx);

      const successMsg = `Instant vault allocation successful: ${deduction.toFixed(2)} ${vaultConfig.targetAsset}. Tx: ${response.hash.substring(0, 8)}...`;
      if (auth.currentUser) {
        await addDoc(collection(db, `merchants/${auth.currentUser.uid}/telemetry`), {
          msg: successMsg,
          time: new Date().toISOString(),
          type: "success"
        });
      }

    } catch (error: any) {
      const errCodes = error.response?.data?.extras?.result_codes?.operations?.join(",") || error.message || "Unknown ledger error";
      const errMsg = `Instant vault lock failed: ${errCodes}`;

      if (auth.currentUser) {
        await addDoc(collection(db, `merchants/${auth.currentUser.uid}/telemetry`), {
          msg: errMsg,
          time: new Date().toISOString(),
          type: "warn"
        });
      }
    }
  };

  const handleStartListening = async () => {
    if (willExceedLimit) {
      alert(`⚠️ This transaction exceeds your free tier limit (${sysConfig.freeTierCap.toLocaleString()} PHP). Please subscribe to continue.`);
      return;
    }
    if (streamCloserRef.current) {
      streamCloserRef.current();
      streamCloserRef.current = null;
    }
    processedTxsRef.current.clear();

    const now = Date.now();
    paymentStartTimeRef.current = now;

    startListeningForPayment(memo, now, amount, token, fiatCurrency, amountInFiat, description, customerName);
  };

  const cancelListening = async () => {
    let totalSpeed = "0.00";
    if (paymentStartTimeRef.current) totalSpeed = ((Date.now() - paymentStartTimeRef.current) / 1000).toFixed(2);

    if (streamCloserRef.current) {
      streamCloserRef.current();
      streamCloserRef.current = null;
    }
    await saveInvoiceToFirestore("cancelled", "", "0.00", totalSpeed);
    setPaymentStatus("idle");
  };

  const startListeningForPayment = (
    activeMemo: string,
    activeStartTime: number,
    activeAmount: string,
    activeToken: "XLM" | "PHPC" | "USDC",
    activeFiatCurrency: string,
    activeFiatAmount: string,
    activeDescription: string,
    activeCustomerName: string
  ) => {
    if (!merchantAddress) return;

    if (streamCloserRef.current) {
      streamCloserRef.current();
      streamCloserRef.current = null;
    }
    processedTxsRef.current.clear();
    setPaymentStatus("listening");

    const server = new Horizon.Server(sysConfig.horizonUrl);
    const closeStream = server.transactions()
      .forAccount(merchantAddress)
      .cursor("now")
      .stream({
        onmessage: async (transaction: any) => {
          if (!transaction.hash || processedTxsRef.current.has(transaction.hash)) return;
          processedTxsRef.current.add(transaction.hash);

          const incomingMemo = transaction.memo ? transaction.memo.toString().trim() : (transaction.memo_text ? transaction.memo_text.trim() : "");
          if (incomingMemo !== activeMemo.trim()) return;

          setReceiptHash(transaction.hash);
          setReceiptDate(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
          setIsLoading(true);

          if (vaultConfig && vaultSecretKey) {
            setLoadingMsg(`Routing ${vaultConfig.deductionPercentage}% to Contingency Vault...`);
            await processInstantVaultDeduction(activeAmount);
          } else {
            setLoadingMsg("Confirming payment & generating receipt...");
          }

          const receiveTime = Date.now();
          let totalSpeed = "0.00";
          let netSpeed = "0.00";

          if (activeStartTime) totalSpeed = ((receiveTime - activeStartTime) / 1000).toFixed(2);

          if (transaction.created_at) {
            const ledgerTime = new Date(transaction.created_at).getTime();
            const speedSeconds = Math.max(0.1, Math.abs(receiveTime - ledgerTime) / 1000);
            netSpeed = speedSeconds.toFixed(2);
          } else {
            netSpeed = totalSpeed;
          }

          if (streamCloserRef.current) {
            streamCloserRef.current();
            streamCloserRef.current = null;
          }

          setSpeeds({ network: netSpeed, total: totalSpeed });

          await saveInvoiceToFirestore(
            "success", transaction.hash, netSpeed, totalSpeed,
            activeMemo, activeAmount, activeToken, activeFiatCurrency, activeFiatAmount, activeDescription, activeCustomerName
          );

          setIsLoading(false);
          setPaymentStatus("success");
        },
        onerror: async (error) => {
          console.error("Stream Error:", error);
          if (streamCloserRef.current) {
            streamCloserRef.current();
            streamCloserRef.current = null;
          }
          processedTxsRef.current.clear();
          let totalSpeed = "0.00";
          if (activeStartTime) totalSpeed = ((Date.now() - activeStartTime) / 1000).toFixed(2);

          await saveInvoiceToFirestore(
            "failed", "", "0.00", totalSpeed,
            activeMemo, activeAmount, activeToken, activeFiatCurrency, activeFiatAmount, activeDescription, activeCustomerName
          );

          setIsLoading(false);
          setPaymentStatus("idle");
          alert("Payment listener encountered a connection issue. Please try generating the invoice again.");
        }
      });

    streamCloserRef.current = closeStream;
  };

  const generateNewInvoiceId = () => {
    setMemo(`INV${Math.floor(100000 + Math.random() * 900000)}`);
    setPaymentStatus("idle");
    setReceiptHash("");
    paymentStartTimeRef.current = null;
    setSpeeds({ network: "0.00", total: "0.00" });
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById("printable-receipt");
    if (!element) return;

    setIsGeneratingPdf(true);
    try {
      await document.fonts.ready;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 10, pdfWidth, pdfHeight);
      pdf.save(`LUXPH_Receipt_${memo}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Failed to generate PDF. Check console for details.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const isTestnet = sysConfig.horizonUrl.includes("testnet");
  const networkName = isTestnet ? "TESTNET" : "MAINNET";

  return (
    <div style={{ position: "relative", minHeight: "100vh", zIndex: 1, paddingBottom: 60, boxSizing: "border-box" }}>
      <style>{`
        .inv-layout-split { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
        .inv-dual-fields { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: end; margin-bottom: 20px; }
        .inv-card-left { backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,.06); border-radius: 24px; padding: 32px; position: relative; overflow: hidden; }
        .inv-card-right { backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,.06); border-radius: 24px; display: flex; flexDirection: column; align-items: center; justify-content: center; padding: 40px; position: relative; overflow: hidden; min-height: 450px; box-sizing: border-box; }
        .qr-frame-box { position: relative; width: 100%; max-width: 260px; aspect-ratio: 1/1; margin-bottom: 24px; display: flex; items-center: center; justify-content: center; background: #ffffff; border-radius: 32px; padding: 20px; box-sizing: border-box; }
        .receipt-action-buttons { display: flex; gap: 12px; width: 100%; margin-top: 16px; }

        @media (max-width: 992px) {
          .inv-layout-split { grid-template-columns: 1fr; gap: 24px; }
        }
        @media (max-width: 576px) {
          .inv-dual-fields { grid-template-columns: 1fr; gap: 12px; align-items: stretch; }
          .inv-dual-fields > div:nth-child(2) { display: none !important; }
          .inv-card-left, .inv-card-right { padding: 20px; min-height: auto; }
          .qr-frame-box { max-width: 220px; padding: 12px; }
          .receipt-action-buttons { flex-direction: column; }
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
            Receive Payment
          </h1>
          <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 6 }}>Generate a payment QR code for your customers.</p>
        </div>

        {/* TOGGLEABLE BALANCE UI */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, cursor: "pointer", transition: "all 0.2s" }} onClick={() => setIsBalanceHidden(!isBalanceHidden)}>
          <span style={{ color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Mono',monospace" }}>{token} Balance:</span>
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono',monospace", display: "flex", alignItems: "center", gap: 8 }}>
            {isBalanceHidden ? "••••••••" : `${balance}`}
            <span style={{ fontSize: 14, opacity: 0.7 }}>{isBalanceHidden ? "👁️" : "🙈"}</span>
          </span>
        </div>
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
              <input type="number" value={amountInFiat} onChange={e => setAmountInFiat(e.target.value)} disabled={paymentStatus !== "idle"} placeholder="0.00" style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }} />
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
              <input type="number" value={amount} onChange={handleCryptoAmountChange} disabled={paymentStatus !== "idle"} placeholder="0.00" style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: isSubscribed ? "#fcd34d" : "#a78bfa", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }} />
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

          {paymentStatus === "idle" ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartListening}
              disabled={willExceedLimit}
              style={{
                width: "100%",
                background: willExceedLimit ? "rgba(239, 68, 68, 0.15)" : (isSubscribed ? "linear-gradient(90deg, #f59e0b, #d97706)" : "linear-gradient(135deg,#7c3aed,#4f46e5)"),
                color: willExceedLimit ? "#ef4444" : "#fff",
                border: willExceedLimit ? "1px solid rgba(239, 68, 68, 0.4)" : "none",
                borderRadius: 14,
                padding: "18px 16px",
                fontWeight: 800,
                fontSize: 16,
                cursor: willExceedLimit ? "not-allowed" : "pointer",
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
          style={{ background: isSubscribed ? "rgba(15, 17, 26, 0.6)" : "rgba(255,255,255,.04)", padding: paymentStatus === "success" ? "24px" : "40px" }}
        >
          {isSubscribed && paymentStatus !== "success" && (
            <>
              <FloatingNode delay={0} x="15%" y="20%" size={6} color="#f59e0b" blur={2} />
              <FloatingNode delay={0.7} x="85%" y="30%" size={12} color="#10b981" blur={4} />
              <FloatingNode delay={1.5} x="25%" y="75%" size={5} color="#a78bfa" blur={1} />
              <FloatingNode delay={1.0} x="75%" y="70%" size={8} color="#f59e0b" blur={3} />
            </>
          )}

          {paymentStatus === "idle" && (
            <motion.div animate={isSubscribed ? { y: [-8, 8, -8] } : {}} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} style={{ textAlign: "center", color: "#9ca3af", fontSize: 15, zIndex: 10, maxWidth: 280, lineHeight: 1.6 }}>
              <div style={{ fontSize: 56, marginBottom: 20, filter: isSubscribed ? "drop-shadow(0 0 20px rgba(245,158,11,0.4))" : "none" }}>💸</div>
              Enter details on the left, then generate a payment QR code.
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
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}
            >
              <div style={{ width: "100%", maxWidth: 480 }}>
                {/* IDENTICAL RECEIPT PDF CONTAINER */}
                <div id="printable-receipt" style={{ background: "#ffffff", borderRadius: 16, padding: "40px 32px", position: "relative", overflow: "hidden" }}>

                  <div style={{ textAlign: "center", marginBottom: "32px", marginTop: "8px", padding: "10px" }}>
                    <img
                      src="/images/luxphlogo.svg"
                      alt="Lux PH Icon"
                      style={{
                        height: "36px",
                        width: "auto",
                        display: "inline-block",
                        verticalAlign: "middle",
                        marginRight: "12px",
                        position: "relative",
                        top: "8px"
                      }}
                      crossOrigin="anonymous"
                    />
                    <span style={{
                      fontSize: "32px",
                      fontWeight: 900,
                      color: "#0f172a",
                      fontFamily: "'Nunito',sans-serif",
                      letterSpacing: "1px",
                      display: "inline-block",
                      verticalAlign: "middle"
                    }}>
                      LUX PH
                    </span>
                  </div>

                  <div style={{ textAlign: "center", marginBottom: 36 }}>
                    <div style={{ width: 72, height: 72, background: "#10b981", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#fff" }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>

                    <h2 style={{ margin: 0, color: "#0f172a", fontFamily: "'Nunito',sans-serif", fontSize: 26, fontWeight: 900 }}>Payment Received</h2>
                    <p style={{ margin: "6px 0 0 0", color: "#64748b", fontSize: 14 }}>Transaction successfully settled on-chain.</p>
                  </div>

                  <div style={{ borderTop: "2px dashed #e5e7eb", borderBottom: "2px dashed #e5e7eb", padding: "24px 0", marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#6b7280", fontSize: 13 }}>Invoice ID</span>
                      <span style={{ color: "#111827", fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{memo}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#6b7280", fontSize: 13 }}>Date & Time</span>
                      <span style={{ color: "#111827", fontSize: 13, fontWeight: 600 }}>{receiptDate}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#6b7280", fontSize: 13 }}>Description</span>
                      <span style={{ color: "#111827", fontSize: 13, fontWeight: 600 }}>{description || "Payment"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#6b7280", fontSize: 13 }}>Amount Received</span>
                      <span style={{ color: "#10b981", fontSize: 13, fontWeight: 700 }}>+ {parseFloat(amount).toLocaleString()} {token}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <span style={{ color: "#374151", fontSize: 16, fontWeight: 700 }}>{fiatCurrency} Value</span>
                    <span style={{ color: "#10b981", fontSize: 28, fontWeight: 800, fontFamily: "'Nunito',sans-serif" }}>
                      {fiatCurrency === "PHP" ? "₱" : "$"}{parseFloat(amountInFiat).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", fontFamily: "'DM Mono',monospace", wordBreak: "break-all", background: "#f3f4f6", padding: 12, borderRadius: 8 }}>
                    <div style={{ color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10 }}>Stellar Transaction Hash</div>
                    {receiptHash}
                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
                    <div style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                      ⚡ Network: {speeds.network}s
                    </div>
                    <div style={{ background: "rgba(10, 37, 64, 0.1)", color: "#0a2540", border: "1px solid rgba(10, 37, 64, 0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                      ⏱️ Total: {speeds.total}s
                    </div>
                    <div style={{ background: isTestnet ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)", color: isTestnet ? "#ef4444" : "#3b82f6", border: isTestnet ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(59,130,246,0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                      🌐 {networkName}
                    </div>
                  </div>
                </div>

                <div className="receipt-action-buttons">
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPdf}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,.05)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,.1)",
                      borderRadius: 8,
                      padding: "12px",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: isGeneratingPdf ? "wait" : "pointer",
                      fontFamily: "'Nunito',sans-serif",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px"
                    }}
                  >
                    {isGeneratingPdf ? "⏳ Generating..." : "📄 Download PDF"}
                  </button>
                  <button type="button" onClick={generateNewInvoiceId} style={{ flex: 1, background: "rgba(10, 37, 64, 0.5)", color: "#93c5fd", border: "1px solid #1e3a8a", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                    + New Invoice
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}