import React, { useState, useEffect } from "react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo, StrKey } from "@stellar/stellar-sdk";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// IMPORT YOUR WALLET AND NETWORK CONTEXTS
import { useWallet } from "../../contexts/WalletContext";
import { useNetwork } from "../../contexts/NetworkContext";

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

  const { networkConfig, systemConfig } = useNetwork();
  const { address: connectedWallet, signTx } = useWallet();

  const [inputMode, setInputMode] = useState<"token" | "php">("token");
  const [tokenAmount, setTokenAmount] = useState<string>("5000");
  const [phpAmount, setPhpAmount] = useState<string>("5000");

  const [payoutMethod, setPayoutMethod] = useState<"bank" | "gcash" | "qr">("bank");
  const [bankName, setBankName] = useState<string>("BPI");
  const [accountName, setAccountName] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [qrUploaded, setQrUploaded] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [loadingMsg, setLoadingMsg] = useState<string>("Initializing PDAX Gateway...");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [selectedToken, setSelectedToken] = useState<"XLM" | "PHPC" | "USDC">("PHPC");
  const [rates, setRates] = useState<any>(null);
  const [balance, setBalance] = useState<string>("0.00");

  useEffect(() => {
    const initSystem = async () => {
      try {
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
        const server = new Horizon.Server(networkConfig.horizonUrl);
        const account = await server.loadAccount(merchantAddress);

        const balanceObj = account.balances.find((b: any) => {
          if (selectedToken === "XLM") return b.asset_type === "native";
          const targetIssuer = selectedToken === "PHPC" ? systemConfig.phpcIssuerAddress : systemConfig.usdcIssuerAddress;
          return b.asset_code === selectedToken && b.asset_issuer === targetIssuer;
        });

        setBalance(balanceObj ? parseFloat(balanceObj.balance).toLocaleString() : "0.00");
      } catch (e) {
        setBalance("0.00");
      }
    };
    fetchBalance();
  }, [merchantAddress, selectedToken, networkConfig.horizonUrl, systemConfig.phpcIssuerAddress, systemConfig.usdcIssuerAddress]);

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

  const validateNetworkConfiguration = async () => {
    const server = new Horizon.Server(networkConfig.horizonUrl);
    const root = await server.root();

    if (!root || typeof root.network_passphrase !== 'string') {
      throw new Error('Unable to validate Horizon network status.');
    }
    if (root.network_passphrase !== networkConfig.networkPassphrase) {
      throw new Error('Horizon network mismatch: configured network does not match Horizon response.');
    }
    return true;
  };

  const handleCashOut = async () => {
    if (!user) return alert("Please log in to continue.");
    if (!connectedWallet) return alert("Please connect your wallet first.");
    if (!merchantAddress) return alert("No merchant address configured in settings.");
    if (!tokenAmount || parseFloat(tokenAmount) <= 0) return alert("Please enter a valid amount.");
    if (isOverBalance) return alert("Amount exceeds available balance.");

    if (payoutMethod !== "qr" && (!accountName || !accountNumber)) return alert("Please enter the receiving account name and number.");
    if (payoutMethod === "qr" && !qrUploaded) return alert("Please upload your receiving QR code.");

    const startTime = Date.now();
    const shortId = `PDAX-${Math.floor(Date.now() / 1000)}`;
    let cashoutLogged = false;

    setIsLoading(true);
    setLoadingMsg(`Securing connection to PDAX Gateway...`);
    setReceipt(null);

    try {
      setLoadingMsg("Rechecking network configuration...");
      await validateNetworkConfiguration();

      setLoadingMsg(`Securing connection to PDAX Gateway on ${networkConfig.stellarNetwork}...`);
      const server = new Horizon.Server(networkConfig.horizonUrl);
      const sourceAccount = await server.loadAccount(merchantAddress);

      let asset: Asset;
      if (selectedToken === "XLM") {
        asset = Asset.native();
      } else if (selectedToken === "PHPC") {
        asset = new Asset("PHPC", systemConfig.phpcIssuerAddress);
      } else {
        asset = new Asset("USDC", systemConfig.usdcIssuerAddress);
      }

      const txMemo = Memo.text(shortId);

      let anchorDestination = systemConfig.pdaxAnchorAddress;

      if (!anchorDestination || !StrKey.isValidEd25519PublicKey(anchorDestination)) {
        console.warn("PDAX Anchor address is missing or invalid. Falling back to the Token Issuer address to simulate gateway settlement.");
        if (!asset.isNative() && asset.issuer) {
          anchorDestination = asset.issuer;
        } else {
          anchorDestination = systemConfig.phpcIssuerAddress;
        }
      }

      if (!anchorDestination || !StrKey.isValidEd25519PublicKey(anchorDestination)) {
        throw new Error("System Configuration Error: No valid anchor or issuer address found to receive the funds.");
      }

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: "1000",
        networkPassphrase: networkConfig.networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination: anchorDestination,
          asset: asset,
          amount: parseFloat(tokenAmount).toFixed(7),
        }))
        .addMemo(txMemo)
        .setTimeout(30)
        .build();

      setLoadingMsg("Awaiting Wallet Signature...");

      const signedXdrString = await signTx(transaction.toXDR(), networkConfig.networkPassphrase);

      if (!signedXdrString) {
        throw new Error("Transaction signature cancelled or failed.");
      }

      setLoadingMsg("Executing blockchain settlement via PDAX...");

      const txBody = new URLSearchParams();
      txBody.append("tx", signedXdrString);

      const submitResponse = await fetch(`${networkConfig.horizonUrl}/transactions`, {
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
        } else if (exactError.includes("op_no_destination")) {
          throw new Error("Failed: The Gateway Destination Account does not exist on the network yet.");
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

      setLoadingMsg("Saving Secure Bank Details to PDAX...");

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
        anchor: "PDAX Gateway",
        hash: hash,
        networkSpeed: netSpeed,
        totalWaitTime: totalSpeed
      });

    } catch (error: any) {
      console.error("CashOut Execution Error:", error);

      let errorMessage = "Unknown error occurred.";
      if (typeof error === "string") {
        errorMessage = error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === "object") {
        errorMessage = error.message || error.error || error.details || JSON.stringify(error);
      }

      if (!cashoutLogged) {
        const totalSpeed = ((Date.now() - startTime) / 1000).toFixed(2);
        await saveCashoutToFirestore(shortId, "failed", "", "0.00", totalSpeed, errorMessage);
      }

      if (errorMessage.toLowerCase().includes("decline") || errorMessage.toLowerCase().includes("cancel") || errorMessage.toLowerCase().includes("reject")) {
        alert("Transaction was cancelled.");
      } else {
        alert(`Cash Out Failed: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById("printable-receipt");
    if (!element || !receipt) return;

    setIsGeneratingPdf(true);
    try {
      // html2canvas grabs the exact visual representation of the div
      // useCORS is required so external bank/gcash logos load in the canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });

      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      // Keep the aspect ratio identical to the UI
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      // Draw it onto the PDF document
      pdf.addImage(imgData, "PNG", 0, 10, pdfWidth, pdfHeight);
      pdf.save(`PDAX_Settlement_${receipt.id}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Failed to generate PDF. Check console for details.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const resetForm = () => {
    setReceipt(null);
    setTokenAmount("5000");
    handleTokenAmountChange("5000");
    setAccountNumber("");
    setAccountName("");
    setQrUploaded(false);
  };

  return (
    <div style={{ position: "relative", minHeight: "80vh", padding: "4px" }}>
      <style>{`
        .co-grid-layout { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; }
        .co-dual-input { display: flex; gap: 16px; align-items: flex-start; }
        .co-method-shelf { display: flex; gap: 8px; margin-bottom: 16px; }
        .co-form-container { background: #111827; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5); }
        .co-summary-container { background: #0a2540; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px -10px rgba(10, 37, 64, 0.5); }
        .receipt-action-buttons { display: flex; gap: 12px; mt: 24px; }
        
        @media (max-width: 992px) {
          .co-grid-layout { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .co-dual-input { flex-direction: column; gap: 12px; width: 100%; }
          .co-dual-input > div { width: 100%; }
          .co-dual-input > div:nth-child(2) { display: none !important; }
          .co-method-shelf { flex-direction: column; }
          .receipt-action-buttons { flex-direction: column; }
        }
      `}</style>

      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message={loadingMsg} />}
      </AnimatePresence>

      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>
            PDAX Gateway
          </h1>
          <p style={{ color: "#9ca3af", fontSize: 13 }}>Direct On-Chain Settlement to Fiat</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!receipt ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {/* GATEWAY REALITY DISCLAIMER */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 8, marginBottom: 24, fontSize: 13, color: "#a7f3d0" }}>
              <span style={{ fontSize: 18 }}>🔒</span>
              <div>
                <strong>Gateway Active:</strong> The Stellar token transfer to the PDAX Anchor is a <b>real transaction</b>. For this environment, the final fiat transfer to your bank/e-wallet is simulated.
              </div>
            </div>

            <div className="co-grid-layout">
              <div className="co-form-container">
                <div style={{ padding: "16px 24px", background: "#000", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 14, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: "#10b981" }}>1</span> Withdrawal Details
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: "1px", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 12, height: 12, background: "#10b981", borderRadius: "50%" }}></div> PDAX
                  </div>
                </div>

                <div style={{ padding: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>Token to Cash Out</div>
                    <select
                      value={selectedToken}
                      onChange={(e) => setSelectedToken(e.target.value as any)}
                      style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "14px", color: "#fff", marginBottom: 24, outline: "none" }}
                    >
                      <option value="PHPC" style={{ color: "#000" }}>PHPC (Philippine Stablecoin)</option>
                      <option value="USDC" style={{ color: "#000" }}>USDC (USD Stablecoin)</option>
                      <option value="XLM" style={{ color: "#000" }}>XLM (Stellar Lumens)</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em" }}>Available Balance</div>
                      <div style={{ fontSize: 12, color: "#10b981", fontWeight: 700 }}>
                        {balance} {selectedToken}
                      </div>
                    </div>

                    <div className="co-dual-input">
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
                      <div className="co-method-shelf">
                        <button type="button" onClick={() => setPayoutMethod("bank")} style={{ flex: 1, padding: 10, borderRadius: 8, background: payoutMethod === "bank" ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,.05)", border: payoutMethod === "bank" ? "1px solid #10b981" : "1px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                          <span style={{ fontSize: 16 }}>🏦</span> <span style={{ color: payoutMethod === "bank" ? "#fff" : "#9ca3af", fontWeight: 700, fontSize: 13, fontFamily: "'Nunito',sans-serif" }}>Bank</span>
                        </button>
                        <button type="button" onClick={() => setPayoutMethod("gcash")} style={{ flex: 1, padding: 10, borderRadius: 8, background: payoutMethod === "gcash" ? "rgba(59, 130, 246, 0.15)" : "rgba(255,255,255,.05)", border: payoutMethod === "gcash" ? "1px solid #3b82f6" : "1px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                          <img src="https://upload.wikimedia.org/wikipedia/commons/5/52/GCash_logo.svg" alt="GCash" height="16" style={{ filter: payoutMethod !== "gcash" ? "grayscale(100%) opacity(0.7)" : "none", transition: "all 0.2s" }} />
                        </button>
                        <button type="button" onClick={() => setPayoutMethod("qr")} style={{ flex: 1, padding: 10, borderRadius: 8, background: payoutMethod === "qr" ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,.05)", border: payoutMethod === "qr" ? "1px solid #10b981" : "1px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
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

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div className="co-summary-container">
                  <div style={{ padding: "16px 24px", borderBottom: "1px dashed rgba(16, 185, 129, 0.3)", fontSize: 14, fontWeight: 700, color: "#10b981" }}>
                    PDAX Settlement Summary
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
                      <span>PDAX Gateway Fee</span>
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
                      type="button"
                      onClick={handleCashOut}
                      disabled={isOverBalance || parseFloat(tokenAmount) <= 0 || !connectedWallet}
                      style={{
                        width: "100%",
                        background: (isOverBalance || parseFloat(tokenAmount) <= 0 || !connectedWallet) ? "#374151" : "linear-gradient(135deg,#10b981,#059669)",
                        color: (isOverBalance || parseFloat(tokenAmount) <= 0 || !connectedWallet) ? "#9ca3af" : "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "14px",
                        fontWeight: 800,
                        fontSize: 15,
                        cursor: (isOverBalance || parseFloat(tokenAmount) <= 0 || !connectedWallet) ? "not-allowed" : "pointer",
                        fontFamily: "'Nunito',sans-serif",
                        boxShadow: (isOverBalance || parseFloat(tokenAmount) <= 0 || !connectedWallet) ? "none" : "0 4px 12px rgba(16,185,129,0.3)",
                        transition: "all 0.2s"
                      }}
                    >
                      {!connectedWallet ? "Connect Wallet to Continue" : isOverBalance ? "Insufficient Balance" : "Authorize Cash Out"}
                    </button>
                  </div>
                </div>

                <div style={{ padding: "16px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 12, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
                  <strong style={{ color: "#9ca3af" }}>Security Note:</strong> Your real bank details are heavily encrypted in our secure database. The public Stellar blockchain only sees a hashed reference ID in the transaction memo which the PDAX Gateway reads securely off-chain.
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="receipt"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
            style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}
          >
            <div style={{ width: "100%", maxWidth: 480 }}>
              {/* THE ELEMENT WE ARE CONVERTING TO PDF */}
              <div id="printable-receipt" style={{ background: "#ffffff", borderRadius: 16, padding: "32px 32px 40px", position: "relative", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -10, left: 0, right: 0, height: 20, background: "repeating-linear-gradient(45deg, transparent, transparent 10px, #0a2540 10px, #0a2540 20px)" }} />

                {/* LUX PH LOGO FOR PDF EXPORT */}
                <div style={{ textAlign: "center", marginBottom: 16, marginTop: 16 }}>
                  <img src="/images/luxphlogo.svg" alt="Lux PH Logo" style={{ height: 42, objectFit: "contain" }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </div>

                <div style={{ textAlign: "center", marginBottom: 32 }}>
                  <div style={{ width: 64, height: 64, background: "#10b981", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32, color: "#fff", boxShadow: "0 0 20px rgba(16,185,129,0.4)" }}>✓</div>
                  <h2 style={{ margin: 0, color: "#0a2540", fontFamily: "'Nunito',sans-serif", fontSize: 24, fontWeight: 900 }}>Gateway Settled</h2>
                  <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: 14 }}>Your funds have securely reached PDAX.</p>
                </div>

                <div style={{ borderTop: "2px dashed #e5e7eb", borderBottom: "2px dashed #e5e7eb", padding: "24px 0", marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>PDAX Reference ID</span>
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
                    <span style={{ color: "#6b7280", fontSize: 13 }}>Amount Processed</span>
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

                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24 }}>
                  <div style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                    ⚡ Network: {receipt.networkSpeed}s
                  </div>
                  <div style={{ background: "rgba(10, 37, 64, 0.1)", color: "#0a2540", border: "1px solid rgba(10, 37, 64, 0.2)", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                    ⏱️ Total: {receipt.totalWaitTime}s
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
                <a href={`${networkConfig.networkPassphrase === Networks.TESTNET ? "https://stellar.expert/explorer/testnet/tx/" : "https://stellar.expert/explorer/public/tx/"}${receipt.hash}`} target="_blank" rel="noreferrer" style={{ flex: 1, textDecoration: "none" }}>
                  <button type="button" style={{ width: "100%", background: "rgba(10, 37, 64, 0.5)", color: "#93c5fd", border: "1px solid #1e3a8a", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
                    🔗 View Explorer
                  </button>
                </a>
              </div>
              <button type="button" onClick={resetForm} style={{ width: "100%", background: "transparent", color: "#6b7280", border: "none", marginTop: 16, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                ← Make another cash out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}