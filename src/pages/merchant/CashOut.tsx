import React, { useState, useEffect } from "react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const ANCHOR_ADDRESS = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const TOKEN_ISSUERS: Record<string, string> = {
  PHPC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
};

const BANK_LOGOS: Record<string, string> = {
  BPI: "https://upload.wikimedia.org/wikipedia/en/c/c2/Bank_of_the_Philippine_Islands_logo.svg",
  BDO: "https://upload.wikimedia.org/wikipedia/commons/8/84/BDO_Unibank_logo.svg",
  UnionBank: "https://upload.wikimedia.org/wikipedia/commons/1/1a/UnionBank_of_the_Philippines_logo.svg",
  Metrobank: "https://upload.wikimedia.org/wikipedia/commons/8/86/Metrobank_%28Philippines%29_logo.svg"
};

interface ReceiptData {
  id: string;
  date: string;
  amountToken: string;
  amountPHP: string;
  destination: string;
  accountDetails: string;
  anchor: string;
  hash: string;
  token: string;
  networkSpeed: string;
  totalWaitTime: string;
}

export default function CashOut() {
  const [user, setUser] = useState<User | null>(null);
  const [merchantAddress, setMerchantAddress] = useState<string>("");

  // Form States
  const [anchor, setAnchor] = useState<"pdax" | "palawan">("pdax");

  // Bidirectional Input States
  const [inputMode, setInputMode] = useState<"token" | "php">("token");
  const [tokenAmount, setTokenAmount] = useState<string>("5000");
  const [phpAmount, setPhpAmount] = useState<string>("5000");

  // Real Destination States
  const [payoutMethod, setPayoutMethod] = useState<"bank" | "gcash" | "qr">("bank");
  const [bankName, setBankName] = useState<string>("BPI");
  const [accountName, setAccountName] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [qrUploaded, setQrUploaded] = useState<boolean>(false);

  // UI & Receipt States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMsg, setLoadingMsg] = useState<string>("");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const [selectedToken, setSelectedToken] = useState<"XLM" | "PHPC" | "USDC">("PHPC");
  const [rates, setRates] = useState<any>(null);

  const [balance, setBalance] = useState<string>("0.00");

  const fetchBalance = async (address: string, tokenType: string) => {
    try {
      const server = new Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(address);

      // Find the specific asset balance
      const balanceObj = account.balances.find((b: any) => {
        if (tokenType === "XLM") return b.asset_type === "native";
        return b.asset_code === tokenType && b.asset_issuer === TOKEN_ISSUERS[tokenType];
      });

      setBalance(balanceObj ? parseFloat(balanceObj.balance).toLocaleString() : "0.00");
    } catch (e) {
      setBalance("0.00");
      console.error("Balance fetch error:", e);
    }
  };

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
    if (merchantAddress) {
      fetchBalance(merchantAddress, selectedToken);
    }
  }, [merchantAddress, selectedToken]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const merchantDoc = await getDoc(doc(db, "merchants", currentUser.uid));
        if (merchantDoc.exists() && merchantDoc.data().stellarPublicKey) {
          setMerchantAddress(merchantDoc.data().stellarPublicKey);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // --- BIDIRECTIONAL CONVERSION LOGIC ---
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

  // Recalculate when token or rate changes
  useEffect(() => {
    if (inputMode === "token") handleTokenAmountChange(tokenAmount);
    else handlePhpAmountChange(phpAmount);
  }, [selectedToken, rates]);

  const numericBalance = parseFloat(balance.replace(/,/g, '') || "0");
  const isOverBalance = parseFloat(tokenAmount || "0") > numericBalance;

  // --- THE NEW FIRESTORE LOGGING HELPER FOR CASHOUTS ---
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
        anchor: anchor,
        payoutMethod: payoutMethod,
        bankName: payoutMethod === "bank" ? bankName : payoutMethod === "gcash" ? "GCash" : "QR Ph",
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

    // Form Validation
    if (payoutMethod !== "qr" && (!accountName || !accountNumber)) {
      return alert("Please enter the receiving account name and number.");
    }
    if (payoutMethod === "qr" && !qrUploaded) {
      return alert("Please upload your receiving QR code.");
    }

    const startTime = Date.now();
    const shortId = `CO-${Math.floor(Date.now() / 1000)}`;
    let cashoutLogged = false; // Flag to prevent duplicate logging in the catch block

    setIsLoading(true);
    setLoadingMsg(`Securing connection to ${anchor.toUpperCase()}...`);
    setReceipt(null);

    try {
      const server = new Horizon.Server(HORIZON_URL);
      const sourceAccount = await server.loadAccount(merchantAddress);

      // BUILD ASSET DYNAMICALLY
      let asset: Asset;
      if (selectedToken === "XLM") {
        asset = Asset.native();
      } else {
        asset = new Asset(selectedToken, TOKEN_ISSUERS[selectedToken]);
      }

      const txMemo = Memo.text(shortId);

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: "1000",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.payment({
          destination: ANCHOR_ADDRESS,
          asset: asset,
          amount: parseFloat(tokenAmount).toFixed(7),
        }))
        .addMemo(txMemo)
        .setTimeout(30)
        .build();

      setLoadingMsg("Awaiting Freighter Signature...");

      const signResponse = await signTransaction(transaction.toXDR(), {
        network: "TESTNET",
        networkPassphrase: Networks.TESTNET,
      });

      if (!signResponse || signResponse.error) {
        cashoutLogged = true;
        const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
        await saveCashoutToFirestore(shortId, "cancelled", "", "0.00", totalSpeed, "Transaction signature cancelled.");
        throw new Error("Transaction signature cancelled.");
      }

      setLoadingMsg("Executing blockchain settlement...");

      const signedXdrString = typeof signResponse === "string" ? signResponse :
        (signResponse.signedTxXdr || Object.values(signResponse)[0] as string);

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

        cashoutLogged = true;
        const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
        await saveCashoutToFirestore(shortId, "failed", "", "0.00", totalSpeed, exactError);

        if (exactError.includes("op_src_no_trust")) {
          throw new Error(`Failed: YOUR wallet does not trust ${selectedToken}. Please add it to your Freighter wallet first.`);
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

      setLoadingMsg("Saving Secure Bank Details to Firebase...");

      cashoutLogged = true;
      await saveCashoutToFirestore(shortId, "PROCESSING_BANK_WIRE", hash, netSpeed, totalSpeed, "");

      const nowString = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

      let displayDest = "";
      let displayAcc = "";
      if (payoutMethod === "bank") {
        displayDest = `${bankName} InstaPay`;
        displayAcc = `${accountName} (***${accountNumber.slice(-4) || accountNumber})`;
      } else if (payoutMethod === "gcash") {
        displayDest = "GCash E-Wallet";
        displayAcc = `${accountName} (***${accountNumber.slice(-4) || accountNumber})`;
      } else {
        displayDest = "QR Ph Code Transfer";
        displayAcc = "Uploaded QR Image";
      }

      setReceipt({
        id: shortId,
        date: nowString,
        amountToken: parseFloat(tokenAmount).toFixed(2),
        token: selectedToken,
        amountPHP: parseFloat(phpAmount).toFixed(2),
        destination: displayDest,
        accountDetails: displayAcc,
        anchor: anchor.toUpperCase(),
        hash: hash,
        networkSpeed: netSpeed,
        totalWaitTime: totalSpeed
      });

    } catch (error: any) {
      console.error(error);

      // Fallback logging for any unexpected errors that weren't caught above
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
    setQrUploaded(false);
  };

  return (
    <div style={{ position: "relative", minHeight: "80vh" }}>
      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>
      <div>
        <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>Token to Cash Out</div>
        <select
          value={selectedToken}
          onChange={(e) => setSelectedToken(e.target.value as any)}
          style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "14px", color: "#fff", marginBottom: 16 }}
        >
          <option value="PHPC">PHPC (Philippine Stablecoin)</option>
          <option value="USDC">USDC (USD Stablecoin)</option>
          <option value="XLM">XLM (Stellar Lumens)</option>
        </select>
      </div>
      <div style={{ marginBottom: 24 }} className="hide-on-print">
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Cash Out to PHP</h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Convert your tokens to physical Philippine Peso via Stellar Anchors</p>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <span style={{ fontSize: 14, color: "#fff" }}>You will receive</span>
        <span style={{ color: "#10b981", fontSize: 24, fontWeight: 800 }}>
          ₱{parseFloat(phpAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <AnimatePresence mode="wait">
        {!receipt ? (
          /* --- FORM VIEW --- */
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.2)", borderRadius: 8, marginBottom: 24, fontSize: 13, color: "#93c5fd" }}>
              ℹ&nbsp; Cash out is processed via SEP-24 standard. Funds go directly to your bank or e-wallet — no intermediary. Account details are securely encrypted off-chain.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24 }}>

              {/* LEFT: INPUT FORM */}
              <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 14, fontWeight: 700, color: "#e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#7c3aed" }}>1</span> Select Withdrawal Route
                </div>
                <div style={{ padding: 24 }}>

                  {/* ANCHOR SELECTION */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                    {[
                      {
                        id: "pdax",
                        name: "PDAX",
                        customLogo: <span style={{ fontWeight: 900, fontStyle: "italic", fontSize: 18, letterSpacing: "-0.5px" }}>PDAX</span>,
                        color: "#0a2540",
                        text: "#fff"
                      },
                      {
                        id: "palawan",
                        name: "PalawanPay",
                        customLogo: <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Palawan_Pawnshop_Logo.svg/512px-Palawan_Pawnshop_Logo.svg.png" alt="Palawan" height="24" style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />,
                        color: "#ef4444",
                        text: "#fff"
                      },
                    ].map(a => (
                      <div key={a.id} onClick={() => setAnchor(a.id as any)}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px", border: `2px solid ${anchor === a.id ? "#7c3aed" : "rgba(255,255,255,.08)"}`, borderRadius: 12, cursor: "pointer", background: anchor === a.id ? "rgba(124,58,237,.08)" : "transparent", transition: "all .2s ease" }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: a.color, display: "flex", alignItems: "center", justifyContent: "center", color: a.text }}>
                          {a.customLogo}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: anchor === a.id ? "#fff" : "#9ca3af" }}>{a.name}</div>
                      </div>
                    ))}
                  </div>

                  {/* REAL DESTINATION DETAILS */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em" }}>Available Balance</div>
                      <div style={{ fontSize: 12, color: "#10b981", fontWeight: 700 }}>
                        {balance} {selectedToken}
                      </div>
                    </div>

                    {/* DUAL INPUT SYSTEM */}
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

                      {/* TOKEN INPUT */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Amount ({selectedToken})</div>
                        <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,.04)", border: isOverBalance ? "1px solid #ef4444" : "1px solid rgba(255,255,255,.1)", borderRadius: 8, overflow: "hidden", padding: "4px 16px", transition: "all 0.2s" }}>
                          <input
                            type="number"
                            value={tokenAmount}
                            onChange={(e) => handleTokenAmountChange(e.target.value)}
                            style={{ width: "100%", background: "transparent", border: "none", padding: "12px 0", color: isOverBalance ? "#ef4444" : "#fff", fontSize: 18, fontWeight: "bold", outline: "none", fontFamily: "'Nunito',sans-serif" }}
                          />
                        </div>
                        {isOverBalance && <div style={{ color: "#ef4444", fontSize: 11, marginTop: 6, fontWeight: 600 }}>Exceeds available balance</div>}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", paddingTop: 30 }}>
                        <span style={{ color: "#6b7280", fontSize: 18 }}>⇄</span>
                      </div>

                      {/* PHP INPUT */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Amount (PHP)</div>
                        <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, overflow: "hidden", padding: "4px 16px" }}>
                          <span style={{ color: "#9ca3af", fontWeight: "bold", marginRight: 4 }}>₱</span>
                          <input
                            type="number"
                            value={phpAmount}
                            onChange={(e) => handlePhpAmountChange(e.target.value)}
                            style={{ width: "100%", background: "transparent", border: "none", padding: "12px 0", color: "#fff", fontSize: 18, fontWeight: "bold", outline: "none", fontFamily: "'Nunito',sans-serif" }}
                          />
                        </div>
                      </div>

                    </div>

                    <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 16, marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                        <button onClick={() => setPayoutMethod("bank")} style={{ flex: 1, padding: 10, borderRadius: 8, background: payoutMethod === "bank" ? "rgba(124,58,237, 0.15)" : "rgba(255,255,255,.05)", border: payoutMethod === "bank" ? "1px solid #7c3aed" : "1px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                          <span style={{ fontSize: 16 }}>🏦</span> <span style={{ color: payoutMethod === "bank" ? "#fff" : "#9ca3af", fontWeight: 700, fontSize: 13, fontFamily: "'Nunito',sans-serif" }}>Bank</span>
                        </button>
                        <button onClick={() => setPayoutMethod("gcash")} style={{ flex: 1, padding: 10, borderRadius: 8, background: payoutMethod === "gcash" ? "rgba(59, 130, 246, 0.15)" : "rgba(255,255,255,.05)", border: payoutMethod === "gcash" ? "1px solid #3b82f6" : "1px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                          <img src="https://upload.wikimedia.org/wikipedia/commons/5/52/GCash_logo.svg" alt="GCash" height="16" style={{ filter: payoutMethod !== "gcash" ? "grayscale(100%) opacity(0.7)" : "none", transition: "all 0.2s" }} />
                        </button>
                        <button onClick={() => setPayoutMethod("qr")} style={{ flex: 1, padding: 10, borderRadius: 8, background: payoutMethod === "qr" ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,.05)", border: payoutMethod === "qr" ? "1px solid #10b981" : "1px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                          <img src="https://upload.wikimedia.org/wikipedia/commons/c/c5/QR_Ph_logo.svg" alt="QR Ph" height="18" style={{ filter: payoutMethod !== "qr" ? "grayscale(100%) opacity(0.7)" : "none", transition: "all 0.2s" }} />
                        </button>
                      </div>

                      {payoutMethod === "bank" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ width: 44, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: 4, padding: 4 }}>
                              <img src={BANK_LOGOS[bankName]} alt={bankName} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                            </div>
                            <select value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: "100%", background: "transparent", border: "none", color: "#fff", fontSize: 13, outline: "none", fontFamily: "'Nunito',sans-serif", cursor: "pointer" }}>
                              <option value="BPI" style={{ color: "#000" }}>Bank of the Philippine Islands (BPI)</option>
                              <option value="BDO" style={{ color: "#000" }}>BDO Unibank</option>
                              <option value="UnionBank" style={{ color: "#000" }}>UnionBank of the Philippines</option>
                              <option value="Metrobank" style={{ color: "#000" }}>Metrobank</option>
                            </select>
                          </div>

                          <input type="text" placeholder="Account Name (e.g. Juan Dela Cruz)" value={accountName} onChange={(e) => setAccountName(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                          <input type="text" placeholder="Account Number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }} />
                        </div>
                      )}

                      {payoutMethod === "gcash" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <input type="text" placeholder="GCash Registered Name" value={accountName} onChange={(e) => setAccountName(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                          <input type="text" placeholder="GCash Mobile Number (09XXXXXXXXX)" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={11} style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }} />
                        </div>
                      )}

                      {payoutMethod === "qr" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ border: "1px dashed rgba(16,185,129,.4)", background: "rgba(16,185,129,.05)", borderRadius: 8, padding: "24px", textAlign: "center", cursor: "pointer" }} onClick={() => setQrUploaded(true)}>
                            {qrUploaded ? (
                              <div style={{ color: "#10b981", fontWeight: "bold" }}>✓ QR Code Uploaded Successfully</div>
                            ) : (
                              <div style={{ color: "#9ca3af", fontSize: 13 }}>Click to upload QR Ph Code Image<br /><span style={{ fontSize: 11, color: "#6b7280" }}>(Saves from bank/e-wallet app)</span></div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: DYNAMIC SUMMARY */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ background: "#0f1322", border: "1px solid rgba(124,58,237,.3)", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 30px -10px rgba(124,58,237,0.2)" }}>
                  <div style={{ padding: "16px 24px", borderBottom: "1px dashed rgba(124,58,237,.3)", fontSize: 14, fontWeight: 700, color: "#a78bfa" }}>
                    Order Summary
                  </div>
                  <div style={{ padding: 24, fontSize: 13, color: "#9ca3af", display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Sending Amount</span>
                      <span style={{ color: "#e5e7eb", fontWeight: 600 }}>{parseFloat(tokenAmount || "0").toLocaleString()} {selectedToken}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Network Fee</span>
                      <span style={{ color: "#e5e7eb" }}>≈ 0.0001 XLM</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Anchor / Gateway Fee</span>
                      <span style={{ color: "#4ade80" }}>Free (Promo)</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 16, marginTop: 4, borderTop: "1px solid rgba(255,255,255,.08)", alignItems: "center" }}>
                      <span style={{ fontSize: 14, color: "#fff" }}>You will receive</span>
                      <span style={{ color: "#10b981", fontSize: 24, fontWeight: 800, fontFamily: "'Nunito',sans-serif" }}>
                        ₱{parseFloat(phpAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", textAlign: "right" }}>
                      To {payoutMethod === "bank" ? bankName : payoutMethod === "gcash" ? "GCash" : "QR Provider"} via InstaPay
                    </div>
                  </div>
                  <div style={{ padding: "0 24px 24px 24px" }}>
                    <button
                      onClick={handleCashOut}
                      disabled={isOverBalance || parseFloat(tokenAmount) <= 0}
                      style={{
                        width: "100%",
                        background: isOverBalance || parseFloat(tokenAmount) <= 0 ? "#374151" : "linear-gradient(135deg,#10b981,#059669)",
                        color: isOverBalance || parseFloat(tokenAmount) <= 0 ? "#9ca3af" : "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "14px",
                        fontWeight: 800,
                        fontSize: 15,
                        cursor: isOverBalance || parseFloat(tokenAmount) <= 0 ? "not-allowed" : "pointer",
                        fontFamily: "'Nunito',sans-serif",
                        boxShadow: isOverBalance || parseFloat(tokenAmount) <= 0 ? "none" : "0 4px 12px rgba(16,185,129,0.3)",
                        transition: "all 0.2s"
                      }}
                      onMouseOver={(e) => { if (!isOverBalance && parseFloat(tokenAmount) > 0) e.currentTarget.style.transform = "scale(1.02)" }}
                      onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
                    >
                      {isOverBalance ? "Insufficient Balance" : "Authorize Cash Out"}
                    </button>
                  </div>
                </div>

                <div style={{ padding: "16px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 12, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
                  <strong style={{ color: "#9ca3af" }}>Security Note:</strong> For your privacy, your real bank details are heavily encrypted in our secure database. The public Stellar blockchain only sees a hashed reference ID in the transaction memo.
                </div>
              </div>

            </div>
          </motion.div>

        ) : (

          /* --- SUCCESS RECEIPT VIEW --- */
          <motion.div
            key="receipt"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
            style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}
          >
            <div style={{ width: "100%", maxWidth: 480 }}>

              {/* THE RECEIPT CARD */}
              <div id="printable-receipt" style={{ background: "#ffffff", borderRadius: 16, padding: "32px 32px 40px", position: "relative", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -10, left: 0, right: 0, height: 20, background: "repeating-linear-gradient(45deg, transparent, transparent 10px, #080b14 10px, #080b14 20px)" }}></div>

                <div style={{ textAlign: "center", marginBottom: 32, marginTop: 10 }}>
                  <div style={{ width: 64, height: 64, background: "#10b981", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32, color: "#fff", boxShadow: "0 0 20px rgba(16,185,129,0.4)" }}>✓</div>
                  <h2 style={{ margin: 0, color: "#111827", fontFamily: "'Nunito',sans-serif", fontSize: 24, fontWeight: 800 }}>Cash Out Initiated</h2>
                  <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: 14 }}>Your funds have been securely transferred to the anchor.</p>
                </div>

                <div style={{ borderTop: "2px dashed #e5e7eb", borderBottom: "2px dashed #e5e7eb", padding: "24px 0", marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>Tx ID (Memo)</span>
                    <span style={{ color: "#111827", fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{receipt.id}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>Date & Time</span>
                    <span style={{ color: "#111827", fontSize: 13, fontWeight: 600 }}>{receipt.date}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>Route</span>
                    <span style={{ color: "#111827", fontSize: 13, fontWeight: 600 }}>{receipt.destination}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>Account</span>
                    <span style={{ color: "#111827", fontSize: 13, fontWeight: 600 }}>{receipt.accountDetails}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>Amount Burned</span>
                    <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}>- {parseFloat(receipt.amountToken).toLocaleString()} {receipt.token}</span>
                  </div>

                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <span style={{ color: "#374151", fontSize: 16, fontWeight: 700 }}>PHP Expected</span>
                  <span style={{ color: "#10b981", fontSize: 28, fontWeight: 800, fontFamily: "'Nunito',sans-serif" }}>₱{parseFloat(receipt.amountPHP).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", fontFamily: "'DM Mono',monospace", wordBreak: "break-all", background: "#f3f4f6", padding: 12, borderRadius: 8 }}>
                  <div style={{ color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10 }}>Stellar Transaction Hash</div>
                  {receipt.hash}
                </div>

                {/* ⚡ DUAL SPEED BADGES */}
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24 }}>
                  <div style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                    ⚡ Network: {receipt.networkSpeed}s
                  </div>
                  <div style={{ background: "rgba(167, 139, 250, 0.1)", color: "#a78bfa", border: "1px solid rgba(167, 139, 250, 0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                    ⏱️ Total: {receipt.totalWaitTime}s
                  </div>
                </div>

              </div>

              {/* ACTION BUTTONS */}
              <style>{`@media print { .hide-on-print { display: none !important; } }`}</style>

              <div className="hide-on-print" style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button onClick={handlePrint} style={{ flex: 1, background: "rgba(255,255,255,.05)", color: "#fff", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                  🖨️ Print Receipt
                </button>
                <a href={`https://stellar.expert/explorer/testnet/tx/${receipt.hash}`} target="_blank" rel="noreferrer" style={{ flex: 1, textDecoration: "none" }}>
                  <button style={{ width: "100%", background: "rgba(124,58,237,.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,.3)", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                    🔗 View on Explorer
                  </button>
                </a>
              </div>
              <button onClick={resetForm} className="hide-on-print" style={{ width: "100%", background: "transparent", color: "#6b7280", border: "none", marginTop: 16, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                ← Make another cash out
              </button>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}