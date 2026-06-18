import React, { useState, useEffect, useMemo, useRef } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import { useWallet } from "../../contexts/WalletContext";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";

const FALLBACK_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export default function SendPayment() {
    const [sysConfig, setSysConfig] = useState({
        networkPassphrase: Networks.TESTNET,
        horizonUrl: "https://horizon-testnet.stellar.org",
        phpcIssuer: FALLBACK_ISSUER,
        usdcIssuer: FALLBACK_ISSUER,
        freeTierCap: 100000
    });

    const [destination, setDestination] = useState("");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    // 🚀 Start with XLM by default
    const [token, setToken] = useState<"XLM" | "PHPC" | "USDC">("XLM");

    const [isScanning, setIsScanning] = useState(false);
    const [txHash, setTxHash] = useState("");
    const [receiptDate, setReceiptDate] = useState("");
    const [merchantAddress, setMerchantAddress] = useState("");

    const [balance, setBalance] = useState("0.00");
    const [isBalanceHidden, setIsBalanceHidden] = useState(true);

    const [speeds, setSpeeds] = useState({ network: "0.00", total: "0.00" });

    const [fiatCurrency, setFiatCurrency] = useState<"PHP" | "USD">("PHP");
    const [amountInFiat, setAmountInFiat] = useState("");
    const [realTimeRate, setRealTimeRate] = useState(1);
    const [usdToPhpRate, setUsdToPhpRate] = useState(56);

    const [monthlyUsage, setMonthlyUsage] = useState(0);
    const [isSubscribed, setIsSubscribed] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState("Initializing dashboard...");

    const { signTx, walletName } = useWallet();

    useEffect(() => {
        const initSystem = async () => {
            try {
                const configSnap = await getDoc(doc(db, "system_config", "global"));
                let currentPassphrase = Networks.TESTNET;
                let currentHorizon = "https://horizon-testnet.stellar.org";
                let currentIssuer = FALLBACK_ISSUER;
                let currentUsdcIssuer = FALLBACK_ISSUER;
                let currentFreeCap = 100000;

                if (configSnap.exists()) {
                    const c = configSnap.data();
                    const isTestnet = c.stellarNetwork === "Testnet (Futurenet)";
                    currentPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;
                    currentHorizon = isTestnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
                    currentIssuer = c.phpcIssuerAddress || FALLBACK_ISSUER;
                    currentUsdcIssuer = c.usdcIssuerAddress || FALLBACK_ISSUER;
                    currentFreeCap = c.freeTierMonthlyCap || 100000;

                    setSysConfig({
                        networkPassphrase: currentPassphrase,
                        horizonUrl: currentHorizon,
                        phpcIssuer: currentIssuer,
                        usdcIssuer: currentUsdcIssuer,
                        freeTierCap: currentFreeCap
                    });
                }

                onAuthStateChanged(auth, async (currentUser) => {
                    if (currentUser) {
                        setIsLoading(true);
                        setLoadingMsg("Syncing account data...");
                        try {
                            const uid = currentUser.uid;
                            const merchantRef = doc(db, "merchants", uid);
                            const merchantSnap = await getDoc(merchantRef);
                            const merchantData = merchantSnap.data();

                            if (merchantData?.stellarPublicKey) {
                                setMerchantAddress(merchantData.stellarPublicKey);
                            }
                            setIsSubscribed(merchantData?.isSubscribed === true);
                            await fetchUsage(uid);
                        } catch (err) {
                            console.error(err);
                        } finally {
                            setIsLoading(false);
                        }
                    } else {
                        setIsLoading(false);
                    }
                });
            } catch (err) {
                console.error(err);
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
    }, [merchantAddress, token, sysConfig.horizonUrl, sysConfig.phpcIssuer, sysConfig.usdcIssuer, txHash]);

    const fetchUsage = async (uid: string) => {
        let currentMonthVolume = 0;
        const now = new Date();

        const invoicesRef = collection(db, `merchants/${uid}/invoices`);
        const invSnap = await getDocs(invoicesRef);
        invSnap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.timestamp && data.status !== "failed" && data.status !== "cancelled" && new Date(data.timestamp).getMonth() === now.getMonth()) {
                currentMonthVolume += parseFloat(data.fiatAmount || data.amount || "0");
            }
        });

        const paymentsRef = collection(db, `merchants/${uid}/payments`);
        const paySnap = await getDocs(paymentsRef);
        paySnap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.timestamp && data.status !== "failed" && data.status !== "cancelled" && new Date(data.timestamp).getMonth() === now.getMonth()) {
                currentMonthVolume += parseFloat(data.fiatAmount || data.amount || "0");
            }
        });

        setMonthlyUsage(currentMonthVolume);
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
                if (token === "USDC") {
                    rate = fiatCurrency === "USD" ? 1 : data['usd-coin'].php;
                } else if (token === "XLM") {
                    rate = fiatCurrency === "USD" ? data.stellar.usd : data.stellar.php;
                } else if (token === "PHPC") {
                    rate = fiatCurrency === "USD" ? (1 / data['usd-coin'].php) : 1;
                }

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
                console.error(e);
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

    const inputVolumePHP = fiatCurrency === "PHP"
        ? parseFloat(amountInFiat) || 0
        : (parseFloat(amountInFiat) || 0) * usdToPhpRate;

    const projectedUsage = monthlyUsage + inputVolumePHP;
    const willExceedLimit = !isSubscribed && projectedUsage > sysConfig.freeTierCap;

    const handleScan = async (text: string) => {
        const address = text.includes("destination=") ? text.match(/destination=([A-Z0-9]+)/)?.[1] || text : text;
        setDestination(address);
        setIsScanning(false);

        if (willExceedLimit) {
            alert(`⚠️ This transaction exceeds your free tier limit (${sysConfig.freeTierCap.toLocaleString()} PHP). Please subscribe to continue.`);
            return;
        }

        if (amount && confirm(`Do you want to send ${amount} ${token} to ${address.substring(0, 8)}...?`)) {
            await executePayment(address);
        }
    };

    const savePaymentToFirestore = async (
        paymentId: string,
        status: "success" | "failed" | "cancelled",
        hash: string = "",
        netSpeed: string = "0.00",
        totalSpeed: string = "0.00",
        errorMessage: string = ""
    ) => {
        if (!auth.currentUser) return;
        try {
            const paymentRef = doc(db, `merchants/${auth.currentUser.uid}/payments`, paymentId);
            await setDoc(paymentRef, {
                type: "sent",
                paymentId: paymentId,
                destination: destination,
                amountToken: amount,
                amountFiat: amountInFiat,
                fiatCurrency: fiatCurrency,
                token: token,
                description: description || "Payment Sent",
                txHash: hash,
                status: status === "success" ? "COMPLETED" : status,
                errorMessage: errorMessage,
                timestamp: new Date().toISOString(),
                networkSpeedSeconds: parseFloat(netSpeed),
                totalWaitTimeSeconds: parseFloat(totalSpeed)
            }, { merge: true });
        } catch (err) {
            console.error(err);
        }
    };

    const executePayment = async (scannedDest?: string) => {
        const finalDest = scannedDest || destination;
        if (!merchantAddress) return alert("Please connect your wallet in Settings.");
        if (!finalDest || !amount) return alert("Please provide a destination and an amount.");
        if (willExceedLimit) return alert(`⚠️ Usage limit reached. Cannot send payment.`);

        const startTime = Date.now();
        const paymentId = `OUT-${Date.now()}`;
        const memoString = `OUT-${Date.now().toString().slice(-6)}`;
        let paymentLogged = false;

        setIsSending(true);
        const displayWalletName = walletName ? (walletName.charAt(0).toUpperCase() + walletName.slice(1)) : "Wallet App";
        setLoadingMsg(`Awaiting signature from your ${displayWalletName}...`);

        setTxHash("");
        setSpeeds({ network: "0.00", total: "0.00" });

        try {
            const server = new Horizon.Server(sysConfig.horizonUrl);
            const sourceAccount = await server.loadAccount(merchantAddress);

            let asset = Asset.native();
            if (token === "PHPC") {
                asset = new Asset("PHPC", sysConfig.phpcIssuer);
            } else if (token === "USDC") {
                asset = new Asset("USDC", sysConfig.usdcIssuer);
            }

            const transaction = new TransactionBuilder(sourceAccount, {
                fee: "1000",
                networkPassphrase: sysConfig.networkPassphrase,
            })
                .addOperation(Operation.payment({
                    destination: finalDest,
                    asset: asset,
                    amount: amount.toString(),
                }))
                .addMemo(Memo.text(memoString))
                .setTimeout(30)
                .build();

            const signedXdrString = await signTx(transaction.toXDR(), sysConfig.networkPassphrase);

            if (!signedXdrString) {
                paymentLogged = true;
                const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                await savePaymentToFirestore(paymentId, "cancelled", "", "0.00", totalSpeed, "Transaction signing cancelled.");
                throw new Error("Transaction signing cancelled.");
            }

            setLoadingMsg("Transmitting to the Stellar Network...");

            const txBody = new URLSearchParams();
            txBody.append("tx", signedXdrString);

            const submitResponse = await fetch(`${sysConfig.horizonUrl}/transactions`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: txBody.toString()
            });

            const responseData = await submitResponse.json();
            const receiveTime = Date.now();

            if (!submitResponse.ok) {
                let exactError = "Unknown Network Error";
                if (responseData.extras && responseData.extras.result_codes) {
                    const codes = responseData.extras.result_codes;
                    exactError = codes.operations ? codes.operations.join(", ") : codes.transaction;
                }

                paymentLogged = true;
                const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                await savePaymentToFirestore(paymentId, "failed", "", "0.00", totalSpeed, exactError);

                if (exactError.includes("op_no_destination")) throw new Error("Failed: The receiving wallet does not exist yet. It must be funded with 1 XLM.");
                else if (exactError.includes("op_src_no_trust")) throw new Error(`Failed: YOUR wallet does not trust ${token}.`);
                else if (exactError.includes("op_no_trust")) throw new Error(`Failed: The RECEIVING wallet does not trust ${token}.`);
                else if (exactError.includes("op_underfunded")) throw new Error("Failed: Your wallet does not have enough funds.");
                else throw new Error(`Blockchain Rejected Transaction. Code: ${exactError}`);
            }

            const totalSpeed = ((receiveTime - startTime) / 1000).toFixed(2);
            let netSpeed = totalSpeed;
            if (responseData.created_at) {
                const ledgerTime = new Date(responseData.created_at).getTime();
                netSpeed = Math.max(0.1, Math.abs(receiveTime - ledgerTime) / 1000).toFixed(2);
            }

            setSpeeds({ network: netSpeed, total: totalSpeed });
            const hash = responseData.hash;

            setLoadingMsg("Saving Receipt...");

            paymentLogged = true;
            await savePaymentToFirestore(paymentId, "success", hash, netSpeed, totalSpeed);

            setTimeout(() => {
                setTxHash(hash);
                setReceiptDate(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
                setIsSending(false);
            }, 800);

            if (auth.currentUser) {
                await fetchUsage(auth.currentUser.uid);
            }

        } catch (error: any) {
            console.error(error);
            setIsSending(false);
            if (!paymentLogged) {
                const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                await savePaymentToFirestore(paymentId, "failed", "", "0.00", totalSpeed, error.message || "Unknown error occurred.");
            }
            alert(error.message || "Payment Failed.");
        }
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
            pdf.save(`LUXPH_Sent_${txHash.substring(0, 8)}.pdf`);
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            alert("Failed to generate PDF. Check console for details.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const resetPayment = () => {
        setTxHash("");
        setDestination("");
        setAmount("");
        setAmountInFiat("");
        setDescription("");
        setIsSending(false);
        setIsScanning(false);
    };

    const isTestnet = sysConfig.networkPassphrase === Networks.TESTNET;
    const networkName = isTestnet ? "TESTNET" : "MAINNET";

    return (
        <div style={{ position: "relative", minHeight: "100vh", zIndex: 1, paddingBottom: 60, boxSizing: "border-box" }}>
            <style>{`
                /* ULTRA-CLEAN TOKEN-FIRST PREMIUM UI (Centered Layout) */
                .header-title { font-size: 32px; font-weight: 900; font-family: 'Nunito',sans-serif; color: #111827; margin: 0; letter-spacing: -0.02em; }
                
                .pm-layout-centered { display: flex; flex-direction: column; align-items: center; justify-content: center; max-width: 520px; margin: 0 auto; width: 100%; }

                /* Premium Card Styles */
                .premium-input-card { position: relative; border-radius: 36px; padding: 40px 30px; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; z-index: 1; transition: all 0.5s ease; }
                .premium-input-card.standard { background: #ffffff; border: 1px solid #e5e7eb; box-shadow: 0 10px 30px -5px rgba(0,0,0,0.05); }
                .premium-input-card.pro-active { background: #ffffff; border: none; box-shadow: 0 20px 40px -10px rgba(245,158,11,0.15); }
                
                .terminal-card { position: relative; border-radius: 36px; display: flex; flex-direction: column; align-items: center; padding: 40px 30px; width: 100%; box-sizing: border-box; z-index: 1; transition: all 0.5s ease; min-height: 400px; justify-content: center; }
                .terminal-card.standard { background: #ffffff; border: 1px solid #e5e7eb; box-shadow: 0 10px 30px -5px rgba(0,0,0,0.05); }
                .terminal-card.pro-active { background: #ffffff; border: none; box-shadow: 0 20px 40px -10px rgba(16,185,129,0.15); }

                /* 🚀 NEW: Send-Specific Pro Aura (Flows UPWARD to simulate sending) */
                .send-aura-bg { position: absolute; inset: -4px; border-radius: 40px; background: linear-gradient(180deg, #10b981, #34d399, #fcd34d, #10b981, #34d399); background-size: 100% 300%; animation: sendDataFlow 4s linear infinite; z-index: -2; filter: blur(12px); opacity: 0.7; }
                .pro-card-body { position: absolute; inset: 0; background: #ffffff; border-radius: 36px; z-index: -1; }
                .pro-badge { background: linear-gradient(90deg, #d97706, #059669); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 900; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; position: absolute; top: 26px; right: 26px; font-family: 'DM Mono',monospace; opacity: 0.9; }

                @keyframes sendDataFlow { 0% { background-position: 0% 100%; } 100% { background-position: 0% 0%; } }

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

                /* Inputs */
                .clean-input { width: 100%; background: transparent; border: none; border-bottom: 2px solid #e5e7eb; padding: 16px 8px; color: #111827; font-size: 16px; font-weight: 600; outline: none; box-sizing: border-box; transition: all 0.3s; text-align: center; margin-bottom: 24px; font-family: 'Nunito',sans-serif; }
                .clean-input:focus { border-bottom-color: #3b82f6; }
                .clean-input.pro-active:focus { border-bottom-color: #10b981; }
                .clean-input::placeholder { color: #9ca3af; font-weight: 500; }

                /* 🚀 NEW: Premium Camera Button nested inside Address Input */
                .dest-input-container { width: 100%; position: relative; margin-bottom: 32px; }
                .dest-scan-btn { 
                    position: absolute; right: 4px; top: 12px; background: #f3f4f6; color: #9ca3af; 
                    border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px 10px; cursor: pointer; 
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); display: flex; align-items: center; justify-content: center;
                }
                .dest-scan-btn:hover { background: #e5e7eb; color: #3b82f6; transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.05); border-color: #d1d5db; }
                .dest-scan-btn.pro-active:hover { color: #10b981; }

                /* Token Selectors */
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

                /* Big Premium Button */
                .premium-btn { width: 100%; color: #fff; border: none; border-radius: 24px; padding: 22px 16px; font-weight: 800; font-size: 18px; cursor: pointer; font-family: 'Nunito',sans-serif; transition: transform 0.1s, opacity 0.2s; box-shadow: 0 10px 25px -5px rgba(59,130,246,0.4); position: relative; overflow: hidden; background: #3b82f6; }
                .premium-btn.pro-active { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 10px 25px -5px rgba(16,185,129,0.4); }
                .premium-btn:active { transform: scale(0.97); }
                .premium-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

                /* 🚀 NEW: The QR Scanning Laser Animation */
                .qr-clean-frame { position: relative; overflow: hidden; background: #ffffff; padding: 0; border-radius: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 15px 35px rgba(0,0,0,0.08); margin-bottom: 24px; width: 100%; max-width: 300px; aspect-ratio: 1/1; border: 2px solid #f3f4f6; }
                .scanner-laser { position: absolute; left: 0; width: 100%; height: 3px; background: #3b82f6; box-shadow: 0 0 15px 4px rgba(59,130,246,0.6); z-index: 10; animation: scanLaser 2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
                .scanner-laser.pro-active { background: #10b981; box-shadow: 0 0 15px 4px rgba(16,185,129,0.6); }

                @keyframes scanLaser { 0% { top: 0%; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { top: 100%; opacity: 0; } }

                /* 🚀 NEW: Outgoing Sending Pulse Animation (With upward arrow) */
                .confirm-ring-container { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 240px; margin-bottom: 24px; position: relative; }
                
                .outgoing-pulse-ring { width: 80px; height: 80px; border-radius: 50%; background: rgba(59,130,246,0.1); border: 3px solid #3b82f6; animation: outgoingPulse 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) infinite; position: absolute; top: 50%; left: 50%; margin-top: -64px; margin-left: -40px; }
                .outgoing-pulse-ring.pro-active { background: rgba(16,185,129,0.1); border-color: #10b981; }

                .outgoing-pulse-core { width: 44px; height: 44px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 20px rgba(59,130,246,0.6); position: absolute; top: 50%; left: 50%; margin-top: -46px; margin-left: -22px; display: flex; align-items: center; justify-content: center; z-index: 2; }
                .outgoing-pulse-core.pro-active { background: #10b981; box-shadow: 0 0 20px rgba(16,185,129,0.6); }

                @keyframes outgoingPulse { 0% { transform: scale(0.5); opacity: 1; border-width: 6px; } 100% { transform: scale(2.5); opacity: 0; border-width: 1px; } }
                @keyframes flyUp { 0% { transform: translateY(6px); opacity: 0; } 50% { transform: translateY(0px); opacity: 1; } 100% { transform: translateY(-6px); opacity: 0; } }

                /* Clean Receipt */
                .clean-receipt { background: #ffffff; border-radius: 24px; padding: 40px 32px; width: 100%; position: relative; box-shadow: 0 20px 50px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; }
                .receipt-action-buttons { display: flex; gap: 12px; width: 100%; margin-top: 20px; }

                @media (max-width: 576px) {
                  .massive-naked-input { font-size: 64px; }
                  .premium-input-card, .terminal-card { padding: 32px 20px; border-radius: 32px; }
                  .qr-clean-frame { max-width: 240px; }
                  .receipt-action-buttons { flex-direction: column; }
                  .premium-btn { padding: 20px; font-size: 16px; border-radius: 20px; }
                  .clean-receipt { padding: 24px 20px; border-radius: 20px; }
                }
            `}</style>

            <AnimatePresence>
                {isLoading && !isSending && !isScanning && !txHash && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
            </AnimatePresence>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
                <div>
                    <h1 className="header-title">Send Payment</h1>
                    <p style={{ color: "#6b7280", fontSize: 15, marginTop: 4, margin: 0, fontWeight: 600 }}>Securely transfer funds to suppliers.</p>
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

            <MonthlyUsageCard monthlyUsage={monthlyUsage} isSubscribed={isSubscribed} usageLimit={sysConfig.freeTierCap} projectedUsage={projectedUsage} />

            <div className="pm-layout-centered">

                {/* ----------------------------------------------------------- */}
                {/* IDLE STATE: THE FORM                                        */}
                {/* ----------------------------------------------------------- */}
                {!isScanning && !isSending && !txHash && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`premium-input-card ${isSubscribed ? "pro-active" : "standard"}`}
                    >
                        {isSubscribed && (
                            <>
                                <div className="send-aura-bg" />
                                <div className="pro-card-body" />
                                <div className="pro-badge">PRO</div>
                            </>
                        )}

                        <div className="dest-input-container">
                            <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700, textAlign: "center" }}>Recipient Address</div>
                            <div style={{ position: "relative" }}>
                                <input
                                    value={destination}
                                    onChange={e => setDestination(e.target.value)}
                                    placeholder="G..."
                                    className={`clean-input ${isSubscribed ? "pro-active" : ""}`}
                                    style={{ fontSize: 14, fontFamily: "'DM Mono',monospace", marginBottom: 0, paddingRight: 60 }}
                                />
                                {/* 🚀 NEW: Premium Viewfinder Camera Icon */}
                                <button className={`dest-scan-btn ${isSubscribed ? "pro-active" : ""}`} onClick={() => setIsScanning(true)} title="Scan Supplier QR Code">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                                        <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                                        <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                                        <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                                        <line x1="7" y1="12" x2="17" y2="12"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>

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
                            className={`clean-input ${isSubscribed ? "pro-active" : ""}`}
                        />

                        <button
                            type="button"
                            onClick={() => executePayment()}
                            disabled={!destination || !amount || willExceedLimit}
                            className={`premium-btn ${isSubscribed ? "pro-active" : ""}`}
                            style={{ background: willExceedLimit ? "#ef4444" : undefined }}
                        >
                            {willExceedLimit ? "Limit Exceeded" : "Authorize Transaction"}
                        </button>
                    </motion.div>
                )}

                {/* ----------------------------------------------------------- */}
                {/* SCANNING STATE: CENTERED CAMERA VIEW WITH LASER               */}
                {/* ----------------------------------------------------------- */}
                {isScanning && !isSending && !txHash && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`terminal-card ${isSubscribed ? "pro-active" : "standard"}`}
                    >
                        {isSubscribed && (
                            <>
                                <div className="send-aura-bg" />
                                <div className="pro-card-body" />
                            </>
                        )}

                        <div style={{ textAlign: "center", marginBottom: 24 }}>
                            <div style={{ fontSize: 24, fontWeight: 900, color: "#111827", fontFamily: "'Nunito',sans-serif", letterSpacing: "-0.02em" }}>Scan to Pay</div>
                            <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4, fontWeight: 500 }}>Point camera at supplier's QR code</div>
                        </div>

                        <div className="qr-clean-frame" style={{ border: isSubscribed ? "2px solid #34d399" : "2px solid #e5e7eb" }}>
                            <div className={`scanner-laser ${isSubscribed ? 'pro-active' : ''}`} />
                            <Scanner onScan={(result) => handleScan(result[0].rawValue)} />
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsScanning(false)}
                            style={{ background: "transparent", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 16, padding: "14px 32px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}
                        >
                            Cancel Scan
                        </button>
                    </motion.div>
                )}

                {/* ----------------------------------------------------------- */}
                {/* SENDING (PROCESSING) STATE: OUTGOING PULSE ANIMATION        */}
                {/* ----------------------------------------------------------- */}
                {isSending && !txHash && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`terminal-card ${isSubscribed ? "pro-active" : "standard"}`}
                    >
                        {isSubscribed && (
                            <>
                                <div className="send-aura-bg" />
                                <div className="pro-card-body" />
                            </>
                        )}

                        <div className="confirm-ring-container">
                            <div className={`outgoing-pulse-ring ${isSubscribed ? 'pro-active' : ''}`} />

                            {/* 🚀 NEW: Firing Telemetry Arrow inside the core */}
                            <div className={`outgoing-pulse-core ${isSubscribed ? 'pro-active' : ''}`}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "flyUp 1.5s ease-in-out infinite" }}>
                                    <line x1="12" y1="19" x2="12" y2="5"></line>
                                    <polyline points="5 12 12 5 19 12"></polyline>
                                </svg>
                            </div>

                            <div style={{ position: "absolute", bottom: 20, textAlign: "center", width: "100%" }}>
                                <div style={{ fontSize: 18, fontWeight: 900, color: "#111827", fontFamily: "'Nunito',sans-serif" }}>
                                    Sending Payment...
                                </div>
                                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6, fontWeight: 600 }}>
                                    {loadingMsg}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ----------------------------------------------------------- */}
                {/* SUCCESS STATE: HIGH-END RECEIPT                             */}
                {/* ----------------------------------------------------------- */}
                {txHash && (
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
                                <h2 style={{ margin: 0, color: "#111827", fontFamily: "'Nunito',sans-serif", fontSize: 24, fontWeight: 900 }}>Payment Sent</h2>
                                <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: 14, fontWeight: 600 }}>Funds securely transferred.</p>
                            </div>

                            <div style={{ borderTop: "2px dashed #e5e7eb", borderBottom: "2px dashed #e5e7eb", padding: "24px 0", marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>Amount Sent</span>
                                    <span style={{ color: "#ef4444", fontSize: 15, fontWeight: 900 }}>- {parseFloat(amount).toLocaleString()} {token}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>Fiat Value</span>
                                    <span style={{ color: "#111827", fontSize: 15, fontWeight: 800 }}>{fiatCurrency === "PHP" ? "₱" : "$"}{parseFloat(amountInFiat).toLocaleString()}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                                    <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 600, minWidth: 80 }}>To Address</span>
                                    <span style={{ color: "#111827", fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono',monospace", wordBreak: "break-all", textAlign: "right" }}>{destination}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 600 }}>Date</span>
                                    <span style={{ color: "#111827", fontSize: 14, fontWeight: 700 }}>{receiptDate}</span>
                                </div>
                            </div>

                            <div style={{ textAlign: "center", fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono',monospace", wordBreak: "break-all", background: "#f9fafb", padding: 16, borderRadius: 12, border: "1px solid #e5e7eb" }}>
                                <div style={{ color: "#9ca3af", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10, fontWeight: 800 }}>Transaction Hash</div>
                                {txHash}
                            </div>

                            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
                                <div style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                                    ⚡ {speeds.network}s
                                </div>
                                <div style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                                    ⏱️ {speeds.total}s
                                </div>
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
                                onClick={resetPayment}
                                className={`premium-btn ${isSubscribed ? "pro-active" : ""}`}
                                style={{ flex: 1, borderRadius: 20 }}
                            >
                                Send Another
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}