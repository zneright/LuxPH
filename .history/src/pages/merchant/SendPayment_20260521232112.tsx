import React, { useState, useEffect, useMemo } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { useWallet } from "../../contexts/WalletContext";
import { useNetwork } from "../../contexts/NetworkContext";
import { invokeSorobanContract } from "../../services/soroban";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";

import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";

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
        usdcIssuer: FALLBACK_USDC,
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

    // Tracks which field the user typed in last so the math flows correctly
    const [lastUpdatedField, setLastUpdatedField] = useState<"FIAT" | "CRYPTO">("FIAT");

    const [monthlyUsage, setMonthlyUsage] = useState(0);
    const [isSubscribed, setIsSubscribed] = useState(false);

    const [useContractPayment, setUseContractPayment] = useState(false);
    const [contractId, setContractId] = useState("");
    const [contractFunctionName, setContractFunctionName] = useState("pay_invoice");
    const [contractArgs, setContractArgs] = useState("customer,merchant,token,amount,contingencyPercentage");

    const [isLoading, setIsLoading] = useState(true);
    const [loadingMsg, setLoadingMsg] = useState("Initializing dashboard...");

    const { signTx } = useWallet();
    const { networkConfig, systemConfig } = useNetwork();

    useEffect(() => {
        const initSystem = async () => {
            try {
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
        setSysConfig({
            networkPassphrase: networkConfig.networkPassphrase,
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

    // Rate Fetching Logic (Refined for better stability)
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

                // Auto-sync the inputs when the currency dropdown changes
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

        // Auto-refresh the rate every 2 minutes (prevent rate limit bans)
        const interval = setInterval(fetchRate, 120000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [token, fiatCurrency]);

    // Handle Fiat typing gracefully
    const handleFiatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setAmountInFiat(val);
        setLastUpdatedField("FIAT");

        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0) {
            // XLM needs high precision, USDC/PHPC are fine with 2
            const cryptoDecimals = token === 'XLM' ? 7 : 2;
            setAmount((parsed / realTimeRate).toFixed(cryptoDecimals));
        } else {
            setAmount("");
        }
    };

    // Handle Crypto typing gracefully
    const handleCryptoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setAmount(val);
        setLastUpdatedField("CRYPTO");

        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0) {
            // Fiat always defaults to 2 decimals
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
        errorMessage: string = "",
        usingContract: boolean = false,
        contractIdValue: string = "",
        contractFunctionValue: string = "",
        contractArgsValue: string = ""
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
                paymentMechanism: usingContract ? "soroban" : "native",
                contractId: usingContract ? contractIdValue : "",
                contractFunctionName: usingContract ? contractFunctionValue : "",
                contractArgs: usingContract ? contractArgsValue : "",
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
            let hash = "";
            let netSpeed = "0.00";
            let totalSpeed = "0.00";

            if (useContractPayment) {
                const effectiveContractId = contractId || systemConfig.sorobanContractId;
                if (!effectiveContractId) return alert("Please enter the Soroban contract ID or set it in Platform Configuration.");
                if (!contractFunctionName) return alert("Please enter the Soroban contract function name.");
                if (!networkConfig?.sorobanRpcUrl) return alert("Soroban RPC URL is not configured.");

                const parsedArgs = contractArgs
                    .split(",")
                    .map((arg) => arg.trim())
                    .filter((arg) => arg.length > 0)
                    .map((arg) => {
                        if (/^-?\d+\.\d+$/.test(arg)) return Number(arg);
                        if (/^-?\d+$/.test(arg)) return Number(arg);
                        if (arg.toLowerCase() === "true") return true;
                        if (arg.toLowerCase() === "false") return false;
                        return arg;
                    });

                const response = await invokeSorobanContract({
                    sourcePublicKey: merchantAddress,
                    contractId: effectiveContractId,
                    functionName: contractFunctionName,
                    functionArgs: parsedArgs,
                    horizonUrl: sysConfig.horizonUrl,
                    sorobanRpcUrl: networkConfig.sorobanRpcUrl,
                    networkPassphrase: sysConfig.networkPassphrase,
                    walletSign: signTx,
                    fee: "100",
                    timeout: 300,
                });

                hash = response.hash || response.id || "";
                totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                netSpeed = totalSpeed;
                setSpeeds({ network: netSpeed, total: netSpeed });
                setTxHash(hash);
                paymentLogged = true;
                await savePaymentToFirestore(paymentId, "success", hash, netSpeed, totalSpeed, "", true, effectiveContractId, contractFunctionName, contractArgs);
            } else {
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
                    totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                    const errorMsg = signError.message || "Transaction signing cancelled.";
                    await savePaymentToFirestore(paymentId, "cancelled", "", "0.00", totalSpeed, errorMsg, false, "", "", "");
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
                    totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                    await savePaymentToFirestore(paymentId, "failed", "", "0.00", totalSpeed, exactError, false, "", "", "");

                    if (exactError.includes("op_no_destination")) throw new Error("Failed: The receiving wallet does not exist yet. It must be funded with 1 XLM.");
                    else if (exactError.includes("op_src_no_trust")) throw new Error(`Failed: YOUR wallet does not trust ${finalToken}.`);
                    else if (exactError.includes("op_no_trust")) throw new Error(`Failed: The RECEIVING wallet does not trust ${finalToken}.`);
                    else if (exactError.includes("op_underfunded")) throw new Error("Failed: Your wallet does not have enough funds.");
                    else throw new Error(`Blockchain Rejected Transaction. Code: ${exactError}`);
                }

                totalSpeed = ((receiveTime - startTime) / 1000).toFixed(2);
                netSpeed = totalSpeed;
                if (responseData.created_at) {
                    const ledgerTime = new Date(responseData.created_at).getTime();
                    netSpeed = Math.max(0.1, Math.abs(receiveTime - ledgerTime) / 1000).toFixed(2);
                }

                setSpeeds({ network: netSpeed, total: totalSpeed });
                const hashResponse = responseData.hash;
                hash = hashResponse;

                setLoadingMsg("Saving Receipt...");

                paymentLogged = true;
                await savePaymentToFirestore(paymentId, "success", hash, netSpeed, totalSpeed, "", false, "", "", "");

                setTxHash(hash);

                if (auth.currentUser) {
                    await fetchUsage(auth.currentUser.uid);
                }
            }

        } catch (error: any) {
            console.error(error);
            const errorMsg = error.message || "Unknown error occurred.";

            const isCancelled = errorMsg.toLowerCase().includes("cancel") || errorMsg.toLowerCase().includes("reject") || errorMsg.toLowerCase().includes("decline");

            if (!paymentLogged) {
                const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
                await savePaymentToFirestore(paymentId, isCancelled ? "cancelled" : "failed", "", "0.00", totalSpeed, errorMsg, useContractPayment, contractId, contractFunctionName, contractArgs);
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
                .pm-scanner-box { width: 100%; max-width: 300px; border-radius: 20px; overflow: hidden; border: 2px solid #60a5fa; box-shadow: 0 0 30px rgba(96,165,250,0.3); }

                @media (max-width: 992px) {
                    .pm-layout-split { grid-template-columns: 1fr; gap: 24px; }
                }
                @media (max-width: 576px) {
                    .pm-dual-fields { grid-template-columns: 1fr; gap: 12px; align-items: stretch; }
                    .pm-dual-fields > div:nth-child(2) { display: none !important; }
                    .pm-card-left, .pm-card-right { padding: 20px; min-height: auto; }
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

            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
                    Send Payment
                </h1>
                <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 6 }}>Process secure, real-time blockchain payments to suppliers.</p>
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
                        <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="G..." style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 13, fontFamily: "'DM Mono',monospace", outline: "none", boxSizing: "border-box", transition: "all 0.3s" }} />
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
                                value={amountInFiat}
                                onChange={handleFiatChange}
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
                                <select value={token} onChange={(e) => setToken(e.target.value as "XLM" | "PHPC" | "USDC")} style={{ background: "transparent", color: "#a78bfa", border: "none", fontSize: 12, outline: "none", cursor: "pointer", fontWeight: "bold" }}>
                                    <option value="USDC" style={{ color: "#000" }}>USDC</option>
                                    <option value="PHPC" style={{ color: "#000" }}>PHPC</option>
                                    <option value="XLM" style={{ color: "#000" }}>XLM</option>
                                </select>
                            </div>
                            <input
                                type="number"
                                value={amount}
                                onChange={handleCryptoChange}
                                placeholder={token === 'XLM' ? "0.0000000" : "0.00"}
                                style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: isSubscribed ? "#fcd34d" : "#a78bfa", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700 }}>Payment Mode</div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <button type="button" onClick={() => setUseContractPayment(false)} style={{ flex: 1, padding: "11px 14px", borderRadius: 12, border: useContractPayment ? "1px solid rgba(156,163,175,.3)" : "1px solid rgba(56,189,248,.8)", background: useContractPayment ? "rgba(255,255,255,0.04)" : "rgba(56,189,248,0.2)", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Standard Payment</button>
                            <button type="button" onClick={() => setUseContractPayment(true)} style={{ flex: 1, padding: "11px 14px", borderRadius: 12, border: useContractPayment ? "1px solid rgba(34,197,94,.8)" : "1px solid rgba(156,163,175,.3)", background: useContractPayment ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Soroban Contract</button>
                        </div>
                    </div>

                    {useContractPayment && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ display: "grid", gap: 14 }}>
                                <div>
                                    <label style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6, display: "block" }}>Soroban Contract ID</label>
                                    <input value={contractId} onChange={e => setContractId(e.target.value)} placeholder="CA..." style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                    <label style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6, display: "block" }}>Contract Function</label>
                                    <input value={contractFunctionName} onChange={e => setContractFunctionName(e.target.value)} placeholder="Function name" style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                    <label style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6, display: "block" }}>Contract Args (comma separated)</label>
                                    <input value={contractArgs} onChange={e => setContractArgs(e.target.value)} placeholder="customer,merchant,token,amount,contingencyPercentage" style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: 32 }}>
                        <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, fontWeight: 700 }}>Memo / Reference Note</div>
                        <input value={description} onChange={e => setDescription(e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", transition: "all 0.3s" }} />
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
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.5 }} style={{ textAlign: "center", width: "100%", zIndex: 10 }}>
                            <div style={{ width: 80, height: 80, background: "linear-gradient(135deg, #10b981, #059669)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 40, color: "#fff", boxShadow: "0 10px 30px rgba(16,185,129,0.4)" }}>✓</div>
                            <h3 style={{ color: "#fff", margin: "0 0 24px 0", fontFamily: "'Nunito',sans-serif", fontSize: 26, fontWeight: 900 }}>Transfer Verified</h3>

                            <div style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,0.08)", padding: 24, borderRadius: 16, textAlign: "left", marginBottom: 32, backdropFilter: "blur(12px)" }}>
                                <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em", fontWeight: 700 }}>Stellar Tx Hash</div>
                                <a href={`${sysConfig.networkPassphrase === Networks.TESTNET ? "https://stellar.expert/explorer/testnet/tx/" : "https://stellar.expert/explorer/public/tx/"}${txHash}`} target="_blank" rel="noreferrer" style={{ color: "#34d399", fontSize: 13, wordBreak: "break-all", fontFamily: "'DM Mono',monospace", textDecoration: "none", lineHeight: 1.5 }}>
                                    {txHash}
                                </a>
                            </div>

                            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                                <div style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                                    ⚡ Network: {speeds.network}s
                                </div>
                                <div style={{ background: "rgba(167, 139, 250, 0.1)", color: "#a78bfa", border: "1px solid rgba(167, 139, 250, 0.2)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                                    ⏱️ Total: {speeds.total}s
                                </div>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}