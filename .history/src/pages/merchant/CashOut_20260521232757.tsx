import React, { useState, useEffect } from "react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";

const FALLBACK_ANCHOR = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

interface ReceiptData {
  id: string;
  date: string;
  amountToken: string;
  amountPHP: string;
  accountDetails: string;
  hash: string;
  token: string;
  networkSpeed: string;
  totalWaitTime: string;
}

export default function CashOut() {
  const [user, setUser] = useState<User | null>(null);
  const [merchantAddress, setMerchantAddress] = useState<string>("");
  const [sysConfig, setSysConfig] = useState({
    networkPassphrase: Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    phpcIssuer: FALLBACK_ANCHOR,
    usdcIssuer: FALLBACK_ANCHOR,
    anchorAddress: FALLBACK_ANCHOR
  });

  const [inputMode, setInputMode] = useState<"token" | "php">("token");
  const [tokenAmount, setTokenAmount] = useState<string>("5000");
  const [phpAmount, setPhpAmount] = useState<string>("5000");

  const [accountName, setAccountName] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingMsg, setLoadingMsg] = useState<string>("Initializing system...");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [selectedToken, setSelectedToken] = useState<"XLM" | "PHPC" | "USDC">("PHPC");
  const [rates, setRates] = useState<any>(null);
  const [balance, setBalance] = useState<string>("0.00");

  // Premium UI Tilt Effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], [5, -5]);
  const rotateY = useTransform(x, [-100, 100], [-5, 5]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  };

  useEffect(() => {
    const initSystem = async () => {
      try {
        const configSnap = await getDoc(doc(db, "system_config", "global"));
        let currentPassphrase = Networks.TESTNET;
        let currentHorizon = "https://horizon-testnet.stellar.org";
        let currentIssuer = FALLBACK_ANCHOR;
        let currentAnchorAddr = FALLBACK_ANCHOR;

        if (configSnap.exists()) {
          const c = configSnap.data();
          const isTestnet = c.stellarNetwork === "Testnet (Futurenet)";
          currentPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;
          currentHorizon = isTestnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
          currentIssuer = c.phpcIssuerAddress || FALLBACK_ANCHOR;
          currentAnchorAddr = c.phpcIssuerAddress || FALLBACK_ANCHOR; // In production, this is PDAX's public key

          setSysConfig({
            networkPassphrase: currentPassphrase,
            horizonUrl: currentHorizon,
            phpcIssuer: currentIssuer,
            usdcIssuer: c.usdcIssuerAddress || FALLBACK_ANCHOR,
            anchorAddress: currentAnchorAddr
          });
        }

        onAuthStateChanged(auth, async (currentUser) => {
          setUser(currentUser);
          if (currentUser) {
            const merchantDoc = await getDoc(doc(db, "merchants", currentUser.uid));
            if (merchantDoc.exists() && merchantDoc.data().stellarPublicKey) {
              setMerchantAddress(merchantDoc.data().stellarPublicKey);
            }
          }
          setIsLoading(false);
        });
      } catch (err) {
        console.error("Initialization failed:", err);
        setIsLoading(false);
      }
    };
    initSystem();
  }, []);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=stellar,usd-coin&vs_currencies=php`);
        const data = await res.json();
        setRates(data);
      } catch (e) {
        console.error("Rate fetch failed");
      }
    };
    fetchRates();
  }, []);

  useEffect(() => {
    if (!merchantAddress) return;
    const fetchBalance = async () => {
      try {
        const server = new Horizon.Server(sysConfig.horizonUrl);
        const account = await server.loadAccount(merchantAddress);

        const balanceObj = account.balances.find((b: any) => {
          if (selectedToken === "XLM") return b.asset_type === "native";
          const targetIssuer = selectedToken === "PHPC" ? sysConfig.phpcIssuer : sysConfig.usdcIssuer;
          return b.asset_code === selectedToken && b.asset_issuer === targetIssuer;
        });

        setBalance(balanceObj ? parseFloat(balanceObj.balance).toLocaleString() : "0.00");
      } catch (e) {
        setBalance("0.00");
      }
    };
    fetchBalance();
  }, [merchantAddress, selectedToken, sysConfig.horizonUrl, sysConfig.phpcIssuer, sysConfig.usdcIssuer]);

  const handleTokenAmountChange = (val: string) => {
    setTokenAmount(val);
    setInputMode("token");
    if (!rates) {
      setPhpAmount(val);
      return;
    }
    const amt = parseFloat(val || "0");
    if (selectedToken === "PHPC") setPhpAmount(amt.toFixed(2));
    else if (selectedToken === "USDC") setPhpAmount((amt * rates['usd-coin'].php).toFixed(2));
    else if (selectedToken === "XLM") setPhpAmount((amt * rates.stellar.php).toFixed(2));
  };

  const handlePhpAmountChange = (val: string) => {
    setPhpAmount(val);
    setInputMode("php");
    if (!rates) {
      setTokenAmount(val);
      return;
    }
    const amt = parseFloat(val || "0");
    if (selectedToken === "PHPC") setTokenAmount(amt.toFixed(2));
    else if (selectedToken === "USDC") setTokenAmount((amt / rates['usd-coin'].php).toFixed(7));
    else if (selectedToken === "XLM") setTokenAmount((amt / rates.stellar.php).toFixed(7));
  };

  useEffect(() => {
    if (inputMode === "token") handleTokenAmountChange(tokenAmount);
    else handlePhpAmountChange(phpAmount);
  }, [selectedToken, rates]);

  const numericBalance = parseFloat(balance.replace(/,/g, '') || "0");
  const isOverBalance = parseFloat(tokenAmount || "0") > numericBalance;

  const saveCashoutToFirestore = async (
    cashoutId: string,
    status: "PROCESSING_BANK_WIRE" | "failed" | "cancelled",
    hash: string = "",
    netSpeed: string = "0.00",
    totalSpeed: string = "0.00",
    errorMessage: string = ""
  ) => {
    if (!user) return;
    try {
      const cashoutRef = doc(db, `merchants/${user.uid}/cashouts`, cashoutId);
      await setDoc(cashoutRef, {
        cashoutId: cashoutId,
        anchor: "PDAX",
        payoutMethod: "GCash",
        accountName: accountName,
        accountNumber: accountNumber,
        amountToken: tokenAmount,
        token: selectedToken,
        txHash: hash,
        status: status,
        errorMessage: errorMessage,
        timestamp: new Date().toISOString(),
        networkSpeedSeconds: parseFloat(netSpeed),
        totalWaitTimeSeconds: parseFloat(totalSpeed)
      }, { merge: true });
    } catch (err) {
      console.error("Firestore Save Error:", err);
    }
  };

  const handleCashOut = async () => {
    if (!user) return alert("Please log in to continue.");
    if (!merchantAddress) return alert("Please connect your Freighter wallet in settings.");
    if (!tokenAmount || parseFloat(tokenAmount) <= 0) return alert("Please enter a valid amount.");
    if (isOverBalance) return alert("Amount exceeds available balance.");
    if (!accountName || !accountNumber) return alert("Please enter the GCash account name and number.");

    const startTime = Date.now();
    const shortId = `CO-${Math.floor(Date.now() / 1000)}`;
    let cashoutLogged = false;

    setIsLoading(true);
    setLoadingMsg(`Securing connection to PDAX Gateway...`);
    setReceipt(null);

    try {
      const server = new Horizon.Server(sysConfig.horizonUrl);
      const sourceAccount = await server.loadAccount(merchantAddress);

      let asset: Asset;
      if (selectedToken === "XLM") {
        asset = Asset.native();
      } else if (selectedToken === "PHPC") {
        asset = new Asset("PHPC", sysConfig.phpcIssuer);
      } else {
        asset = new Asset("USDC", sysConfig.usdcIssuer);
      }

      const txMemo = Memo.text(shortId);

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: "1000",
        networkPassphrase: sysConfig.networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination: sysConfig.anchorAddress,
          asset: asset,
          amount: parseFloat(tokenAmount).toFixed(7),
        }))
        .addMemo(txMemo)
        .setTimeout(30)
        .build();

      setLoadingMsg("Awaiting Freighter Signature...");

      const signResponse = await signTransaction(transaction.toXDR(), {
        network: sysConfig.networkPassphrase === Networks.TESTNET ? "TESTNET" : "PUBLIC",
        networkPassphrase: sysConfig.networkPassphrase,
      });

      if (!signResponse || signResponse.error) {
        cashoutLogged = true;
        const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
        await saveCashoutToFirestore(shortId, "cancelled", "", "0.00", totalSpeed, "Transaction signature cancelled.");
        throw new Error("Transaction signature cancelled.");
      }

      setLoadingMsg("Executing PDAX Settlement...");

      const signedXdrString = typeof signResponse === "string" ? signResponse :
        (signResponse.signedTxXdr || Object.values(signResponse)[0] as string);

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

        cashoutLogged = true;
        const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
        await saveCashoutToFirestore(shortId, "failed", "", "0.00", totalSpeed, exactError);

        if (exactError.includes("op_src_no_trust")) {
          throw new Error(`Failed: YOUR wallet does not trust ${selectedToken}.`);
        } else if (exactError.includes("op_underfunded")) {
          throw new Error("Failed: Your wallet does not have enough funds to cash out this amount.");
        } else {
          throw new Error(`Blockchain Rejected Transaction. Code: ${exactError}`);
        }
      }

      const totalSpeed = ((receiveTime - startTime) / 1000).toFixed(2);
      let netSpeed = totalSpeed;
      if (responseData.created_at) {
        const ledgerTime = new Date(responseData.created_at).getTime();
        netSpeed = Math.max(0.1, Math.abs(receiveTime - ledgerTime) / 1000).toFixed(2);
      }

      const hash = responseData.hash;

      setLoadingMsg("Saving Secure GCash Details...");

      cashoutLogged = true;
      await saveCashoutToFirestore(shortId, "PROCESSING_BANK_WIRE", hash, netSpeed, totalSpeed, "");

      const nowString = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const displayAcc = `${accountName} (***${accountNumber.slice(-4) || accountNumber})`;

      setReceipt({
        id: shortId,
        date: nowString,
        amountToken: parseFloat(tokenAmount).toFixed(2),
        token: selectedToken,
        amountPHP: parseFloat(phpAmount).toFixed(2),
        accountDetails: displayAcc,
        hash: hash,
        networkSpeed: netSpeed,
        totalWaitTime: totalSpeed
      });

    } catch (error: any) {
      console.error(error);
      if (!cashoutLogged) {
        const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
        await saveCashoutToFirestore(shortId, "failed", "", "0.00", totalSpeed, error.message || "Unknown error occurred.");
      }
      alert(error.message || "Failed to process cash out.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => window.print();

  const resetForm = () => {
    setReceipt(null);
    setTokenAmount("5000");
    handleTokenAmountChange("5000");
    setAccountNumber("");
    setAccountName("");
  };

  return (
    <div style={{ position: "relative", minHeight: "80vh", padding: "40px 20px" }}>
      <style>{`
        .co-layout { display: grid; grid-template-columns: minmax(300px, 450px) minmax(300px, 450px); gap: 40px; justify-content: center; }
        .glass-card { 
            background: rgba(17, 24, 39, 0.7); 
            backdrop-filter: blur(20px); 
            border: 1px solid rgba(255,255,255,0.1); 
            border-radius: 32px; 
            padding: 40px;
            transition: transform 0.2s ease-out;
            transform-style: preserve-3d;
        }
        .co-input-field { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 16px; color: #fff; outline: none; box-sizing: border-box; transition: all 0.3s; }
        .co-input-field:focus { border-color: rgba(59, 130, 246, 0.6); box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
        .btn-glow { box-shadow: 0 0 20px rgba(59, 130, 246, 0.3); transition: all 0.3s; }
        .btn-glow:hover { box-shadow: 0 0 30px rgba(59, 130, 246, 0.5); }
        
        .pdax-badge { display: inline-flex; align-items: center; justify-content: center; background: #0a2540; color: #fff; padding: 12px 20px; border-radius: 16px; font-weight: 900; font-style: italic; letter-spacing: -0.5px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 24px; }
        
        @media print { .hide-on-print { display: none !important; } }
        @media (max-width: 992px) { .co-layout { grid-template-columns: 1fr; } }
      `}</style>

      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>

      <div className="hide-on-print" style={{ marginBottom: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#fff", margin: 0 }}>PDAX Instant Cash Out</h1>
        <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 6 }}>Directly convert crypto to GCash via the PDAX Gateway.</p>
      </div>

      <AnimatePresence mode="wait">
        {!receipt ? (
          <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="co-layout">

            {/* LEFT CARD: Conversion & Asset */}
            <motion.div className="glass-card" onMouseMove={handleMouseMove} onMouseLeave={() => { x.set(0); y.set(0); }} style={{ rotateX, rotateY }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, color: "#fff", margin: 0, fontFamily: "'Nunito'" }}>Conversion Details</h2>
                <div style={{ fontSize: 12, color: "#10b981", fontWeight: 700 }}>Bal: {balance} {selectedToken}</div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>Asset to Convert</div>
                <select className="co-input-field" value={selectedToken} onChange={(e) => setSelectedToken(e.target.value as any)} style={{ appearance: "none", cursor: "pointer" }}>
                  <option value="PHPC" style={{ color: "#000" }}>PHPC (Philippine Stablecoin)</option>
                  <option value="USDC" style={{ color: "#000" }}>USDC (USD Stablecoin)</option>
                  <option value="XLM" style={{ color: "#000" }}>XLM (Stellar Lumens)</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>Send ({selectedToken})</div>
                  <input type="number" className="co-input-field" value={tokenAmount} onChange={(e) => handleTokenAmountChange(e.target.value)} style={{ borderColor: isOverBalance ? "#ef4444" : "", color: isOverBalance ? "#ef4444" : "#fff" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}><span style={{ color: "#6b7280" }}>⇄</span></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>Receive (PHP)</div>
                  <input type="number" className="co-input-field" value={phpAmount} onChange={(e) => handlePhpAmountChange(e.target.value)} />
                </div>
              </div>
            </motion.div>

            {/* RIGHT CARD: Gateway & GCash Info */}
            <motion.div className="glass-card" onMouseMove={handleMouseMove} onMouseLeave={() => { x.set(0); y.set(0); }} style={{ rotateX, rotateY }}>
              <div className="pdax-badge">Powered by PDAX Gateway</div>

              <h2 style={{ fontSize: 20, color: "#fff", marginBottom: 20, fontFamily: "'Nunito'" }}>GCash Destination</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
                <input type="text" className="co-input-field" placeholder="GCash Registered Name" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                <input type="text" className="co-input-field" placeholder="GCash Number (e.g. 09123456789)" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={11} style={{ fontFamily: "'DM Mono',monospace" }} />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCashOut}
                disabled={isOverBalance || parseFloat(tokenAmount) <= 0}
                className={isOverBalance ? "" : "btn-glow"}
                style={{
                  width: "100%", padding: 18, borderRadius: 16, border: "none",
                  background: isOverBalance ? "#374151" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: isOverBalance ? "#9ca3af" : "#fff",
                  fontWeight: 800, cursor: isOverBalance ? "not-allowed" : "pointer"
                }}
              >
                {isOverBalance ? "Insufficient Balance" : "Confirm & Send to GCash"}
              </motion.button>
            </motion.div>

          </motion.div>
        ) : (
          /* RECEIPT STATE */
          <motion.div key="receipt" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="co-layout" style={{ display: "flex", justifyContent: "center" }}>
            <div className="glass-card" style={{ width: "100%", maxWidth: 480, padding: "40px 32px", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, background: "#10b981", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32, color: "#fff", boxShadow: "0 0 20px rgba(16,185,129,0.4)" }}>✓</div>
              <h2 style={{ margin: 0, color: "#fff", fontFamily: "'Nunito',sans-serif", fontSize: 24, fontWeight: 800 }}>Cash Out Initiated</h2>
              <p style={{ margin: "4px 0 24px 0", color: "#9ca3af", fontSize: 14 }}>Funds routed to GCash via PDAX.</p>

              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 16, padding: 24, textAlign: "left", marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ color: "#9ca3af", fontSize: 13 }}>Amount Converted</span>
                  <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}>- {parseFloat(receipt.amountToken).toLocaleString()} {receipt.token}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ color: "#9ca3af", fontSize: 13 }}>GCash Destination</span>
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{receipt.accountDetails}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>PHP Expected</span>
                  <span style={{ color: "#10b981", fontSize: 24, fontWeight: 800 }}>₱{parseFloat(receipt.amountPHP).toLocaleString()}</span>
                </div>
              </div>

              <div className="receipt-action-buttons hide-on-print" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <button type="button" onClick={handlePrint} style={{ flex: 1, background: "rgba(255,255,255,.05)", color: "#fff", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "12px", fontWeight: 700, cursor: "pointer" }}>🖨️ Print</button>
                <a href={`${sysConfig.networkPassphrase === Networks.TESTNET ? "https://stellar.expert/explorer/testnet/tx/" : "https://stellar.expert/explorer/public/tx/"}${receipt.hash}`} target="_blank" rel="noreferrer" style={{ flex: 1, textDecoration: "none" }}>
                  <button type="button" style={{ width: "100%", background: "rgba(59, 130, 246, 0.15)", color: "#93c5fd", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 12, padding: "12px", fontWeight: 700, cursor: "pointer" }}>🔗 Explorer</button>
                </a>
              </div>

              <button type="button" onClick={resetForm} className="hide-on-print" style={{ width: "100%", background: "transparent", color: "#6b7280", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                ← Make another cash out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}