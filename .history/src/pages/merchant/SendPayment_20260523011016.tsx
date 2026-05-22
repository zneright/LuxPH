import React, { useState, useEffect, useMemo } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";

const FALLBACK_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const FloatingNode = ({ delay = 0, x, y, size = 1, color = "#f59e0b", blur = 0 }: { delay?: number, x: string, y: string, size?: number, color?: string, blur?: number }) => {
    const { randomDuration, randomDelay } = useMemo(() => ({
        randomDuration: 5 + Math.random() * 5,
        randomDelay: delay + Math.random() * 2
    }), [delay]);

    return (
        <motion.div
            className="absolute rounded-full z-0 pointer-events-none"
            style={{
                left: x,
                top: y,
                width: 2 * size,
                height: 2 * size,
                background: color,
                filter: `blur(${blur}px)`,
                boxShadow: `0 0 ${size * 4}px ${size}px ${color}80`
            }}
            animate={{
                opacity: [0.1, 0.5, 0.1],
                scale: [1, 1.4, 1],
                y: ["0%", "-40%", "0%"],
                x: ["0%", "15%", "0%"]
            }}
            transition={{ duration: randomDuration, delay: randomDelay, repeat: Infinity, ease: "easeInOut" }}
        />
    );
};

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
    const [description, setDescription] = useState("Paying Supplier");
    const [token, setToken] = useState<"XLM" | "PHPC" | "USDC">("USDC");

    const [isScanning, setIsScanning] = useState(false);
    const [txHash, setTxHash] = useState("");
    const [receiptDate, setReceiptDate] = useState("");
    const [merchantAddress, setMerchantAddress] = useState("");

    // --- BALANCE STATE ---
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
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState("Initializing dashboard...");

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

                const parsedFiat = parseFloat(amountInFiat);
                if (!isNaN(parsedFiat)) {
                    setAmount((parsedFiat / rate).toFixed(2));
                }
            } catch (e) {
                console.error(e);
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

        if (confirm(`Do you want to send ${amount} ${token} to ${address.substring(0, 8)}...?`)) {
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
                description: description,
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

        setIsLoading(true);
        setLoadingMsg("Awaiting Wallet Signature...");
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

            const signResponse = await signTransaction(transaction.toXDR(), {
                network: sysConfig.networkPassphrase === Networks.TESTNET ? "TESTNET" : "PUBLIC",
                networkPassphrase: sysConfig.networkPassphrase,
            });

            if (!signResponse || signResponse.error) {
                paymentLogged = true;
                const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                await savePaymentToFirestore(paymentId, "cancelled", "", "0.00", totalSpeed, "Transaction signing cancelled.");
                throw new Error("Transaction signing cancelled.");
            }

            const signedXdrString = typeof signResponse === "string" ? signResponse :
                (signResponse.signedTxXdr || Object.values(signResponse)[0] as string);

            setLoadingMsg("Submitting to the Stellar Network...");

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

            setTxHash(hash);
            setReceiptDate(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));

            if (auth.currentUser) {
                await fetchUsage(auth.currentUser.uid);
            }

        } catch (error: any) {
            console.error(error);
            if (!paymentLogged) {
                const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                await savePaymentToFirestore(paymentId, "failed", "", "0.00", totalSpeed, error.message || "Unknown error occurred.");
            }
            alert(error.message || "Payment Failed.");
        } finally {
            setIsLoading(false);
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
        setDescription("Paying Supplier");
    };

    const isTestnet = sysConfig.networkPassphrase === Networks.TESTNET;
    const networkName = isTestnet ? "TESTNET" : "MAINNET";

    return (
        <div style={{ position: "relative", minHeight: "100vh", zIndex: 1, paddingBottom: 60, boxSizing: "border-box" }}>
            <style>{`
                .pm-layout-split { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
                .pm-dual-fields { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: end; margin-bottom: 20px; }
                .pm-card-left { backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,.06); border-radius: 24px; padding: 32px; position: relative; overflow: hidden; }
                .pm-card-right { backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,.06); border-radius: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; position: relative; overflow: hidden; min-height: 400px; box-sizing: border-box; }
                .pm-scanner-box { width: 100%; max-width: 300px; border-radius: 20px; overflow: hidden; border: 2px solid #60a5fa; box-shadow: 0 0 30px rgba(96,165,250,0.3); }
                .receipt-action-buttons { display: flex; gap: 12px; width: 100%; margin-top: 16px; }

                @media (max-width: 992px) {
                    .pm-layout-split { grid-template-columns: 1fr; gap: 24px; }
                }
                @media (max-width: 576px) {
                    .pm-dual-fields { grid-template-columns: 1fr; gap: 12px; align-items: stretch; }
                    .pm-dual-fields > div:nth-child(2) { display: none !important; }
                    .pm-card-left, .pm-card-right { padding: 20px; min-height: auto; }
                    .receipt-action-buttons { flex-direction: column; }
                }
            `}</style>

            {isSubscribed && (
                <motion.div
                    style={{
                        position: "absolute",
                        top: "5%",
                        left: "20%",
                        width: 800,
                        height: 800,
                        background: "radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 60%)",
                        borderRadius: "50%",
                        zIndex: -1,
                        pointerEvents: "none"
                    }}
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
                        Send Payment
                    </h1>
                    <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 6 }}>Process secure, real-time blockchain payments to suppliers.</p>
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

            <MonthlyUsageCard monthlyUsage={monthlyUsage} isSubscribed={isSubscribed} usageLimit={sysConfig.freeTierCap} projectedUsage={projectedUsage} />

            <div className="pm-layout-split">
                <motion.div
                    animate={isSubscribed ? {
                        boxShadow: ["0px 0px 0px rgba(245,158,11,0)", "0px 10px 40px rgba(245,158,11,0.12)", "0px 0px 0px rgba(245,158,11,0)"],
                        borderColor: ["rgba(255,255,255,0.06)", "rgba(245,158,11,0.3)", "rgba(255,255,255,0.06)"]
                    } : {}}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="pm-card-left"
                    style={{ background: isSubscribed ? "rgba(15, 17, 26, 0.6)" : "rgba(255,255,255,.04)" }}
                >
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700 }}>Recipient Wallet Address</div>
                        <input value={destination} onChange={e => setDestination(e.target.value)} disabled={!!txHash} placeholder="G..." style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 13, fontFamily: "'DM Mono',monospace", outline: "none", boxSizing: "border-box", transition: "all 0.3s" }} />
                    </div>

                    <motion.button type="button" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={() => setIsScanning(!isScanning)} disabled={!!txHash} style={{ background: "rgba(96,165,250,.05)", color: "#60a5fa", border: "1px solid rgba(96,165,250,.3)", borderRadius: 12, padding: "12px 14px", fontWeight: 700, fontSize: 13, cursor: !!txHash ? "not-allowed" : "pointer", opacity: !!txHash ? 0.5 : 1, fontFamily: "'Nunito',sans-serif", width: "100%", marginBottom: 28, transition: "background 0.2s" }}>
                        {isScanning ? "Cancel Camera Scan" : "📷 Scan Supplier QR Code"}
                    </motion.button>

                    <div className="pm-dual-fields">
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Base</div>
                                <select value={fiatCurrency} onChange={(e) => setFiatCurrency(e.target.value as "PHP" | "USD")} disabled={!!txHash} style={{ background: "transparent", color: "#a78bfa", border: "none", fontSize: 12, outline: "none", cursor: "pointer", fontWeight: "bold" }}>
                                    <option value="PHP" style={{ color: "#000" }}>PHP (₱)</option>
                                    <option value="USD" style={{ color: "#000" }}>USD ($)</option>
                                </select>
                            </div>
                            <input type="number" value={amountInFiat} onChange={e => setAmountInFiat(e.target.value)} disabled={!!txHash} placeholder="0.00" style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }} />
                        </div>

                        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} style={{ paddingBottom: 14, color: isSubscribed ? "#f59e0b" : "#6b7280", fontSize: 20, textAlign: "center" }}>
                            ⇄
                        </motion.div>

                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Crypto</div>
                                <select value={token} onChange={(e) => setToken(e.target.value as "XLM" | "PHPC" | "USDC")} disabled={!!txHash} style={{ background: "transparent", color: "#a78bfa", border: "none", fontSize: 12, outline: "none", cursor: "pointer", fontWeight: "bold" }}>
                                    <option value="USDC" style={{ color: "#000" }}>USDC</option>
                                    <option value="PHPC" style={{ color: "#000" }}>PHPC</option>
                                    <option value="XLM" style={{ color: "#000" }}>XLM</option>
                                </select>
                            </div>
                            <input type="number" value={amount} onChange={handleCryptoAmountChange} disabled={!!txHash} placeholder="0.00" style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: isSubscribed ? "#fcd34d" : "#a78bfa", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }} />
                        </div>
                    </div>

                    <div style={{ marginBottom: 32 }}>
                        <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700 }}>Memo / Reference Note</div>
                        <input value={description} onChange={e => setDescription(e.target.value)} disabled={!!txHash} style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }} />
                    </div>

                    {!txHash ? (
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => executePayment()}
                            disabled={isLoading || !destination || !amount || willExceedLimit}
                            style={{
                                width: "100%",
                                background: willExceedLimit ? "rgba(239, 68, 68, 0.15)" : (isSubscribed ? "linear-gradient(90deg, #f59e0b, #d97706)" : "linear-gradient(135deg,#7c3aed,#4f46e5)"),
                                color: willExceedLimit ? "#ef4444" : "#fff",
                                border: willExceedLimit ? "1px solid rgba(239, 68, 68, 0.4)" : "none",
                                borderRadius: 14,
                                padding: "18px 16px",
                                fontWeight: 800,
                                fontSize: 16,
                                cursor: (isLoading || !destination || !amount || willExceedLimit) ? "not-allowed" : "pointer",
                                fontFamily: "'Nunito',sans-serif",
                                position: "relative",
                                overflow: "hidden",
                                boxShadow: isSubscribed && !willExceedLimit ? "0 8px 25px -6px rgba(245,158,11,0.5)" : "0 8px 25px -6px rgba(124,58,237,0.4)",
                            }}
                        >
                            {isSubscribed && !willExceedLimit && !(isLoading || !destination || !amount) && (
                                <motion.div
                                    animate={{ left: ["-100%", "200%"] }}
                                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", repeatDelay: 3 }}
                                    style={{ position: "absolute", top: 0, bottom: 0, width: "25%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)", transform: "skewX(-20deg)" }}
                                />
                            )}
                            {willExceedLimit ? "Limit Exceeded" : (isLoading ? "Processing..." : "Authorize Transaction")}
                        </motion.button>
                    ) : (
                        <button type="button" onClick={resetPayment} style={{ width: "100%", background: "transparent", color: "#10b981", border: "1px solid rgba(16,185,129,.3)", borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", transition: "background 0.2s" }}>
                            Send Another Payment
                        </button>
                    )}
                </motion.div>

                <motion.div
                    animate={isSubscribed ? {
                        boxShadow: ["0px 0px 0px rgba(245,158,11,0)", "0px 10px 40px rgba(245,158,11,0.12)", "0px 0px 0px rgba(245,158,11,0)"],
                        borderColor: ["rgba(255,255,255,0.06)", "rgba(245,158,11,0.2)", "rgba(255,255,255,0.06)"]
                    } : {}}
                    transition={{ duration: 5, delay: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    className="pm-card-right"
                    style={{ background: isSubscribed ? "rgba(15, 17, 26, 0.6)" : "rgba(255,255,255,.04)", padding: txHash ? "24px" : "40px" }}
                >
                    {isSubscribed && !txHash && (
                        <>
                            <FloatingNode delay={0} x="15%" y="20%" size={6} color="#f59e0b" blur={2} />
                            <FloatingNode delay={0.7} x="85%" y="30%" size={12} color="#10b981" blur={4} />
                            <FloatingNode delay={1.5} x="25%" y="75%" size={5} color="#a78bfa" blur={1} />
                            <FloatingNode delay={1.0} x="75%" y="70%" size={8} color="#f59e0b" blur={3} />
                        </>
                    )}

                    {!isScanning && !txHash && (
                        <motion.div
                            animate={isSubscribed ? { y: [-8, 8, -8] } : {}}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            style={{ textAlign: "center", color: "#9ca3af", fontSize: 15, zIndex: 10, maxWidth: 280, lineHeight: 1.6 }}
                        >
                            <div style={{ fontSize: 56, marginBottom: 20, filter: isSubscribed ? "drop-shadow(0 0 20px rgba(245,158,11,0.4))" : "none" }}>💸</div>
                            Enter details or scan a supplier's QR code to initiate a secure blockchain transfer.
                        </motion.div>
                    )}

                    {isScanning && (
                        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
                            <div style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: "#60a5fa", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 24, fontWeight: 700 }}>Point at Supplier QR</div>
                            <div className="pm-scanner-box">
                                <Scanner onScan={(result) => handleScan(result[0].rawValue)} />
                            </div>
                        </div>
                    )}

                    {txHash && !isScanning && (
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

                                        <h2 style={{ margin: 0, color: "#0f172a", fontFamily: "'Nunito',sans-serif", fontSize: 26, fontWeight: 900 }}>Payment Sent</h2>
                                        <p style={{ margin: "6px 0 0 0", color: "#64748b", fontSize: 14 }}>Funds securely transferred to recipient.</p>
                                    </div>

                                    <div style={{ borderTop: "2px dashed #e5e7eb", borderBottom: "2px dashed #e5e7eb", padding: "24px 0", marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ color: "#6b7280", fontSize: 13 }}>Recipient Address</span>
                                            <span style={{ color: "#111827", fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{destination.substring(0, 10)}...</span>
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
                                            <span style={{ color: "#6b7280", fontSize: 13 }}>Amount Sent</span>
                                            <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}>- {parseFloat(amount).toLocaleString()} {token}</span>
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
                                        {txHash}
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
                                    <a href={`${sysConfig.networkPassphrase === Networks.TESTNET ? "https://stellar.expert/explorer/testnet/tx/" : "https://stellar.expert/explorer/public/tx/"}${txHash}`} target="_blank" rel="noreferrer" style={{ flex: 1, textDecoration: "none" }}>
                                        <button type="button" style={{ width: "100%", background: "rgba(10, 37, 64, 0.5)", color: "#93c5fd", border: "1px solid #1e3a8a", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                                            🔗 View Explorer
                                        </button>
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}