import React, { useState, useEffect, useMemo } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { useWallet } from "../../contexts/WalletContext";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";

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
    const [merchantAddress, setMerchantAddress] = useState("");

    const [speeds, setSpeeds] = useState({ network: "0.00", total: "0.00" });

    const [fiatCurrency, setFiatCurrency] = useState<"PHP" | "USD">("PHP");
    const [amountInFiat, setAmountInFiat] = useState("");
    const [realTimeRate, setRealTimeRate] = useState(1);
    const [usdToPhpRate, setUsdToPhpRate] = useState(56);

    const [lastUpdatedField, setLastUpdatedField] = useState<"FIAT" | "CRYPTO">("FIAT");

    const [monthlyUsage, setMonthlyUsage] = useState(0);
    const [isSubscribed, setIsSubscribed] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [loadingMsg, setLoadingMsg] = useState("Initializing dashboard...");

    const { signTx } = useWallet();

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

                if (lastUpdatedField === "FIAT" && amountInFiat) {
                    const cryptoDecimals = token === 'XLM' ? 7 : 2;
                    setAmount((parseFloat(amountInFiat) / rate).toFixed(cryptoDecimals));
                } else if (lastUpdatedField === "CRYPTO" && amount) {
                    setAmountInFiat((parseFloat(amount) * rate).toFixed(2));
                }
            } catch (e) {
                console.error(e);
            }
        };
        fetchRate();
        const interval = setInterval(fetchRate, 30000);
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

    const inputVolumePHP = fiatCurrency === "PHP"
        ? parseFloat(amountInFiat) || 0
        : (parseFloat(amountInFiat) || 0) * usdToPhpRate;

    const projectedUsage = monthlyUsage + inputVolumePHP;
    const willExceedLimit = !isSubscribed && projectedUsage > sysConfig.freeTierCap;

    const handleScan = async (text: string) => {
        setIsScanning(false);

        let parsedDest = text;
        let parsedAmount = "";
        let parsedToken = token;

        if (text.includes("destination=")) {
            const destMatch = text.match(/destination=([A-Z0-9]+)/);
            if (destMatch) parsedDest = destMatch[1];

            const amtMatch = text.match(/amount=([0-9.]+)/);
            if (amtMatch) parsedAmount = amtMatch[1];

            const tokenMatch = text.match(/token=([A-Z]+)/);
            if (tokenMatch) parsedToken = tokenMatch[1] as any;
        }

        setDestination(parsedDest);
        if (parsedAmount) {
            setAmount(parsedAmount);
            setAmountInFiat((parseFloat(parsedAmount) * realTimeRate).toFixed(2));
        }
        setToken(parsedToken as any);

        if (willExceedLimit) {
            alert(`⚠️ This transaction exceeds your free tier limit (${sysConfig.freeTierCap.toLocaleString()} PHP). Please subscribe to continue.`);
            return;
        }

        const finalAmount = parsedAmount || amount;

        if (!finalAmount) {
            alert("Scan successful! Please enter the amount you wish to send.");
            return;
        }

        if (confirm(`Do you want to send ${finalAmount} ${parsedToken} to ${parsedDest.substring(0, 8)}...?`)) {
            await executePayment(parsedDest, finalAmount, parsedToken);
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

    const executePayment = async (scannedDest?: string, scannedAmount?: string, scannedToken?: string) => {
        const finalDest = scannedDest || destination;
        const finalAmount = scannedAmount || amount;
        const finalToken = scannedToken || token;

        if (!merchantAddress) return alert("Please connect your wallet in Settings.");
        if (!finalDest || !finalAmount) return alert("Please provide a destination and an amount.");
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
            if (finalToken === "PHPC") {
                asset = new Asset("PHPC", sysConfig.phpcIssuer);
            } else if (finalToken === "USDC") {
                asset = new Asset("USDC", sysConfig.usdcIssuer);
            }

            const transaction = new TransactionBuilder(sourceAccount, {
                fee: "1000",
                networkPassphrase: sysConfig.networkPassphrase,
            })
                .addOperation(Operation.payment({
                    destination: finalDest,
                    asset: asset,
                    amount: finalAmount.toString(),
                }))
                .addMemo(Memo.text(memoString))
                .setTimeout(30)
                .build();

            let signedXdrString = "";
            try {
                signedXdrString = await signTx(transaction.toXDR(), sysConfig.networkPassphrase);
            } catch (signError: any) {
                paymentLogged = true;
                const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                const errorMsg = signError.message || "Transaction signing cancelled.";
                await savePaymentToFirestore(paymentId, "cancelled", "", "0.00", totalSpeed, errorMsg);
                throw new Error(errorMsg);
            }

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
                else if (exactError.includes("op_src_no_trust")) throw new Error(`Failed: YOUR wallet does not trust ${finalToken}.`);
                else if (exactError.includes("op_no_trust")) throw new Error(`Failed: The RECEIVING wallet does not trust ${finalToken}.`);
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

            if (auth.currentUser) {
                await fetchUsage(auth.currentUser.uid);
            }

        } catch (error: any) {
            console.error(error);
            const errorMsg = error.message || "Unknown error occurred.";

            const isCancelled = errorMsg.toLowerCase().includes("cancel") || errorMsg.toLowerCase().includes("reject") || errorMsg.toLowerCase().includes("decline");

            if (!paymentLogged) {
                const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                await savePaymentToFirestore(paymentId, isCancelled ? "cancelled" : "failed", "", "0.00", totalSpeed, errorMsg);
            }

            if (!isCancelled) {
                alert(errorMsg || "Payment Failed.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ position: "relative", minHeight: "100vh", zIndex: 1, paddingBottom: 60, boxSizing: "border-box" }}>
            <style>{`
                .pm-layout-split { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
                .pm-dual-fields { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: end; margin-bottom: 20px; }
                .pm-card-left { backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,.06); border-radius: 24px; padding: 32px; position: relative; overflow: hidden; }
                .pm-card-right { backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,.06); border-radius: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; position: relative; overflow: hidden; min-height: 400px; box-sizing: border-box; }
                
                /* Sleek Input Focus Glows */
                .pm-input-field { width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 14px 16px; color: #fff; outline: none; box-sizing: border-box; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .pm-input-field:focus { border-color: rgba(96, 165, 250, 0.6); box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.1); background: rgba(0,0,0,0.3); }
                .pm-input-field.pro-glow:focus { border-color: rgba(245, 158, 11, 0.6); box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.1); }

                /* Holographic Scanner Overlay */
                .pm-scanner-box { width: 100%; max-width: 300px; border-radius: 20px; overflow: hidden; border: 2px solid #60a5fa; box-shadow: 0 0 30px rgba(96,165,250,0.3); position: relative; }
                .scan-laser { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #60a5fa; box-shadow: 0 0 15px 3px #60a5fa; animation: laserScan 2.5s infinite linear; z-index: 10; opacity: 0.8; }
                @keyframes laserScan { 0% { top: 0%; opacity: 0; } 10% { opacity: 0.8; } 90% { opacity: 0.8; } 100% { top: 100%; opacity: 0; } }

                /* Premium Pro Badge */
                .pro-badge { display: inline-flex; align-items: center; gap: 4px; background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.2)); border: 1px solid rgba(245,158,11,0.4); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #fcd34d; letter-spacing: 0.05em; text-transform: uppercase; margin-left: 12px; vertical-align: middle; box-shadow: 0 0 15px rgba(245,158,11,0.2); }

                @media (max-width: 992px) { .pm-layout-split { grid-template-columns: 1fr; gap: 24px; } }
                @media (max-width: 576px) {
                    .pm-dual-fields { grid-template-columns: 1fr; gap: 12px; align-items: stretch; }
                    .pm-dual-fields > div:nth-child(2) { display: none !important; }
                    .pm-card-left, .pm-card-right { padding: 20px; min-height: auto; }
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
                <h1 style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#fff", margin: 0, letterSpacing: "-0.02em", display: "flex", alignItems: "center" }}>
                    Send Payment
                    {isSubscribed && <motion.div className="pro-badge" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}>✦ PRO</motion.div>}
                </h1>
                <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 6 }}>Process secure, real-time blockchain payments to suppliers.</p>
            </div>

            <MonthlyUsageCard monthlyUsage={monthlyUsage} isSubscribed={isSubscribed} usageLimit={sysConfig.freeTierCap} projectedUsage={projectedUsage} />

            <div className="pm-layout-split">
                {/* LEFT CARD */}
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
                        <input className={`pm-input-field ${isSubscribed ? 'pro-glow' : ''}`} style={{ fontSize: 13, fontFamily: "'DM Mono',monospace" }} value={destination} onChange={e => setDestination(e.target.value)} placeholder="G..." />
                    </div>

                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsScanning(!isScanning)}
                        style={{ background: "rgba(96,165,250,.05)", color: "#60a5fa", border: "1px solid rgba(96,165,250,.3)", borderRadius: 12, padding: "12px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", width: "100%", marginBottom: 28, transition: "background 0.2s" }}
                    >
                        {isScanning ? "Cancel Camera Scan" : "📷 Scan Supplier QR Code"}
                    </motion.button>

                    <div className="pm-dual-fields">
                        <div>
                            <div style={{ display: "flex", justifyItems: "center", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Base</div>
                                <select value={fiatCurrency} onChange={(e) => setFiatCurrency(e.target.value as "PHP" | "USD")} style={{ background: "transparent", color: "#a78bfa", border: "none", fontSize: 12, outline: "none", cursor: "pointer", fontWeight: "bold" }}>
                                    <option value="PHP" style={{ color: "#000" }}>PHP (₱)</option>
                                    <option value="USD" style={{ color: "#000" }}>USD ($)</option>
                                </select>
                            </div>
                            <input
                                type="number"
                                className={`pm-input-field ${isSubscribed ? 'pro-glow' : ''}`}
                                style={{ fontSize: 16 }}
                                value={amountInFiat}
                                onChange={handleFiatChange}
                                placeholder="0.00"
                            />
                        </div>

                        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} style={{ paddingBottom: 14, color: isSubscribed ? "#f59e0b" : "#6b7280", fontSize: 20, textAlign: "center" }}>
                            ⇄
                        </motion.div>

                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Crypto</div>
                                <select value={token} onChange={(e) => setToken(e.target.value as "XLM" | "PHPC" | "USDC")} style={{ background: "transparent", color: "#a78bfa", border: "none", fontSize: 12, outline: "none", cursor: "pointer", fontWeight: "bold" }}>
                                    <option value="USDC" style={{ color: "#000" }}>USDC</option>
                                    <option value="PHPC" style={{ color: "#000" }}>PHPC</option>
                                    <option value="XLM" style={{ color: "#000" }}>XLM</option>
                                </select>
                            </div>
                            <input
                                type="number"
                                className={`pm-input-field ${isSubscribed ? 'pro-glow' : ''}`}
                                style={{ color: isSubscribed ? "#fcd34d" : "#a78bfa", fontSize: 16 }}
                                value={amount}
                                onChange={handleCryptoChange}
                                placeholder={token === 'XLM' ? "0.0000000" : "0.00"}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 32 }}>
                        <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700 }}>Memo / Reference Note</div>
                        <input className={`pm-input-field ${isSubscribed ? 'pro-glow' : ''}`} style={{ fontSize: 13 }} value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

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
                </motion.div>

                {/* RIGHT CARD */}
                <motion.div
                    animate={isSubscribed ? {
                        boxShadow: ["0px 0px 0px rgba(245,158,11,0)", "0px 10px 40px rgba(245,158,11,0.12)", "0px 0px 0px rgba(245,158,11,0)"],
                        borderColor: ["rgba(255,255,255,0.06)", "rgba(245,158,11,0.2)", "rgba(255,255,255,0.06)"]
                    } : {}}
                    transition={{ duration: 5, delay: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    className="pm-card-right"
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

                    {/* IDLE STATE: Animated Pulsing Radar */}
                    {!isScanning && !txHash && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            style={{ textAlign: "center", color: "#9ca3af", fontSize: 15, zIndex: 10, maxWidth: 280, lineHeight: 1.6 }}
                        >
                            <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 32px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {/* Concentric expanding rings */}
                                {[0, 1, 2].map((i) => (
                                    <motion.div
                                        key={i}
                                        style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${isSubscribed ? 'rgba(245,158,11,0.4)' : 'rgba(96,165,250,0.4)'}` }}
                                        animate={{ scale: [1, 2.2], opacity: [0.8, 0] }}
                                        transition={{ duration: 3, repeat: Infinity, delay: i * 1, ease: "easeOut" }}
                                    />
                                ))}
                                <motion.div
                                    style={{ fontSize: 48, zIndex: 2, filter: isSubscribed ? "drop-shadow(0 0 20px rgba(245,158,11,0.6))" : "drop-shadow(0 0 20px rgba(96,165,250,0.6))" }}
                                    animate={{ y: [-5, 5, -5], scale: [1, 1.05, 1] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                >
                                    💸
                                </motion.div>
                            </div>
                            <h3 style={{ color: "#fff", margin: "0 0 8px 0", fontSize: 18, fontFamily: "'Nunito',sans-serif", fontWeight: 800 }}>Ready to Transact</h3>
                            Enter details on the left or scan a supplier's QR code to initiate a secure transfer.
                        </motion.div>
                    )}

                    {/* SCANNING STATE: Holographic Overlay */}
                    {isScanning && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
                            <div style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: "#60a5fa", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 24, fontWeight: 700 }}>
                                <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>●</motion.span> Point at Supplier QR
                            </div>
                            <div className="pm-scanner-box">
                                <div className="scan-laser" />
                                <Scanner onScan={(result) => handleScan(result[0].rawValue)} />
                            </div>
                        </motion.div>
                    )}

                    {/* SUCCESS STATE: Staggered Entrance */}
                    {txHash && !isScanning && (
                        <motion.div initial="hidden" animate="visible" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.2 } } }} style={{ textAlign: "center", width: "100%", zIndex: 10 }}>

                            <motion.div variants={{ hidden: { scale: 0 }, visible: { scale: 1, transition: { type: "spring", bounce: 0.5 } } }}>
                                <div style={{ width: 80, height: 80, background: "linear-gradient(135deg, #10b981, #059669)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 40, color: "#fff", boxShadow: "0 10px 30px rgba(16,185,129,0.4)" }}>✓</div>
                            </motion.div>

                            <motion.h3 variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} style={{ color: "#fff", margin: "0 0 24px 0", fontFamily: "'Nunito',sans-serif", fontSize: 26, fontWeight: 900 }}>
                                Transfer Verified
                            </motion.h3>

                            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,0.08)", padding: 24, borderRadius: 16, textAlign: "left", marginBottom: 32, backdropFilter: "blur(12px)", position: "relative", overflow: "hidden" }}>
                                <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 4, background: "#10b981" }} />
                                <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em", fontWeight: 700 }}>Stellar Tx Hash</div>
                                <a href={`${sysConfig.networkPassphrase === Networks.TESTNET ? "https://stellar.expert/explorer/testnet/tx/" : "https://stellar.expert/explorer/public/tx/"}${txHash}`} target="_blank" rel="noreferrer" style={{ color: "#34d399", fontSize: 13, wordBreak: "break-all", fontFamily: "'DM Mono',monospace", textDecoration: "none", lineHeight: 1.5 }}>
                                    {txHash}
                                </a>
                            </motion.div>

                            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                                <div style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                                    ⚡ Network: {speeds.network}s
                                </div>
                                <div style={{ background: "rgba(167, 139, 250, 0.1)", color: "#a78bfa", border: "1px solid rgba(167, 139, 250, 0.2)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                                    ⏱️ Total: {speeds.total}s
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}