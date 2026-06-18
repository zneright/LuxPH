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
import CryptoJS from "crypto-js";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const FALLBACK_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const FALLBACK_USDC = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export default function CreateInvoice() {
  const [sysConfig, setSysConfig] = useState({
    horizonUrl: "https://horizon-testnet.stellar.org",
    phpcIssuer: FALLBACK_ISSUER,
    usdcIssuer: FALLBACK_ISSUER,
    freeTierCap: 100000,
  });

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  // 🚀 Start with XLM by default
  const [token, setToken] = useState<"XLM" | "PHPC" | "USDC">("XLM");
  const [customerName, setCustomerName] = useState("");
  const [memo, setMemo] = useState("");

  const [merchantAddress, setMerchantAddress] = useState<string>("");
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const [balance, setBalance] = useState("0.00");
  const [isBalanceHidden, setIsBalanceHidden] = useState(true);

  const [vaultConfig, setVaultConfig] = useState<any>(null);
  const [vaultSecretKey, setVaultSecretKey] = useState<string | null>(null);
  const [vaultArmed, setVaultArmed] = useState(false);
  const [decryptedKey, setDecryptedKey] = useState<string | null>(null);

  const [fiatCurrency, setFiatCurrency] = useState<"PHP" | "USD">("PHP");
  const [amountInFiat, setAmountInFiat] = useState("");
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
    return () => {
      if (streamCloserRef.current) streamCloserRef.current();
    };
  }, []);

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

                const savedPin = localStorage.getItem("luxph_vault_pin");
                if (savedPin) {
                  try {
                    const bytes = CryptoJS.AES.decrypt(data.encryptedSecretKey, savedPin);
                    const dec = bytes.toString(CryptoJS.enc.Utf8);
                    if (dec) {
                      Keypair.fromSecret(dec);
                      setDecryptedKey(dec);
                      setVaultArmed(true);
                    }
                  } catch (e) {
                    console.error("Auto-arm failed: Invalid local PIN.");
                  }
                }
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
  }, [merchantAddress, token, sysConfig.horizonUrl, sysConfig.phpcIssuer, sysConfig.usdcIssuer, paymentStatus]);

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

        if (amountInFiat) {
          const parsedFiat = parseFloat(amountInFiat);
          if (!isNaN(parsedFiat)) {
            let newCrypto = (parsedFiat / rate).toFixed(5);
            newCrypto = parseFloat(newCrypto).toString();
            setAmount(newCrypto);
          }
        }
      } catch (e) {
        console.error("Rate fetch failed");
      }
    };
    fetchRate();
    return () => { isMounted = false; };
  }, [token, fiatCurrency]);

  const handleCryptoAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAmount(val);

    if (val === "") {
      setAmountInFiat("");
      return;
    }

    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      setAmountInFiat((parsed * realTimeRate).toFixed(2));
    }
  };

  const handleFiatAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAmountInFiat(val);

    if (val === "") {
      setAmount("");
      return;
    }

    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      let newCrypto = (parsed / realTimeRate).toFixed(5);
      newCrypto = parseFloat(newCrypto).toString();
      setAmount(newCrypto);
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

  const processInstantVaultDeduction = async (paidAmount: string, runtimeKey: string) => {
    if (!vaultConfig || !vaultConfig.networkUrl) {
      console.error("Vault not initialized: Missing Config or URL");
      return;
    }

    try {
      const deduction = parseFloat(paidAmount) * (vaultConfig.deductionPercentage / 100);
      if (deduction <= 0) return;

      const kp = Keypair.fromSecret(runtimeKey);
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

    startListeningForPayment(memo, now, amount, token, fiatCurrency, amountInFiat, description, customerName, decryptedKey);
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
    activeCustomerName: string,
    activeRuntimeKey: string | null
  ) => {
    if (!merchantAddress) return;

    if (streamCloserRef.current) {
      streamCloserRef.current();
      streamCloserRef.current = null;
    }

    processedTxsRef.current.clear();
    setPaymentStatus("listening");

    const server = new Horizon.Server(sysConfig.horizonUrl);
    let isChecking = false;

    const checkTransactions = async () => {
      if (isChecking) return;
      isChecking = true;

      try {
        const response = await server.transactions()
          .forAccount(merchantAddress)
          .order("desc")
          .limit(10)
          .call();

        for (const transaction of response.records) {
          if (processedTxsRef.current.has(transaction.hash)) continue;

          const incomingMemo = transaction.memo ? transaction.memo.toString().trim() : (transaction.memo_text ? transaction.memo_text.trim() : "");

          if (incomingMemo === activeMemo.trim()) {
            processedTxsRef.current.add(transaction.hash);

            if (streamCloserRef.current) {
              streamCloserRef.current();
              streamCloserRef.current = null;
            }

            setReceiptHash(transaction.hash);
            setReceiptDate(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));

            setIsLoading(true);

            if (vaultConfig && activeRuntimeKey) {
              setLoadingMsg(`Routing ${vaultConfig.deductionPercentage}% to Contingency Vault...`);
              await processInstantVaultDeduction(activeAmount, activeRuntimeKey);
            } else {
              setLoadingMsg("Confirming blockchain settlement...");
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

            setSpeeds({ network: netSpeed, total: totalSpeed });

            await saveInvoiceToFirestore(
              "success", transaction.hash, netSpeed, totalSpeed,
              activeMemo, activeAmount, activeToken, activeFiatCurrency, activeFiatAmount, activeDescription, activeCustomerName
            );

            setTimeout(() => {
              setIsLoading(false);
              setPaymentStatus("success");
            }, 800);

            break;
          }
        }
      } catch (error) {
        console.warn("Polling interval skipped due to network blip");
      } finally {
        isChecking = false;
      }
    };

    const intervalId = setInterval(checkTransactions, 3000);
    checkTransactions();

    streamCloserRef.current = () => {
      clearInterval(intervalId);
    };
  };

  const generateNewInvoiceId = () => {
    setMemo(`INV${Math.floor(100000 + Math.random() * 900000)}`);
    setPaymentStatus("idle");
    setReceiptHash("");
    setAmount("");
    setAmountInFiat("");
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

  return (
    <div style={{ position: "relative", minHeight: "100vh", zIndex: 1, paddingBottom: 60, boxSizing: "border-box" }}>
      <style>{`
        /* ULTRA-CLEAN TOKEN-FIRST PREMIUM UI */
        .header-title { font-size: 32px; font-weight: 900; font-family: 'Nunito',sans-serif; color: #111827; margin: 0; letter-spacing: -0.02em; }
        
        .inv-layout-centered { display: flex; flex-direction: column; align-items: center; justify-content: center; max-width: 520px; margin: 0 auto; width: 100%; }

        .premium-input-card { position: relative; border-radius: 36px; padding: 40px 30px; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; z-index: 1; transition: all 0.5s ease; }
        .premium-input-card.standard { background: #ffffff; border: 1px solid #e5e7eb; box-shadow: 0 10px 30px -5px rgba(0,0,0,0.05); }
        .premium-input-card.pro-active { background: #ffffff; border: none; box-shadow: 0 20px 40px -10px rgba(245,158,11,0.15); }
        
        .pro-aura-bg { position: absolute; inset: -4px; border-radius: 40px; background: linear-gradient(135deg, #fcd34d, #10b981, #f59e0b, #34d399, #fcd34d); background-size: 300% 300%; animation: proGradientShift 6s linear infinite; z-index: -2; filter: blur(10px); opacity: 0.6; }
        .pro-card-body { position: absolute; inset: 0; background: #ffffff; border-radius: 36px; z-index: -1; }
        .pro-badge { background: linear-gradient(90deg, #d97706, #059669); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 900; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; position: absolute; top: 26px; right: 26px; font-family: 'DM Mono',monospace; opacity: 0.9; }

        @keyframes proGradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

        /* 🚀 SLEEK WALLET-STYLE BALANCE PILL WIDGET */
        .balance-pill { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 10px 14px 10px 10px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 100px; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 10px rgba(0,0,0,0.04); user-select: none; }
        .balance-pill:hover { background: #f9fafb; transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.06); }
        .balance-pill.pro-active { background: linear-gradient(135deg, #fffbeb, #fef3c7); border-color: #fde68a; box-shadow: 0 4px 15px rgba(245,158,11,0.1); }
        .balance-pill.pro-active:hover { box-shadow: 0 6px 20px rgba(245,158,11,0.15); }
        
        .balance-pill-left { display: flex; align-items: center; gap: 10px; }
        .balance-icon { width: 32px; height: 32px; border-radius: 50%; background: #f3f4f6; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 1px solid #e5e7eb; }
        .balance-pill.pro-active .balance-icon { background: #fcd34d; border-color: #f59e0b; color: #b45309; }
        .balance-label { color: #6b7280; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
        .balance-pill.pro-active .balance-label { color: #d97706; }
        
        .balance-amount { color: #111827; font-size: 16px; font-weight: 900; font-family: 'DM Mono',monospace; letter-spacing: -0.5px; display: flex; align-items: center; gap: 8px; }
        .balance-amount.pro-text { color: #b45309; }

        .primary-token-badge { background: #f3f4f6; padding: 10px 24px; border-radius: 30px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 24px; transition: all 0.2s; border: 1px solid #e5e7eb; }
        .primary-token-badge:hover { background: #e5e7eb; }
        .primary-token-badge.pro-active { background: #fef3c7; border-color: #fde68a; }
        .primary-token-select { background: transparent; color: #111827; border: none; font-size: 18px; font-weight: 900; outline: none; cursor: pointer; appearance: none; font-family: 'Nunito',sans-serif; letter-spacing: 0.5px; }
        .primary-token-select.pro-text { color: #b45309; }
        
        .massive-naked-input { background: transparent; border: none; color: #111827; font-size: 80px; font-weight: 900; text-align: center; outline: none; font-family: 'Nunito',sans-serif; width: 100%; margin-bottom: 12px; letter-spacing: -3px; line-height: 1; transition: color 0.3s; }
        .massive-naked-input.pro-text { color: #d97706; }
        .massive-naked-input::-webkit-outer-spin-button, .massive-naked-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .massive-naked-input[type=number] { -moz-appearance: textfield; }
        .massive-naked-input::placeholder { color: rgba(0,0,0,0.1); }

        .fiat-preview-row { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 auto 36px auto; color: #6b7280; font-size: 18px; font-weight: 700; }
        .naked-fiat-input { background: transparent; border: none; color: #4b5563; font-size: 18px; font-weight: 700; text-align: left; outline: none; font-family: 'Nunito',sans-serif; max-width: 120px; transition: color 0.3s; }
        .naked-fiat-input:focus { color: #111827; }
        .naked-fiat-select { background: transparent; color: #6b7280; border: none; font-size: 18px; font-weight: 800; outline: none; cursor: pointer; appearance: none; font-family: 'Nunito',sans-serif; }

        .simple-text-input { width: 100%; background: transparent; border: none; border-bottom: 2px solid #e5e7eb; padding: 16px 8px; color: #111827; font-size: 16px; font-weight: 600; outline: none; box-sizing: border-box; transition: all 0.3s; text-align: center; margin-bottom: 30px; font-family: 'Nunito',sans-serif; }
        .simple-text-input:focus { border-bottom-color: #3b82f6; }
        .simple-text-input.pro-active:focus { border-bottom-color: #10b981; }
        .simple-text-input::placeholder { color: #9ca3af; font-weight: 500; }

        .premium-btn { width: 100%; color: #fff; border: none; border-radius: 24px; padding: 22px 16px; font-weight: 800; font-size: 18px; cursor: pointer; font-family: 'Nunito',sans-serif; transition: transform 0.1s, opacity 0.2s; box-shadow: 0 10px 25px -5px rgba(59,130,246,0.4); position: relative; overflow: hidden; background: #3b82f6; }
        .premium-btn.pro-active { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 10px 25px -5px rgba(16,185,129,0.4); }
        .premium-btn:active { transform: scale(0.97); }
        .premium-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

        .terminal-card { position: relative; border-radius: 36px; display: flex; flex-direction: column; align-items: center; padding: 40px 30px; width: 100%; box-sizing: border-box; z-index: 1; transition: all 0.5s ease; min-height: 400px; justify-content: center; }
        .terminal-card.standard { background: #ffffff; border: 1px solid #e5e7eb; box-shadow: 0 10px 30px -5px rgba(0,0,0,0.05); }
        .terminal-card.pro-active { background: #ffffff; border: none; box-shadow: 0 20px 40px -10px rgba(16,185,129,0.15); }

        .qr-clean-frame { position: relative; overflow: hidden; background: #ffffff; padding: 24px; border-radius: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 15px 35px rgba(0,0,0,0.08); margin-bottom: 32px; width: 100%; max-width: 280px; aspect-ratio: 1/1; border: 1px solid #f3f4f6; }
        .scanner-laser { position: absolute; left: 0; width: 100%; height: 4px; background: #3b82f6; box-shadow: 0 0 15px 3px rgba(59,130,246,0.6); z-index: 10; animation: scanLaser 2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .scanner-laser.pro-active { background: #10b981; box-shadow: 0 0 15px 3px rgba(16,185,129,0.6); }

        @keyframes scanLaser {
          0% { top: 0%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }

        .confirm-ring-container { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 280px; margin-bottom: 32px; }
        .apple-processing-ring { width: 80px; height: 80px; border-radius: 50%; border: 4px solid #f3f4f6; border-top-color: #3b82f6; border-right-color: #3b82f6; animation: spinSmooth 1s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite; }
        .apple-processing-ring.pro-active { border-top-color: #f59e0b; border-right-color: #10b981; }

        @keyframes spinSmooth { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .clean-receipt { background: #ffffff; border-radius: 24px; padding: 40px 32px; width: 100%; position: relative; box-shadow: 0 20px 50px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; }
        .receipt-action-buttons { display: flex; gap: 12px; width: 100%; margin-top: 20px; }

        @keyframes pulseDot { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }
        .status-badge { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-family: 'DM Mono',monospace; color: #4b5563; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 30px; font-weight: 700; padding: 8px 20px; border-radius: 30px; background: #f3f4f6; border: 1px solid #e5e7eb; }
        .status-badge.pro-active { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }

        @media (max-width: 576px) {
          .massive-naked-input { font-size: 64px; }
          .premium-input-card, .terminal-card { padding: 32px 20px; border-radius: 32px; }
          .qr-clean-frame { padding: 20px; max-width: 240px; border-radius: 32px; }
          .receipt-action-buttons { flex-direction: column; }
          .premium-btn { padding: 20px; font-size: 16px; border-radius: 20px; }
          .clean-receipt { padding: 24px 20px; border-radius: 20px; }
        }
      `}</style>

      <AnimatePresence>
        {isLoading && paymentStatus !== "listening" && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 className="header-title">Request</h1>
          <p style={{ color: "#6b7280", fontSize: 15, marginTop: 4, margin: 0, fontWeight: 600 }}>Create a digital payment request.</p>
        </div>

        {/* 🚀 UPGRADED BALANCE PILL WIDGET */}
        <motion.div
          className={`balance-pill ${isSubscribed ? "pro-active" : ""}`}
          onClick={() => setIsBalanceHidden(!isBalanceHidden)}
          whileTap={{ scale: 0.97 }}
          title="Tap to reveal/hide balance"
        >
          <div className="balance-pill-left">
            <div className="balance-icon">
              {token === "XLM" ? "🚀" : token === "PHPC" ? "₱" : "$"}
            </div>
            <span className="balance-label">{token} Wallet</span>
          </div>
          <span className={`balance-amount ${isSubscribed ? "pro-text" : ""}`}>
            {isBalanceHidden ? "****" : balance}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, cursor: "pointer" }}>
              {isBalanceHidden ? (
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path>
              ) : (
                <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>
              )}
            </svg>
          </span>
        </motion.div>
      </div>

      <MonthlyUsageCard
        monthlyUsage={monthlyUsage}
        isSubscribed={isSubscribed}
        usageLimit={sysConfig.freeTierCap}
        projectedUsage={projectedUsage}
      />

      <div className="inv-layout-centered">

        {/* ----------------------------------------------------------- */}
        {/* IDLE STATE: THE MASSIVE TOKEN-FIRST INPUT                   */}
        {/* ----------------------------------------------------------- */}
        {paymentStatus === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`premium-input-card ${isSubscribed ? "pro-active" : "standard"}`}
          >
            {isSubscribed && (
              <>
                <div className="pro-aura-bg" />
                <div className="pro-card-body" />
                <div className="pro-badge">PRO</div>
              </>
            )}

            <div className={`primary-token-badge ${isSubscribed ? "pro-active" : ""}`}>
              <select value={token} onChange={(e) => setToken(e.target.value as "XLM" | "PHPC" | "USDC")} className={`primary-token-select ${isSubscribed ? "pro-text" : ""}`}>
                <option value="USDC">USDC</option>
                <option value="PHPC">PHPC</option>
                <option value="XLM">XLM</option>
              </select>
              <span style={{ fontSize: 12, color: isSubscribed ? "#d97706" : "#9ca3af" }}>▼</span>
            </div>

            <input
              type="number"
              value={amount}
              onChange={handleCryptoAmountChange}
              placeholder="0"
              className={`massive-naked-input ${isSubscribed ? "pro-text" : ""}`}
              autoFocus
            />

            <div className="fiat-preview-row">
              <span>≈</span>
              <input
                type="number"
                value={amountInFiat}
                onChange={handleFiatAmountChange}
                placeholder="0.00"
                className="naked-fiat-input"
              />
              <select value={fiatCurrency} onChange={(e) => setFiatCurrency(e.target.value as "PHP" | "USD")} className="naked-fiat-select">
                <option value="PHP">PHP</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add a note (optional)"
              className={`simple-text-input ${isSubscribed ? "pro-active" : ""}`}
            />

            {vaultConfig?.isEnabled && (
              <div style={{ width: "100%", marginBottom: 24, padding: "14px", background: "#fef3c7", borderRadius: 16, textAlign: "center", fontSize: 13, color: "#d97706", fontWeight: 700, border: "1px solid #fde68a" }}>
                Vault Active: {vaultConfig.deductionPercentage}% will be secured.
              </div>
            )}

            <button
              type="button"
              onClick={handleStartListening}
              disabled={willExceedLimit || parseFloat(amount || "0") <= 0}
              className={`premium-btn ${isSubscribed ? "pro-active" : ""}`}
              style={{ background: willExceedLimit ? "#ef4444" : undefined }}
            >
              {willExceedLimit ? "Limit Exceeded" : "Generate Request"}
            </button>
          </motion.div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* LISTENING STATE: TERMINAL SCREEN                            */}
        {/* ----------------------------------------------------------- */}
        {paymentStatus === "listening" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`terminal-card ${isSubscribed ? "pro-active" : "standard"}`}
          >
            {isSubscribed && (
              <>
                <div className="pro-aura-bg" />
                <div className="pro-card-body" />
              </>
            )}

            <div className={`status-badge ${isSubscribed ? "pro-active" : ""}`}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: isSubscribed ? "#10b981" : "#3b82f6", animation: "pulseDot 1.5s infinite" }} />
              Awaiting Scan
            </div>

            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 16, color: "#6b7280", marginBottom: 8, fontWeight: 700 }}>{description || "Payment Request"}</div>
              <div style={{ fontSize: 52, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: isSubscribed ? "#d97706" : "#111827", lineHeight: 1, letterSpacing: "-1px" }}>
                {parseFloat(amount || "0").toLocaleString()} {token}
              </div>
            </div>

            {isLoading ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="confirm-ring-container"
              >
                <div className={`apple-processing-ring ${isSubscribed ? 'pro-active' : ''}`} />
                <div style={{ marginTop: 24, fontSize: 18, fontWeight: 800, color: "#111827" }}>
                  Confirming Payment...
                </div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8, fontWeight: 600 }}>
                  {loadingMsg}
                </div>
              </motion.div>
            ) : (
              <div className="qr-clean-frame" style={{ border: isSubscribed ? "2px solid #34d399" : "1px solid #e5e7eb" }}>
                <div className={`scanner-laser ${isSubscribed ? 'pro-active' : ''}`} />
                <QRCodeSVG value={generateStellarURI()} size={240} level="H" fgColor="#000000" style={{ width: "100%", height: "100%" }} />
              </div>
            )}

            {!isLoading && (
              <>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#4b5563", letterSpacing: "1px", marginBottom: 32, background: "#f3f4f6", padding: "10px 24px", borderRadius: 14, fontWeight: 700 }}>
                  ID: {memo}
                </div>
                <button
                  type="button"
                  onClick={cancelListening}
                  style={{ background: "transparent", color: "#6b7280", border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}
                >
                  Cancel Request
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* SUCCESS STATE: HIGH-END RECEIPT                             */}
        {/* ----------------------------------------------------------- */}
        {paymentStatus === "success" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
          >
            <div id="printable-receipt" className="clean-receipt">

              <div style={{ textAlign: "center", marginBottom: 40 }}>
                <div style={{ width: 64, height: 64, background: "#111827", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#fff", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h2 style={{ margin: 0, color: "#111827", fontFamily: "'Nunito',sans-serif", fontSize: 24, fontWeight: 900 }}>Payment Complete</h2>
                <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: 14, fontWeight: 600 }}>Settled instantly via Stellar</p>
              </div>

              <div style={{ borderTop: "2px dashed #e5e7eb", borderBottom: "2px dashed #e5e7eb", padding: "24px 0", marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>Amount</span>
                  <span style={{ color: "#111827", fontSize: 15, fontWeight: 900 }}>+ {parseFloat(amount).toLocaleString()} {token}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>Fiat Value</span>
                  <span style={{ color: "#111827", fontSize: 15, fontWeight: 800 }}>{fiatCurrency === "PHP" ? "₱" : "$"}{parseFloat(amountInFiat).toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>Note</span>
                  <span style={{ color: "#111827", fontSize: 14, fontWeight: 700 }}>{description || "None"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>Date</span>
                  <span style={{ color: "#111827", fontSize: 14, fontWeight: 700 }}>{receiptDate}</span>
                </div>
              </div>

              <div style={{ textAlign: "center", fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono',monospace", wordBreak: "break-all", background: "#f9fafb", padding: 16, borderRadius: 12, border: "1px solid #e5e7eb" }}>
                <div style={{ color: "#9ca3af", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10, fontWeight: 800 }}>Transaction Hash</div>
                {receiptHash}
              </div>

            </div>

            <div className="receipt-action-buttons">
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                style={{ flex: 1, background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 20, padding: "20px", fontWeight: 800, fontSize: 15, cursor: isGeneratingPdf ? "wait" : "pointer", fontFamily: "'Nunito',sans-serif" }}
              >
                {isGeneratingPdf ? "Generating..." : "Save Receipt"}
              </button>
              <button
                type="button"
                onClick={generateNewInvoiceId}
                className={`premium-btn ${isSubscribed ? "pro-active" : ""}`}
                style={{ flex: 1, borderRadius: 20 }}
              >
                New Request
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}