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

  const [amount, setAmount] = useState("15");
  const [description, setDescription] = useState("");
  const [token, setToken] = useState<"XLM" | "PHPC" | "USDC">("USDC");
  const [customerName, setCustomerName] = useState("");
  const [memo, setMemo] = useState("");

  const [merchantAddress, setMerchantAddress] = useState<string>("");
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const [balance, setBalance] = useState("0.00");
  const [isBalanceHidden, setIsBalanceHidden] = useState(true);

  // --- AUTOMATED VAULT STATE ---
  const [vaultConfig, setVaultConfig] = useState<any>(null);
  const [vaultSecretKey, setVaultSecretKey] = useState<string | null>(null);
  const [vaultArmed, setVaultArmed] = useState(false);
  const [decryptedKey, setDecryptedKey] = useState<string | null>(null);

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

  // Cleanup polling on unmount
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

              // 🔥 AUTOMATIC DEVICE ARMING CHECK
              if (data?.vaultConfig?.isEnabled && data?.encryptedSecretKey) {
                setVaultConfig(data.vaultConfig);
                setVaultSecretKey(data.encryptedSecretKey);

                const savedPin = localStorage.getItem("luxph_vault_pin");
                if (savedPin) {
                  try {
                    const bytes = CryptoJS.AES.decrypt(data.encryptedSecretKey, savedPin);
                    const dec = bytes.toString(CryptoJS.enc.Utf8);
                    if (dec) {
                      Keypair.fromSecret(dec); // Verify it's a real key
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

        // ALWAYS keep inputs dynamically synced when dropdowns change!
        if (amountInFiat) {
          const parsedFiat = parseFloat(amountInFiat);
          if (!isNaN(parsedFiat)) {
            let newCrypto = (parsedFiat / rate).toFixed(5);
            newCrypto = parseFloat(newCrypto).toString(); // remove trailing zeroes safely
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

            setSpeeds({ network: netSpeed, total: totalSpeed });

            await saveInvoiceToFirestore(
              "success", transaction.hash, netSpeed, totalSpeed,
              activeMemo, activeAmount, activeToken, activeFiatCurrency, activeFiatAmount, activeDescription, activeCustomerName
            );

            setIsLoading(false);
            setPaymentStatus("success");
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
    setAmount("0.00");
    setAmountInFiat("0.00");
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
        /* ULTRA-CLEAN TOKEN-FIRST PREMIUM UI */
        .header-title { font-size: 32px; font-weight: 800; font-family: 'Nunito',sans-serif; color: #fff; margin: 0; letter-spacing: -0.02em; }
        
        .inv-layout-centered { display: flex; flex-direction: column; align-items: center; justify-content: center; max-width: 520px; margin: 0 auto; width: 100%; }

        /* The Premium Input Card with dynamic PRO styling */
        .premium-input-card { position: relative; border-radius: 36px; padding: 40px 30px; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; overflow: hidden; z-index: 1; transition: all 0.5s ease; }
        .premium-input-card.standard { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); }
        .premium-input-card.pro-active { background: linear-gradient(145deg, rgba(20,20,30,0.85) 0%, rgba(10,10,15,0.95) 100%); border: 1px solid rgba(245,158,11,0.3); box-shadow: 0 20px 50px -10px rgba(245,158,11,0.15), inset 0 0 20px rgba(245,158,11,0.05); }
        
        .pro-badge { background: linear-gradient(90deg, #fcd34d, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 900; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; position: absolute; top: 26px; right: 26px; font-family: 'DM Mono',monospace; opacity: 0.9; }

        /* SLEEK BALANCE PILL WIDGET */
        .balance-pill { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 30px; cursor: pointer; transition: all 0.3s ease; backdrop-filter: blur(10px); }
        .balance-pill:hover { background: rgba(255,255,255,0.05); transform: translateY(-2px); }
        .balance-pill.pro-active { background: rgba(245,158,11,0.05); border-color: rgba(245,158,11,0.2); }
        .balance-pill.pro-active:hover { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.4); box-shadow: 0 4px 15px rgba(245,158,11,0.1); }
        
        .balance-label { color: #9ca3af; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .balance-amount { color: #fff; font-size: 16px; font-weight: 800; font-family: 'DM Mono',monospace; min-width: 60px; text-align: right; }
        .balance-amount.pro-text { color: #fcd34d; }

        /* TOKEN SELECTOR (The absolute center of attention) */
        .primary-token-badge { background: rgba(255,255,255,0.05); padding: 10px 24px; border-radius: 30px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 24px; backdrop-filter: blur(10px); transition: all 0.2s; border: 1px solid rgba(255,255,255,0.05); }
        .primary-token-badge:hover { background: rgba(255,255,255,0.1); }
        .primary-token-select { background: transparent; color: #fff; border: none; font-size: 18px; font-weight: 900; outline: none; cursor: pointer; appearance: none; font-family: 'Nunito',sans-serif; letter-spacing: 0.5px; }
        
        /* Naked Huge Input - NOW FOR CRYPTO */
        .massive-naked-input { background: transparent; border: none; color: #fff; font-size: 80px; font-weight: 800; text-align: center; outline: none; font-family: 'Nunito',sans-serif; width: 100%; margin-bottom: 12px; letter-spacing: -3px; line-height: 1; transition: color 0.3s; }
        .massive-naked-input.pro-text { color: #fcd34d; text-shadow: 0 0 30px rgba(245,158,11,0.4); }
        .massive-naked-input::-webkit-outer-spin-button, .massive-naked-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .massive-naked-input[type=number] { -moz-appearance: textfield; }
        .massive-naked-input::placeholder { color: rgba(255,255,255,0.1); }

        /* Secondary Fiat Preview underneath */
        .fiat-preview-row { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 auto 36px auto; color: #9ca3af; font-size: 18px; font-weight: 600; }
        .naked-fiat-input { background: transparent; border: none; color: #9ca3af; font-size: 18px; font-weight: 600; text-align: left; outline: none; font-family: 'Nunito',sans-serif; max-width: 120px; transition: color 0.3s; }
        .naked-fiat-input:focus { color: #fff; }
        .naked-fiat-select { background: transparent; color: #9ca3af; border: none; font-size: 18px; font-weight: 700; outline: none; cursor: pointer; appearance: none; font-family: 'Nunito',sans-serif; }

        /* Simple Text Input */
        .simple-text-input { width: 100%; background: transparent; border: none; border-bottom: 2px solid rgba(255,255,255,0.1); padding: 16px 8px; color: #fff; font-size: 16px; outline: none; box-sizing: border-box; transition: all 0.3s; text-align: center; margin-bottom: 30px; font-family: 'Nunito',sans-serif; }
        .simple-text-input:focus { border-bottom-color: #3b82f6; }
        .simple-text-input::placeholder { color: rgba(255,255,255,0.3); }

        /* Big Premium Button */
        .premium-btn { width: 100%; background: #fff; color: #000; border: none; border-radius: 24px; padding: 22px 16px; font-weight: 800; font-size: 18px; cursor: pointer; font-family: 'Nunito',sans-serif; transition: transform 0.1s, opacity 0.2s; box-shadow: 0 10px 30px -10px rgba(255,255,255,0.3); position: relative; overflow: hidden; }
        .premium-btn:active { transform: scale(0.97); }
        .premium-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

        /* Terminal Display Cards */
        .terminal-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 36px; display: flex; flex-direction: column; align-items: center; padding: 40px 30px; width: 100%; box-sizing: border-box; position: relative; z-index: 1; }

        .qr-clean-frame { background: #fff; padding: 24px; border-radius: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 20px 40px rgba(0,0,0,0.2); margin-bottom: 32px; width: 100%; max-width: 280px; aspect-ratio: 1/1; }

        /* Clean Receipt */
        .clean-receipt { background: #fff; border-radius: 24px; padding: 40px 32px; width: 100%; position: relative; box-shadow: 0 20px 50px rgba(0,0,0,0.15); }
        .receipt-action-buttons { display: flex; gap: 12px; width: 100%; margin-top: 20px; }

        @keyframes pulseDot {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
        .status-badge { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-family: 'DM Mono',monospace; color: #9ca3af; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 30px; font-weight: 600; padding: 8px 20px; border-radius: 30px; background: rgba(255,255,255,0.05); }

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
        {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 className="header-title">Request</h1>
          <p style={{ color: "#9ca3af", fontSize: 15, marginTop: 4, margin: 0, fontWeight: 500 }}>Create a digital payment request.</p>
        </div>

        {/* --- NEW SLEEK BALANCE PILL WIDGET --- */}
        <motion.div
          className={`balance-pill ${isSubscribed ? "pro-active" : ""}`}
          onClick={() => setIsBalanceHidden(!isBalanceHidden)}
          whileTap={{ scale: 0.95 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: isSubscribed ? "#fcd34d" : "#3b82f6" }} />
            <span className="balance-label">{token} Balance</span>
          </div>
          <span className={`balance-amount ${isSubscribed ? "pro-text" : ""}`}>
            {isBalanceHidden ? "••••••••" : balance}
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
            {/* ✨ STUNNING PRO ANIMATION (GLASS AURA) ✨ */}
            {isSubscribed && (
              <>
                <motion.div
                  style={{ position: "absolute", inset: "-50%", zIndex: -2, background: "conic-gradient(from 0deg, transparent 0%, rgba(245, 158, 11, 0.15) 25%, transparent 50%, rgba(124, 58, 237, 0.15) 75%, transparent 100%)", filter: "blur(40px)" }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                />
                <div className="pro-badge">PRO</div>
              </>
            )}

            {/* TOKEN SELECTOR (Now the primary focus at the top) */}
            <div className="primary-token-badge">
              <select value={token} onChange={(e) => setToken(e.target.value as "XLM" | "PHPC" | "USDC")} className="primary-token-select" style={{ color: isSubscribed ? "#fcd34d" : "#fff" }}>
                <option value="USDC" style={{ color: "#000" }}>USDC</option>
                <option value="PHPC" style={{ color: "#000" }}>PHPC</option>
                <option value="XLM" style={{ color: "#000" }}>XLM</option>
              </select>
              <span style={{ fontSize: 12, color: isSubscribed ? "#fcd34d" : "#9ca3af" }}>▼</span>
            </div>

            {/* Massive Number Input - PERFECTLY SYNCHED */}
            <input
              type="number"
              value={amount}
              onChange={handleCryptoAmountChange}
              placeholder="0"
              className={`massive-naked-input ${isSubscribed ? "pro-text" : ""}`}
              autoFocus
            />

            {/* Fiat Conversion Preview underneath - PERFECTLY SYNCHED */}
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
                <option value="PHP" style={{ color: "#000" }}>PHP</option>
                <option value="USD" style={{ color: "#000" }}>USD</option>
              </select>
            </div>

            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add a note (optional)"
              className="simple-text-input"
            />

            {vaultConfig?.isEnabled && (
              <div style={{ width: "100%", marginBottom: 24, padding: "14px", background: "rgba(255,255,255,0.02)", borderRadius: 16, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>
                Vault Active: {vaultConfig.deductionPercentage}% will be secured.
              </div>
            )}

            <button
              type="button"
              onClick={handleStartListening}
              disabled={willExceedLimit || parseFloat(amount || "0") <= 0}
              className="premium-btn"
              style={{
                background: isSubscribed ? "linear-gradient(135deg, #f59e0b, #d97706)" : "#fff",
                color: isSubscribed ? "#fff" : "#000",
              }}
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
            {/* ✨ STUNNING PRO ANIMATION (GLASS AURA) ✨ */}
            {isSubscribed && (
              <motion.div
                style={{ position: "absolute", inset: "-50%", zIndex: -2, background: "conic-gradient(from 0deg, transparent 0%, rgba(245, 158, 11, 0.1) 25%, transparent 50%, rgba(16, 185, 129, 0.1) 75%, transparent 100%)", filter: "blur(50px)" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              />
            )}

            <div className="status-badge">
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", animation: "pulseDot 1.5s infinite" }} />
              Awaiting Scan
            </div>

            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 16, color: "#9ca3af", marginBottom: 8, fontWeight: 600 }}>{description || "Payment Request"}</div>
              <div style={{ fontSize: 52, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: isSubscribed ? "#fcd34d" : "#fff", lineHeight: 1, letterSpacing: "-1px" }}>
                {parseFloat(amount || "0").toLocaleString()} {token}
              </div>
            </div>

            <div className="qr-clean-frame" style={{ boxShadow: isSubscribed ? "0 20px 50px rgba(245,158,11,0.2)" : "0 20px 40px rgba(0,0,0,0.2)" }}>
              <QRCodeSVG value={generateStellarURI()} size={240} level="H" fgColor="#000000" style={{ width: "100%", height: "100%" }} />
            </div>

            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#6b7280", letterSpacing: "1px", marginBottom: 32 }}>
              ID: {memo}
            </div>

            <button
              type="button"
              onClick={cancelListening}
              style={{ background: "transparent", color: "#9ca3af", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}
            >
              Cancel Request
            </button>
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
                <div style={{ width: 64, height: 64, background: "#000", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#fff" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h2 style={{ margin: 0, color: "#000", fontFamily: "'Nunito',sans-serif", fontSize: 24, fontWeight: 900 }}>Payment Complete</h2>
                <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: 14 }}>Settled instantly via Stellar</p>
              </div>

              <div style={{ borderTop: "1px dashed #d1d5db", borderBottom: "1px dashed #d1d5db", padding: "24px 0", marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#6b7280", fontSize: 14 }}>Amount</span>
                  <span style={{ color: "#000", fontSize: 15, fontWeight: 800 }}>+ {parseFloat(amount).toLocaleString()} {token}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#6b7280", fontSize: 14 }}>Fiat Value</span>
                  <span style={{ color: "#000", fontSize: 15, fontWeight: 700 }}>{fiatCurrency === "PHP" ? "₱" : "$"}{parseFloat(amountInFiat).toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#6b7280", fontSize: 14 }}>Note</span>
                  <span style={{ color: "#000", fontSize: 14, fontWeight: 600 }}>{description || "None"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#6b7280", fontSize: 14 }}>Date</span>
                  <span style={{ color: "#000", fontSize: 14, fontWeight: 600 }}>{receiptDate}</span>
                </div>
              </div>

              <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", fontFamily: "'DM Mono',monospace", wordBreak: "break-all" }}>
                <div style={{ color: "#d1d5db", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10 }}>Transaction Hash</div>
                {receiptHash}
              </div>

            </div>

            <div className="receipt-action-buttons">
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                style={{ flex: 1, background: "rgba(255,255,255,0.05)", color: "#fff", border: "none", borderRadius: 20, padding: "20px", fontWeight: 700, fontSize: 15, cursor: isGeneratingPdf ? "wait" : "pointer", fontFamily: "'Nunito',sans-serif" }}
              >
                {isGeneratingPdf ? "Generating..." : "Save Receipt"}
              </button>
              <button
                type="button"
                onClick={generateNewInvoiceId}
                className="premium-btn"
                style={{ flex: 1, background: isSubscribed ? "linear-gradient(135deg, #f59e0b, #d97706)" : "#fff", color: isSubscribed ? "#fff" : "#000" }}
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