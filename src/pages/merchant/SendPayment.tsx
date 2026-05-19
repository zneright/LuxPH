import React, { useState, useEffect, useMemo } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";

// Components
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";

const TOKEN_ISSUERS = {
    PHPC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
};

const USAGE_LIMIT = 5000;
const HORIZON_URL = "https://horizon-testnet.stellar.org";

// --- PREMIUM FLOATING NODE ANIMATION FOR PRO USERS ---
const FloatingNode = ({ delay = 0, x, y, size = 1, color = "#f59e0b", blur = 0 }: { delay?: number, x: string, y: string, size?: number, color?: string, blur?: number }) => {
    const { randomDuration, randomDelay } = useMemo(() => ({
        randomDuration: 5 + Math.random() * 4,
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
                filter: `blur(${blur}px)`
            }}
            animate={{
                opacity: [0.05, 0.4, 0.05],
                scale: [1, 1.8, 1],
                y: ["0%", "-30%", "0%"],
                x: ["0%", "10%", "0%"]
            }}
            transition={{ duration: randomDuration, delay: randomDelay, repeat: Infinity, ease: "easeInOut" }}
        />
    );
};

export default function SendPayment() {
    const [destination, setDestination] = useState("");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("Paying Supplier");
    const [token, setToken] = useState<"XLM" | "PHPC" | "USDC">("USDC");

    const [isScanning, setIsScanning] = useState(false);
    const [txHash, setTxHash] = useState("");
    const [merchantAddress, setMerchantAddress] = useState("");

    // --- SPEED STATE ---
    const [speeds, setSpeeds] = useState({ network: "0.00", total: "0.00" });

    // --- FIAT CURRENCY STATE ---
    const [fiatCurrency, setFiatCurrency] = useState<"PHP" | "USD">("PHP");
    const [amountInFiat, setAmountInFiat] = useState("");
    const [realTimeRate, setRealTimeRate] = useState(1);
    const [usdToPhpRate, setUsdToPhpRate] = useState(56);

    // --- USAGE STATE ---
    const [monthlyUsage, setMonthlyUsage] = useState(0);
    const [isSubscribed, setIsSubscribed] = useState(false);

    // --- GLOBAL LOADING OVERLAY STATE ---
    const [isLoading, setIsLoading] = useState(true);
    const [loadingMsg, setLoadingMsg] = useState("Initializing dashboard...");

    // 1. FETCH MERCHANT AND USAGE DATA
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setIsLoading(true);
                setLoadingMsg("Syncing account data...");
                try {
                    const uid = currentUser.uid;

                    // Get Merchant Info
                    const merchantRef = doc(db, "merchants", uid);
                    const merchantSnap = await getDoc(merchantRef);
                    const merchantData = merchantSnap.data();

                    if (merchantData?.stellarPublicKey) {
                        setMerchantAddress(merchantData.stellarPublicKey);
                    }
                    setIsSubscribed(merchantData?.isSubscribed === true);

                    // Get Total Monthly Volume
                    let currentMonthVolume = 0;
                    const now = new Date();

                    // Fetch Invoices
                    const invoicesRef = collection(db, `merchants/${uid}/invoices`);
                    const invSnap = await getDocs(invoicesRef);
                    invSnap.forEach((doc) => {
                        const data = doc.data();
                        if (data.timestamp && data.status !== "failed" && data.status !== "cancelled" && new Date(data.timestamp).getMonth() === now.getMonth()) {
                            currentMonthVolume += parseFloat(data.fiatAmount || data.amount || 0);
                        }
                    });

                    // Fetch Outbound Payments
                    const paymentsRef = collection(db, `merchants/${uid}/payments`);
                    const paySnap = await getDocs(paymentsRef);
                    paySnap.forEach((doc) => {
                        const data = doc.data();
                        if (data.timestamp && data.status !== "failed" && data.status !== "cancelled" && new Date(data.timestamp).getMonth() === now.getMonth()) {
                            currentMonthVolume += parseFloat(data.fiatAmount || data.amount || 0);
                        }
                    });

                    setMonthlyUsage(currentMonthVolume);
                } catch (err) {
                    console.error("Failed to fetch dashboard data:", err);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
            }
        });

        return () => unsubscribe();
    }, [txHash]);

    // 2. EXCHANGE RATE LOGIC
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

    // 3. REAL-TIME LIMIT CHECKER
    const inputVolumePHP = fiatCurrency === "PHP"
        ? parseFloat(amountInFiat) || 0
        : (parseFloat(amountInFiat) || 0) * usdToPhpRate;

    const projectedUsage = monthlyUsage + inputVolumePHP;
    const willExceedLimit = !isSubscribed && projectedUsage > USAGE_LIMIT;

    const handleScan = async (text: string) => {
        const address = text.includes("destination=") ? text.match(/destination=([A-Z0-9]+)/)?.[1] || text : text;
        setDestination(address);
        setIsScanning(false);

        if (willExceedLimit) {
            alert(`⚠️ This transaction exceeds your free tier limit (${USAGE_LIMIT.toLocaleString()} PHP). Please subscribe to continue.`);
            return;
        }

        if (confirm(`Do you want to send ${amount} ${token} to ${address.substring(0, 8)}...?`)) {
            await executePayment();
        }
    };

    // --- FIRESTORE HELPER ---
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
            console.error("Firestore Save Error:", err);
        }
    };

    const executePayment = async () => {
        if (!merchantAddress) return alert("Please connect your wallet in Settings.");
        if (!destination || !amount) return alert("Please provide a destination and an amount.");
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
            const server = new Horizon.Server(HORIZON_URL);
            const sourceAccount = await server.loadAccount(merchantAddress);

            let asset = Asset.native();
            if (token !== "XLM") {
                asset = new Asset(token, TOKEN_ISSUERS[token]);
            }

            const transaction = new TransactionBuilder(sourceAccount, {
                fee: "1000",
                networkPassphrase: Networks.TESTNET,
            })
                .addOperation(Operation.payment({
                    destination: destination,
                    asset: asset,
                    amount: amount.toString(),
                }))
                .addMemo(Memo.text(memoString))
                .setTimeout(30)
                .build();

            const signResponse = await signTransaction(transaction.toXDR(), {
                network: "TESTNET",
                networkPassphrase: Networks.TESTNET,
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

            const submitResponse = await fetch(`${HORIZON_URL}/transactions`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: txBody.toString()
            });

            const responseData = await submitResponse.json();
            const receiveTime = Date.now();

            if (!submitResponse.ok) {
                console.error("Full Network Error:", responseData);
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

    return (
        <div style={{ position: "relative", minHeight: "100vh", zIndex: 1 }}>

            {/* --- PREMIUM AMBIENT BACKGROUND GLOW --- */}
            {isSubscribed && (
                <motion.div
                    style={{
                        position: "absolute",
                        top: "10%",
                        right: "5%",
                        width: 600,
                        height: 600,
                        background: "radial-gradient(circle, rgba(245,158,11,0.04) 0%, transparent 60%)",
                        borderRadius: "50%",
                        zIndex: -1,
                        pointerEvents: "none"
                    }}
                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                />
            )}

            <AnimatePresence>
                {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
            </AnimatePresence>

            {/* HEADER (Clean, no extra badges) */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", margin: 0 }}>
                    Send Payment
                </h1>
                <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>Pay suppliers or other merchants directly on-chain.</p>
            </div>

            <MonthlyUsageCard monthlyUsage={monthlyUsage} isSubscribed={isSubscribed} usageLimit={USAGE_LIMIT} projectedUsage={projectedUsage} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

                {/* --- ACTION PANEL --- */}
                <motion.div
                    animate={isSubscribed ? {
                        boxShadow: ["0px 0px 0px rgba(245,158,11,0)", "0px 8px 32px rgba(245,158,11,0.08)", "0px 0px 0px rgba(245,158,11,0)"],
                        borderColor: ["rgba(255,255,255,0.06)", "rgba(245,158,11,0.25)", "rgba(255,255,255,0.06)"]
                    } : {}}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    style={{
                        background: isSubscribed ? "rgba(15, 17, 26, 0.6)" : "rgba(255,255,255,.04)",
                        backdropFilter: isSubscribed ? "blur(20px)" : "none",
                        border: "1px solid rgba(255,255,255,.06)",
                        borderRadius: 16,
                        padding: 28,
                        position: "relative",
                        overflow: "hidden"
                    }}
                >
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Supplier Address</div>
                        <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="G..." style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 12, fontFamily: "'DM Mono',monospace", outline: "none", boxSizing: "border-box", transition: "border 0.2s" }} onFocus={(e) => isSubscribed && (e.target.style.borderColor = "rgba(245,158,11,0.4)")} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,.1)"} />
                    </div>

                    <button onClick={() => setIsScanning(!isScanning)} style={{ background: "rgba(96,165,250,.05)", color: "#60a5fa", border: "1px solid rgba(96,165,250,.3)", borderRadius: 8, padding: "10px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito',sans-serif", width: "100%", marginBottom: 24, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(96,165,250,.1)"} onMouseLeave={(e) => e.currentTarget.style.background = "rgba(96,165,250,.05)"}>
                        {isScanning ? "Cancel Camera" : "📷 Scan Supplier QR Code"}
                    </button>

                    {/* FIAT INPUT */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em" }}>Base Amount</div>
                            <select value={fiatCurrency} onChange={(e) => setFiatCurrency(e.target.value as "PHP" | "USD")} style={{ background: "rgba(167, 139, 250, 0.15)", color: "#a78bfa", border: "1px solid rgba(167, 139, 250, 0.3)", borderRadius: 6, padding: "4px 8px", fontSize: 11, outline: "none", cursor: "pointer", fontWeight: "bold" }}>
                                <option value="PHP">PHP (₱)</option>
                                <option value="USD">USD ($)</option>
                            </select>
                        </div>
                        <input type="number" value={amountInFiat} onChange={e => setAmountInFiat(e.target.value)} placeholder="0.00" style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box", transition: "border 0.2s" }} onFocus={(e) => isSubscribed && (e.target.style.borderColor = "rgba(245,158,11,0.4)")} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,.1)"} />
                    </div>

                    {/* CRYPTO INPUTS */}
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 20 }}>
                        <div>
                            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Crypto Eqv.</div>
                            <input type="number" value={amount} onChange={handleCryptoAmountChange} placeholder="0.00" style={{ width: "100%", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 8, padding: "12px 14px", color: "#a78bfa", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Token</div>
                            <select value={token} onChange={(e) => setToken(e.target.value as "XLM" | "PHPC" | "USDC")} style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none", cursor: "pointer" }}>
                                <option value="XLM">XLM</option>
                                <option value="USDC">USDC</option>
                                <option value="PHPC">PHPC</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: 28 }}>
                        <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Description / Memo</div>
                        <input value={description} onChange={e => setDescription(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", transition: "border 0.2s" }} onFocus={(e) => isSubscribed && (e.target.style.borderColor = "rgba(245,158,11,0.4)")} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,.1)"} />
                    </div>

                    {/* PREMIUM SEND BUTTON */}
                    <button
                        onClick={executePayment}
                        disabled={isLoading || !destination || !amount || willExceedLimit}
                        style={{
                            width: "100%",
                            background: willExceedLimit ? "rgba(239, 68, 68, 0.15)" : (isSubscribed ? "linear-gradient(135deg, #10b981 0%, #047857 100%)" : "linear-gradient(135deg,#10b981,#059669)"),
                            color: willExceedLimit ? "#ef4444" : "#fff",
                            border: willExceedLimit ? "1px solid rgba(239, 68, 68, 0.4)" : (isSubscribed ? "1px solid rgba(16, 185, 129, 0.4)" : "none"),
                            borderRadius: 10,
                            padding: "16px 14px",
                            fontWeight: 800,
                            fontSize: 15,
                            cursor: (isLoading || !destination || !amount || willExceedLimit) ? "not-allowed" : "pointer",
                            fontFamily: "'Nunito',sans-serif",
                            position: "relative",
                            overflow: "hidden",
                            boxShadow: isSubscribed && !willExceedLimit ? "0 8px 20px -6px rgba(16,185,129,0.5)" : "none",
                        }}
                    >
                        {isSubscribed && !willExceedLimit && !(isLoading || !destination || !amount) && (
                            <motion.div
                                animate={{ left: ["-100%", "200%"] }}
                                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", repeatDelay: 2 }}
                                style={{ position: "absolute", top: 0, bottom: 0, width: "20%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)", transform: "skewX(-20deg)" }}
                            />
                        )}
                        {willExceedLimit ? "Limit Exceeded" : (isLoading ? "Processing..." : "Sign & Send Payment")}
                    </button>
                </motion.div>

                {/* --- FEEDBACK PANEL --- */}
                <motion.div
                    animate={isSubscribed ? {
                        boxShadow: ["0px 0px 0px rgba(245,158,11,0)", "0px 8px 32px rgba(245,158,11,0.08)", "0px 0px 0px rgba(245,158,11,0)"],
                        borderColor: ["rgba(255,255,255,0.06)", "rgba(245,158,11,0.25)", "rgba(255,255,255,0.06)"]
                    } : {}}
                    transition={{ duration: 5, delay: 2.5, repeat: Infinity, ease: "easeInOut" }} // Delayed to pulse out-of-sync
                    style={{
                        background: isSubscribed ? "rgba(15, 17, 26, 0.6)" : "rgba(255,255,255,.04)",
                        backdropFilter: isSubscribed ? "blur(20px)" : "none",
                        border: "1px solid rgba(255,255,255,.06)",
                        borderRadius: 16,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 32,
                        position: "relative",
                        overflow: "hidden"
                    }}
                >
                    {/* PRO BACKGROUND NODES */}
                    {isSubscribed && (
                        <>
                            <FloatingNode delay={0} x="10%" y="15%" size={5} color="#f59e0b" blur={1} />
                            <FloatingNode delay={0.5} x="85%" y="25%" size={8} color="#10b981" blur={2} />
                            <FloatingNode delay={1.2} x="20%" y="80%" size={4} color="#a78bfa" blur={0} />
                            <FloatingNode delay={0.8} x="80%" y="75%" size={6} color="#f59e0b" blur={1.5} />
                        </>
                    )}

                    {!isScanning && !txHash && (
                        <div style={{ textAlign: "center", color: "#6b7280", fontSize: 14, zIndex: 10 }}>
                            <div style={{ fontSize: 44, marginBottom: 16 }}>💸</div>
                            Fill out the details on the left or scan a QR code to initiate a secure blockchain transfer.
                        </div>
                    )}

                    {isScanning && (
                        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
                            <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#60a5fa", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 20 }}>Point at Supplier QR</div>
                            <div style={{ width: "100%", maxWidth: 280, borderRadius: 16, overflow: "hidden", border: "2px solid #60a5fa", boxShadow: "0 0 20px rgba(96,165,250,0.2)" }}>
                                <Scanner onScan={(result) => handleScan(result[0].rawValue)} />
                            </div>
                        </div>
                    )}

                    {txHash && !isScanning && (
                        <div style={{ textAlign: "center", width: "100%", zIndex: 10 }}>
                            <div style={{ width: 64, height: 64, background: "#10b981", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32, color: "#fff", boxShadow: "0 8px 20px rgba(16,185,129,0.3)" }}>✓</div>
                            <h3 style={{ color: "#fff", margin: "0 0 20px 0", fontFamily: "'Nunito',sans-serif", fontSize: 22 }}>Transfer Complete</h3>

                            <div style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,0.05)", padding: 20, borderRadius: 12, textAlign: "left", marginBottom: 28, backdropFilter: "blur(8px)" }}>
                                <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.05em" }}>Tx Hash</div>
                                <a href={`https://stellar.expert/explorer/testnet/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: "#34d399", fontSize: 12, wordBreak: "break-all", fontFamily: "'DM Mono',monospace", textDecoration: "none" }}>
                                    {txHash}
                                </a>
                            </div>

                            {/* ⚡ DUAL SPEED BADGES */}
                            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                                <div style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 20, padding: "8px 16px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                                    ⚡ Network: {speeds.network}s
                                </div>
                                <div style={{ background: "rgba(167, 139, 250, 0.15)", color: "#a78bfa", border: "1px solid rgba(167, 139, 250, 0.3)", borderRadius: 20, padding: "8px 16px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                                    ⏱️ Total: {speeds.total}s
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}   