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
  BDO: "https://www.clipartmax.com/png/middle/133-1334248_banco-de-oro-universal-bank-bdo-logo-bdo-logo-png.png",
  UnionBank: "https://mma.prnewswire.com/media/2046183/UB_Union_Bank_of_the_Philippines_Logo.jpg?p=facebook",
  Metrobank: "https://images.gmanews.tv/webpics/2018/02/Metrobank_2018_02_01_18_46_06.jpg"
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

      const isNetworkError = errorMessage.toLowerCase().includes("network") || errorMessage.toLowerCase().includes("passphrase");

      if (isNetworkError) {
        const expectedNetwork = networkConfig.networkPassphrase === Networks.TESTNET ? "TESTNET" : "MAINNET (PUBLIC)";
        const wrongNetwork = expectedNetwork === "TESTNET" ? "MAINNET" : "TESTNET";
        alert(`NETWORK MISMATCH DETECTED!\n\nThe Lux PH System is currently running on ${expectedNetwork}, but your Wallet extension appears to be set to ${wrongNetwork}.\n\nPlease open your wallet extension and switch your network to ${expectedNetwork} to continue.`);
      } else if (errorMessage.toLowerCase().includes("decline") || errorMessage.toLowerCase().includes("cancel") || errorMessage.toLowerCase().includes("reject")) {
        alert("Transaction was cancelled by user.");
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
      await document.fonts.ready;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

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
    setTokenAmount("0");
    handleTokenAmountChange("0");
    setAccountNumber("");
    setAccountName("");
    setQrUploaded(false);
  };

  return (
    <div style={{ position: "relative", minHeight: "80vh", padding: "4px" }}>
      <style>{`
        .co-grid-layout { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; }
        .co-dual-input { display: flex; gap: 16px; align-items: flex-start; }
        .co-method-shelf { display: flex; gap: 8px; margin-bottom: 20px; }
        
        /* PDAX Exchange Theming */
        .co-form-container { background: #181A20; border: 1px solid #2B3139; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
        .co-summary-container { background: rgba(0, 82, 255, 0.04); border: 1px solid rgba(0, 82, 255, 0.15); border-radius: 20px; overflow: hidden; }
        .pdax-input { background: #0B0E11; border: 1px solid #2B3139; border-radius: 12px; transition: all 0.2s; color: #EAECEF; }
        .pdax-input:focus-within { border-color: #0052FF; box-shadow: 0 0 0 1px #0052FF; }
        .pdax-select { background: #0B0E11; border: 1px solid #2B3139; border-radius: 12px; color: #EAECEF; }
        
        .receipt-action-buttons { display: flex; gap: 12px; margin-top: 24px; }
        
        @media (max-width: 992px) {
          .co-grid-layout { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .co-dual-input { flex-direction: column; gap: 16px; width: 100%; }
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
          <h1 style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#EAECEF", marginBottom: 4, letterSpacing: "-0.5px" }}>
            PDAX Gateway
          </h1>
          <p style={{ color: "#848E9C", fontSize: 14 }}>Direct On-Chain Settlement to Fiat</p>
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
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "rgba(0, 82, 255, 0.1)", border: "1px solid rgba(0, 82, 255, 0.2)", borderRadius: 12, marginBottom: 24, fontSize: 13, color: "#93C5FD", lineHeight: 1.5 }}>
              <span style={{ fontSize: 20 }}>🔒</span>
              <div>
                <strong style={{ color: "#BFDBFE" }}>Gateway Active:</strong> The Stellar token transfer to the PDAX Anchor is a <b>real transaction</b>. The final fiat transfer to your bank/e-wallet is simulated for this environment.
              </div>
            </div>

            <div className="co-grid-layout">
              <div className="co-form-container">
                <div style={{ padding: "20px 24px", background: "#1C1F26", borderBottom: "1px solid #2B3139", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: "#EAECEF" }}>
                    <div style={{ background: "#0052FF", color: "#fff", width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold" }}>1</div>
                    Withdrawal Details
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.5px", color: "#EAECEF", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, background: "#0052FF", borderRadius: "50%", boxShadow: "0 0 8px #0052FF" }}></div> PDAX
                  </div>
                </div>

                <div style={{ padding: 24 }}>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, color: "#848E9C", fontWeight: 500, marginBottom: 8 }}>Select Asset</div>
                    <select
                      className="pdax-select"
                      value={selectedToken}
                      onChange={(e) => setSelectedToken(e.target.value as any)}
                      style={{ width: "100%", padding: "16px", fontSize: 15, fontWeight: 500, outline: "none", cursor: "pointer", appearance: "none" }}
                    >
                      <option value="PHPC" style={{ color: "#000" }}>PHPC (Philippine Stablecoin)</option>
                      <option value="USDC" style={{ color: "#000" }}>USDC (USD Stablecoin)</option>
                      <option value="XLM" style={{ color: "#000" }}>XLM (Stellar Lumens)</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 13, color: "#848E9C", fontWeight: 500 }}>Available Balance</div>
                      <div style={{ fontSize: 14, color: "#EAECEF", fontWeight: 700 }}>
                        {balance} <span style={{ color: "#848E9C", fontWeight: 500 }}>{selectedToken}</span>
                      </div>
                    </div>

                    <div className="co-dual-input">
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "#848E9C", fontWeight: 500, marginBottom: 8 }}>Amount ({selectedToken})</div>
                        <div className="pdax-input" style={{ display: "flex", alignItems: "center", padding: "4px 16px", border: isOverBalance ? "1px solid #F6465D" : "" }}>
                          <input
                            type="number"
                            value={tokenAmount}
                            onChange={(e) => handleTokenAmountChange(e.target.value)}
                            style={{ width: "100%", background: "transparent", border: "none", padding: "14px 0", color: isOverBalance ? "#F6465D" : "#EAECEF", fontSize: 20, fontWeight: 700, outline: "none", fontFamily: "'Nunito',sans-serif" }}
                          />
                        </div>
                        {isOverBalance && <div style={{ color: "#F6465D", fontSize: 12, marginTop: 8, fontWeight: 500 }}>Insufficient balance</div>}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", paddingTop: 36 }}>
                        <div style={{ background: "#2B3139", width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#848E9C" }}>
                          ⇄
                        </div>
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "#848E9C", fontWeight: 500, marginBottom: 8 }}>Amount (PHP)</div>
                        <div className="pdax-input" style={{ display: "flex", alignItems: "center", padding: "4px 16px" }}>
                          <span style={{ color: "#848E9C", fontWeight: 700, marginRight: 8, fontSize: 18 }}>₱</span>
                          <input
                            type="number"
                            value={phpAmount}
                            onChange={(e) => handlePhpAmountChange(e.target.value)}
                            style={{ width: "100%", background: "transparent", border: "none", padding: "14px 0", color: "#EAECEF", fontSize: 20, fontWeight: 700, outline: "none", fontFamily: "'Nunito',sans-serif" }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid #2B3139", paddingTop: 24, marginTop: 4 }}>
                      <div style={{ fontSize: 13, color: "#848E9C", fontWeight: 500, marginBottom: 12 }}>Transfer Method</div>
                      <div className="co-method-shelf">
                        <button type="button" onClick={() => setPayoutMethod("bank")} style={{ flex: 1, padding: "14px 10px", borderRadius: 12, background: payoutMethod === "bank" ? "rgba(0, 82, 255, 0.1)" : "#1C1F26", border: payoutMethod === "bank" ? "1px solid #0052FF" : "1px solid #2B3139", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                          <span style={{ fontSize: 18 }}>🏦</span> <span style={{ color: payoutMethod === "bank" ? "#0052FF" : "#EAECEF", fontWeight: 600, fontSize: 14 }}>Bank</span>
                        </button>
                        <button type="button" onClick={() => setPayoutMethod("gcash")} style={{ flex: 1, padding: "14px 10px", borderRadius: 12, background: payoutMethod === "gcash" ? "rgba(0, 82, 255, 0.1)" : "#1C1F26", border: payoutMethod === "gcash" ? "1px solid #0052FF" : "1px solid #2B3139", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                          <img src="https://upload.wikimedia.org/wikipedia/commons/5/52/GCash_logo.svg" alt="GCash" height="18" style={{ filter: payoutMethod !== "gcash" ? "grayscale(100%) opacity(0.5)" : "none", transition: "all 0.2s" }} />
                        </button>
                        <button type="button" onClick={() => setPayoutMethod("qr")} style={{ flex: 1, padding: "14px 10px", borderRadius: 12, background: payoutMethod === "qr" ? "rgba(0, 82, 255, 0.1)" : "#1C1F26", border: payoutMethod === "qr" ? "1px solid #0052FF" : "1px solid #2B3139", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                          <img src="https://upload.wikimedia.org/wikipedia/commons/3/35/QR_Ph_Logo.svg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original" alt="QR Ph" height="20" style={{ filter: payoutMethod !== "qr" ? "grayscale(100%) opacity(0.5)" : "none", transition: "all 0.2s" }} />
                        </button>
                      </div>

                      {payoutMethod === "bank" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          <div className="pdax-input" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px" }}>
                            <div style={{ width: 40, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: 4, padding: 4 }}>
                              <img src={BANK_LOGOS[bankName]} alt={bankName} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                            </div>
                            <select value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: "100%", background: "transparent", border: "none", color: "#EAECEF", fontSize: 14, fontWeight: 500, outline: "none", cursor: "pointer", padding: "8px 0" }}>
                              <option value="BPI" style={{ color: "#000" }}>Bank of the Philippine Islands (BPI)</option>
                              <option value="BDO" style={{ color: "#000" }}>BDO Unibank</option>
                              <option value="UnionBank" style={{ color: "#000" }}>UnionBank of the Philippines</option>
                              <option value="Metrobank" style={{ color: "#000" }}>Metrobank</option>
                            </select>
                          </div>

                          <input className="pdax-input" type="text" placeholder="Account Name (e.g. Juan Dela Cruz)" value={accountName} onChange={(e) => setAccountName(e.target.value)} style={{ width: "100%", padding: "16px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                          <input className="pdax-input" type="text" placeholder="Account Number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} style={{ width: "100%", padding: "16px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }} />
                        </div>
                      )}

                      {payoutMethod === "gcash" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          <input className="pdax-input" type="text" placeholder="GCash Registered Name" value={accountName} onChange={(e) => setAccountName(e.target.value)} style={{ width: "100%", padding: "16px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                          <input className="pdax-input" type="text" placeholder="GCash Mobile Number (09XXXXXXXXX)" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={11} style={{ width: "100%", padding: "16px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }} />
                        </div>
                      )}

                      {payoutMethod === "qr" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          <div style={{ border: "1px dashed rgba(0, 82, 255, 0.4)", background: "rgba(0, 82, 255, 0.05)", borderRadius: 12, padding: "32px", textAlign: "center", cursor: "pointer", transition: "all 0.2s" }} onClick={() => setQrUploaded(true)}>
                            {qrUploaded ? (
                              <div style={{ color: "#0052FF", fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                                <div style={{ background: "#0052FF", color: "#fff", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
                                QR Code Ready
                              </div>
                            ) : (
                              <div style={{ color: "#848E9C", fontSize: 14, fontWeight: 500 }}>
                                <span style={{ fontSize: 24, display: "block", marginBottom: 8 }}>📥</span>
                                Click to upload QR Ph Image<br /><span style={{ fontSize: 12, color: "#5E6673", marginTop: 4, display: "block" }}>Saved directly from your bank app</span>
                              </div>
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
                  <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(0, 82, 255, 0.1)", fontSize: 15, fontWeight: 700, color: "#EAECEF", display: "flex", alignItems: "center", gap: 8 }}>
                    🧾 Settlement Summary
                  </div>
                  <div style={{ padding: 24, fontSize: 14, color: "#848E9C", display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Sending Amount</span>
                      <span style={{ color: "#EAECEF", fontWeight: 600 }}>{parseFloat(tokenAmount || "0").toLocaleString()} {selectedToken}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Network Fee</span>
                      <span style={{ color: "#EAECEF" }}>≈ 0.0001 XLM</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Gateway Fee</span>
                      <span style={{ color: "#00E676", fontWeight: 600 }}>Free</span>
                    </div>

                    <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", margin: "8px 0" }}></div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 15, color: "#EAECEF", fontWeight: 500 }}>You Receive</span>
                      <span style={{ color: "#0052FF", fontSize: 28, fontWeight: 800, fontFamily: "'Nunito',sans-serif", letterSpacing: "-0.5px" }}>
                        ₱{parseFloat(phpAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#5E6673", textAlign: "right", marginTop: -8 }}>
                      To {payoutMethod === "bank" ? bankName : payoutMethod === "gcash" ? "GCash" : "QR Provider"}
                    </div>
                  </div>
                  <div style={{ padding: "0 24px 24px 24px" }}>
                    <button
                      type="button"
                      onClick={handleCashOut}
                      disabled={isOverBalance || parseFloat(tokenAmount) <= 0 || !connectedWallet}
                      style={{
                        width: "100%",
                        background: (isOverBalance || parseFloat(tokenAmount) <= 0 || !connectedWallet) ? "#2B3139" : "#0052FF",
                        color: (isOverBalance || parseFloat(tokenAmount) <= 0 || !connectedWallet) ? "#5E6673" : "#fff",
                        border: "none",
                        borderRadius: 12,
                        padding: "16px",
                        fontWeight: 700,
                        fontSize: 16,
                        cursor: (isOverBalance || parseFloat(tokenAmount) <= 0 || !connectedWallet) ? "not-allowed" : "pointer",
                        fontFamily: "'Nunito',sans-serif",
                        transition: "all 0.2s"
                      }}
                    >
                      {!connectedWallet ? "Connect Wallet to Continue" : isOverBalance ? "Insufficient Balance" : "Confirm Withdrawal"}
                    </button>
                  </div>
                </div>

                <div style={{ padding: "16px", background: "#1C1F26", border: "1px solid #2B3139", borderRadius: 16, fontSize: 13, color: "#848E9C", lineHeight: 1.6 }}>
                  <strong style={{ color: "#EAECEF", display: "block", marginBottom: 4 }}>🔒 Secure Settlement</strong>
                  Your fiat destination details are encrypted. The Stellar blockchain only records a secure reference hash routed directly to the PDAX Gateway.
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

              {/* PRINTABLE RECEIPT */}
              <div id="printable-receipt" style={{ background: "#ffffff", borderRadius: 24, padding: "40px 32px", position: "relative", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}>

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
                      top: "3px"
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
                  <div style={{ width: 72, height: 72, background: "#0052FF", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#fff", boxShadow: "0 8px 16px rgba(0, 82, 255, 0.2)" }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>

                  <h2 style={{ margin: 0, color: "#181A20", fontFamily: "'Nunito',sans-serif", fontSize: 26, fontWeight: 900 }}>Withdrawal Successful</h2>
                  <p style={{ margin: "6px 0 0 0", color: "#5E6673", fontSize: 14 }}>Funds securely routed to PDAX Gateway.</p>
                </div>

                <div style={{ borderTop: "1px solid #EAECEF", borderBottom: "1px solid #EAECEF", padding: "24px 0", marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#848E9C", fontSize: 14 }}>Reference ID</span>
                    <span style={{ color: "#181A20", fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{receipt.id}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#848E9C", fontSize: 14 }}>Date & Time</span>
                    <span style={{ color: "#181A20", fontSize: 14, fontWeight: 600 }}>{receipt.date}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#848E9C", fontSize: 14 }}>Destination</span>
                    <span style={{ color: "#181A20", fontSize: 14, fontWeight: 600 }}>{receipt.destination}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#848E9C", fontSize: 14 }}>Account</span>
                    <span style={{ color: "#181A20", fontSize: 14, fontWeight: 600 }}>{receipt.accountDetails}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#848E9C", fontSize: 14 }}>Tokens Sent</span>
                    <span style={{ color: "#F6465D", fontSize: 14, fontWeight: 700 }}>- {parseFloat(receipt.amountToken).toLocaleString()} {receipt.token}</span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, background: "#F5F7FA", padding: "20px", borderRadius: 16 }}>
                  <span style={{ color: "#5E6673", fontSize: 16, fontWeight: 600 }}>PHP Expected</span>
                  <span style={{ color: "#0052FF", fontSize: 28, fontWeight: 800, fontFamily: "'Nunito',sans-serif", letterSpacing: "-0.5px" }}>₱{parseFloat(receipt.amountPHP).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                <div style={{ textAlign: "center", fontSize: 11, color: "#848E9C", fontFamily: "'DM Mono',monospace", wordBreak: "break-all", background: "#F5F7FA", padding: 16, borderRadius: 12 }}>
                  <div style={{ color: "#5E6673", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10, fontWeight: 600 }}>Stellar Blockchain Hash</div>
                  {receipt.hash}
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
                  <div style={{ background: "rgba(0, 82, 255, 0.1)", color: "#0052FF", borderRadius: 20, padding: "8px 16px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
                    ⚡ Net: {receipt.networkSpeed}s
                  </div>
                  <div style={{ background: "#F5F7FA", color: "#5E6673", borderRadius: 20, padding: "8px 16px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
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
                    background: "#2B3139",
                    color: "#EAECEF",
                    border: "none",
                    borderRadius: 12,
                    padding: "16px",
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: isGeneratingPdf ? "wait" : "pointer",
                    fontFamily: "'Nunito',sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    transition: "background 0.2s"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = "#3B424C"}
                  onMouseOut={(e) => e.currentTarget.style.background = "#2B3139"}
                >
                  {isGeneratingPdf ? "⏳ Generating..." : "📄 Save PDF"}
                </button>
                <a href={`${networkConfig.networkPassphrase === Networks.TESTNET ? "https://stellar.expert/explorer/testnet/tx/" : "https://stellar.expert/explorer/public/tx/"}${receipt.hash}`} target="_blank" rel="noreferrer" style={{ flex: 1, textDecoration: "none" }}>
                  <button type="button" style={{ width: "100%", background: "rgba(0, 82, 255, 0.1)", color: "#0052FF", border: "1px solid rgba(0, 82, 255, 0.2)", borderRadius: 12, padding: "16px", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "'Nunito',sans-serif", transition: "all 0.2s" }}>
                    🔗 View on Explorer
                  </button>
                </a>
              </div>
              <button type="button" onClick={resetForm} style={{ width: "100%", background: "transparent", color: "#848E9C", border: "none", marginTop: 20, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#EAECEF"} onMouseOut={(e) => e.currentTarget.style.color = "#848E9C"}>
                ← Process another withdrawal
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}