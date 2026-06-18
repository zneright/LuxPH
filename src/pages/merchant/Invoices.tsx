import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { Horizon } from "@stellar/stellar-sdk";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";

interface TransactionData {
  id: string;
  type: "Received" | "Sent" | "Cashout";
  source: "LuxPH" | "External";
  reference: string;
  description: string;
  counterparty: string;
  merchantWallet: string;
  fiatAmount: number;
  cryptoAmount: string;
  token: string;
  status: string;
  date: string;
  timestamp: number;
  txHash?: string;
}

type FilterType = "ALL" | "LUXPH" | "EXTERNAL" | "CASHOUT";
type WalletFilterType = "ALL_WALLETS" | "CURRENT_WALLET" | "OLD_WALLETS";

// 🚀 NATIVE SVG RENDERER: Renders your exact logo flawlessly without bloating the PDF size.
const generateLuxLogoDataUrl = (): Promise<string> => {
  return new Promise((resolve) => {
    // Note: '#' is encoded as '%23' to properly render inside an Image source
    const svg = `
      <svg width="240" height="240" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="luxGrad" x1="44" y1="40" x2="196" y2="196" gradientUnits="userSpaceOnUse">
            <stop stop-color="%2322C55E" />
            <stop offset="0.55" stop-color="%238B5CF6" />
            <stop offset="1" stop-color="%233B82F6" />
          </linearGradient>
        </defs>
        <path d="M76 42V134 C76 160 94 178 120 178H186" stroke="url(%23luxGrad)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="44" y="24" width="64" height="64" rx="20" fill="%2322C55E" />
        <rect x="154" y="146" width="64" height="64" rx="20" fill="%233B82F6" />
      </svg>
    `;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Double the resolution for crystal clear print quality
      canvas.width = 480;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } else {
        resolve("");
      }
    };
    img.onerror = () => resolve("");
    img.src = `data:image/svg+xml;charset=utf-8,${svg}`;
  });
};

export default function Invoices() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("ALL");
  const [walletFilter, setWalletFilter] = useState<WalletFilterType>("ALL_WALLETS");
  const [currentWalletAddress, setCurrentWalletAddress] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // PDF State
  const [isExporting, setIsExporting] = useState(false);
  const [explorerBaseUrl, setExplorerBaseUrl] = useState("https://stellar.expert/explorer/testnet/tx/");

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeFilter, walletFilter]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoading(true);
        let networkUrl = "https://horizon-testnet.stellar.org";
        let merchantPubKey = "";

        try {
          const configSnap = await getDoc(doc(db, "system_config", "global"));
          if (configSnap.exists()) {
            const configData = configSnap.data();
            if (configData.stellarNetwork === "Mainnet (Public)") {
              setExplorerBaseUrl("https://stellar.expert/explorer/public/tx/");
              networkUrl = "https://horizon.stellar.org";
            }
          }

          const merchantSnap = await getDoc(doc(db, "merchants", user.uid));
          if (merchantSnap.exists()) {
            merchantPubKey = merchantSnap.data().stellarPublicKey || "";
            setCurrentWalletAddress(merchantPubKey);
          }
        } catch (error) {
          console.error("Config fetch error:", error);
        }

        const allTransactions: TransactionData[] = [];
        const knownTxHashes = new Set<string>();
        const currentWalletTxHashes = new Set<string>();
        const horizonRecords: any[] = [];

        if (merchantPubKey) {
          try {
            const server = new Horizon.Server(networkUrl);
            const payments = await server.payments().forAccount(merchantPubKey).order("desc").limit(100).call();

            payments.records.forEach((record: any) => {
              currentWalletTxHashes.add(record.transaction_hash);
              horizonRecords.push(record);
            });
          } catch (error) {
            console.error("Horizon fetch error:", error);
          }
        }

        const resolveWalletOwnership = (data: any) => {
          const savedWallet = data.merchantWallet || data.stellarPublicKey;
          if (savedWallet === merchantPubKey || (data.txHash && currentWalletTxHashes.has(data.txHash))) {
            return merchantPubKey;
          }
          return savedWallet || "OLD_DETACHED_WALLET";
        };

        try {
          const invoicesRef = collection(db, `merchants/${user.uid}/invoices`);
          const invSnap = await getDocs(invoicesRef);
          invSnap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.txHash) knownTxHashes.add(data.txHash);
            allTransactions.push({
              id: docSnap.id,
              type: "Received",
              source: "LuxPH",
              reference: data.invoiceId || data.memo || docSnap.id,
              description: data.description || "LuxPH Invoice Payment",
              counterparty: data.senderPublicKey || "LuxPH QR System",
              merchantWallet: resolveWalletOwnership(data),
              fiatAmount: parseFloat(data.fiatAmount || data.amountPHP || "0"),
              cryptoAmount: String(data.amount || "0"),
              token: data.token || "Unknown",
              status: data.status || "PAID",
              date: data.timestamp ? new Date(data.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A",
              timestamp: data.timestamp ? new Date(data.timestamp).getTime() : 0,
              txHash: data.txHash
            });
          });

          const paymentsRef = collection(db, `merchants/${user.uid}/payments`);
          const paySnap = await getDocs(paymentsRef);
          paySnap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.txHash) knownTxHashes.add(data.txHash);
            allTransactions.push({
              id: docSnap.id,
              type: "Sent",
              source: "LuxPH",
              reference: data.paymentId || docSnap.id,
              description: data.description || "LuxPH Transfer",
              counterparty: data.destination || "Unknown Destination",
              merchantWallet: resolveWalletOwnership(data),
              fiatAmount: parseFloat(data.amountFiat || data.fiatAmount || "0"),
              cryptoAmount: String(data.amountToken || data.amount || "0"),
              token: data.token || "Unknown",
              status: data.status || "COMPLETED",
              date: data.timestamp ? new Date(data.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A",
              timestamp: data.timestamp ? new Date(data.timestamp).getTime() : 0,
              txHash: data.txHash
            });
          });

          const cashoutsRef = collection(db, `merchants/${user.uid}/cashouts`);
          const cashSnap = await getDocs(cashoutsRef);
          cashSnap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.txHash) knownTxHashes.add(data.txHash);
            allTransactions.push({
              id: docSnap.id,
              type: "Cashout",
              source: "LuxPH",
              reference: data.cashoutId || docSnap.id,
              description: `Withdrawal: ${data.bankName || "Bank"}`,
              counterparty: data.accountNumber || "Local Bank",
              merchantWallet: resolveWalletOwnership(data),
              fiatAmount: 0,
              cryptoAmount: String(data.amountToken || data.amount || "0"),
              token: data.token || "Unknown",
              status: data.status || "PROCESSING",
              date: data.timestamp ? new Date(data.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A",
              timestamp: data.timestamp ? new Date(data.timestamp).getTime() : 0,
              txHash: data.txHash
            });
          });
        } catch (error) {
          console.error("Firestore fetch error:", error);
        }

        horizonRecords.forEach((record: any) => {
          if (!knownTxHashes.has(record.transaction_hash)) {
            const isIncoming = record.to === merchantPubKey;
            allTransactions.push({
              id: record.id,
              type: isIncoming ? "Received" : "Sent",
              source: "External",
              reference: `Tx: ${record.transaction_hash.substring(0, 8)}`,
              description: isIncoming ? "External Deposit" : "External Transfer",
              counterparty: isIncoming ? record.from : record.to,
              merchantWallet: merchantPubKey,
              fiatAmount: 0,
              cryptoAmount: String(record.amount),
              token: record.asset_type === "native" ? "XLM" : record.asset_code,
              status: "COMPLETED",
              date: new Date(record.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              timestamp: new Date(record.created_at).getTime(),
              txHash: record.transaction_hash
            });
          }
        });

        allTransactions.sort((a, b) => b.timestamp - a.timestamp);
        setTransactions(allTransactions);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredTransactions = transactions.filter(tx => {
    if (activeFilter === "LUXPH" && tx.source !== "LuxPH") return false;
    if (activeFilter === "EXTERNAL" && tx.source !== "External") return false;
    if (activeFilter === "CASHOUT" && tx.type !== "Cashout") return false;

    const isCurrentWallet = tx.merchantWallet === currentWalletAddress;
    if (walletFilter === "CURRENT_WALLET" && !isCurrentWallet) return false;
    if (walletFilter === "OLD_WALLETS" && isCurrentWallet) return false;

    const search = searchTerm.toLowerCase();
    return (
      (tx.reference && tx.reference.toLowerCase().includes(search)) ||
      (tx.description && tx.description.toLowerCase().includes(search)) ||
      (tx.counterparty && tx.counterparty.toLowerCase().includes(search)) ||
      (tx.cryptoAmount && tx.cryptoAmount.includes(search))
    );
  });

  const totalPagesUI = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const hasMore = currentPage < totalPagesUI;

  const displayedTransactions = isMobile
    ? filteredTransactions.slice(0, currentPage * ITEMS_PER_PAGE)
    : filteredTransactions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoading || !isMobile) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) setCurrentPage(prev => prev + 1);
    }, { rootMargin: "100px" });
    if (node) observer.current.observe(node);
  }, [isLoading, isMobile, hasMore]);

  // 🚀 FLAWLESS NATIVE VECTOR PDF EXPORT ENGINE (ZERO HTML2CANVAS BLOAT)
  const handleExportPDF = async () => {
    setIsExporting(true);

    try {
      // 1. Await the rendering of the exact SVG into a tiny Base64 image
      const perfectLogo = await generateLuxLogoDataUrl();

      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      let y = margin;
      let pageNum = 1;

      const drawTableHeaders = () => {
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128); // gray-500
        doc.setFont("helvetica", "bold");

        doc.text("DATE & TIME", margin + 2, y + 4);
        doc.text("TYPE & DETAILS", margin + 35, y + 4);
        doc.text("AMOUNT & STATUS", pageWidth - margin - 2, y + 4, { align: "right" });

        y += 6;
        doc.setDrawColor(17, 24, 39); // gray-900
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 4;
      };

      // ==========================================
      // PAGE 1: FULL HEADER & PERFECT LOGO
      // ==========================================

      // 1. Stamp Perfect Logo
      if (perfectLogo) {
        doc.addImage(perfectLogo, "PNG", margin, y, 16, 16);
      }

      // 2. Main Title
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Official Transaction Ledger", margin + 20, y + 6);

      // Subtitle
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("Secured by LuxPH Blockchain Gateway", margin + 20, y + 11);

      // 3. Right Aligned Metadata (Date)
      doc.setFontSize(8);
      doc.text("Generated Date", pageWidth - margin, y + 5, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(new Date().toLocaleString(), pageWidth - margin, y + 10, { align: "right" });

      y += 24;

      // 4. Filters Info Box
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.rect(margin, y, pageWidth - margin * 2, 14, "FD");

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text("ACTIVE FILTER SET", margin + 4, y + 5);
      doc.text("TOTAL RECORDS FOUND", pageWidth - margin - 4, y + 5, { align: "right" });

      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(`${activeFilter} • ${walletFilter.replace("_", " ")}`, margin + 4, y + 10);
      doc.text(`${filteredTransactions.length} Transactions`, pageWidth - margin - 4, y + 10, { align: "right" });

      y += 24;

      // 5. Draw First Page Headers
      drawTableHeaders();

      // ==========================================
      // TRANSACTION LOOP
      // ==========================================
      doc.setLineWidth(0.1);
      const rowHeight = 18;

      filteredTransactions.forEach((tx, idx) => {
        // 🚀 IF WE HIT THE BOTTOM (Margin: 35mm) -> CREATE NEW PAGE
        if (y > pageHeight - 35) {
          // Draw Footer on the outgoing page
          doc.setFontSize(8);
          doc.setTextColor(156, 163, 175);
          doc.setFont("helvetica", "normal");
          doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - margin + 5, { align: "right" });

          doc.addPage();
          pageNum++;
          y = margin + 5;

          // 🚀 SUBSEQUENT PAGES: ONLY Draw Headers! No Title/Logo.
          drawTableHeaders();
        }

        const isRx = tx.type === "Received";

        // Alternating row background (zebra striping)
        if (idx % 2 !== 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 2, pageWidth - margin * 2, rowHeight, "F");
        }

        // Exact Date & Time Extraction
        const txDateObj = new Date(tx.timestamp);
        const dateStr = txDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = txDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

        // Column 1: Date & Time (Stacked)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(dateStr, margin + 2, y + 3);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(timeStr, margin + 2, y + 8);

        // Column 2: Type, Description & Ref (Stacked perfectly)
        doc.setFont("helvetica", "bold");
        if (isRx) doc.setTextColor(5, 150, 105); // Emerald
        else doc.setTextColor(15, 23, 42); // Slate
        doc.text(`${tx.type} ${tx.source === "External" ? "(External)" : ""}`, margin + 35, y + 3);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(tx.description.substring(0, 50) + (tx.description.length > 50 ? "..." : ""), margin + 35, y + 8);

        doc.setFont("courier", "normal");
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`Ref: ${tx.reference.substring(0, 45)}`, margin + 35, y + 12.5);

        // Column 3: Amount, Fiat & Status (Right Aligned, Stacked)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        if (isRx) doc.setTextColor(5, 150, 105);
        else doc.setTextColor(15, 23, 42);

        const formattedAmount = `${isRx ? "+" : ""}${parseFloat(tx.cryptoAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tx.token}`;
        doc.text(formattedAmount, pageWidth - margin - 2, y + 3, { align: "right" });

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        if (tx.fiatAmount > 0) {
          doc.text(`~ PHP ${tx.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 2, y + 8, { align: "right" });
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        const s = tx.status.toUpperCase();
        if (s.includes("SUCCESS") || s === "PAID" || s === "COMPLETED") doc.setTextColor(5, 150, 105);
        else if (s.includes("FAIL") || s.includes("CANCEL") || s === "EXPIRED") doc.setTextColor(220, 38, 38);
        else doc.setTextColor(217, 119, 6);
        doc.text(s, pageWidth - margin - 2, y + 12.5, { align: "right" });

        y += rowHeight;
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y - 2, pageWidth - margin, y - 2);
      });

      // Add footer to the very last page
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.setFont("helvetica", "normal");
      doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - margin + 5, { align: "right" });

      // Save tiny vector PDF
      doc.save(`LuxPH_Ledger_${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error("PDF Export failed:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const renderStatus = (status: string) => {
    const s = (status || "").toUpperCase();
    let bg = "#f3f4f6", color = "#6b7280", dotColor = "#9ca3af";

    if (s.includes("SUCCESS") || s === "PAID" || s === "COMPLETED") {
      bg = "#ecfdf5"; color = "#059669"; dotColor = "#10b981";
    } else if (s.includes("FAIL") || s.includes("CANCEL") || s === "EXPIRED") {
      bg = "#fef2f2"; color = "#dc2626"; dotColor = "#ef4444";
    } else if (s.includes("PROCESS") || s === "PENDING" || s === "LISTENING") {
      bg = "#fffbeb"; color = "#d97706"; dotColor = "#f59e0b";
    }

    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6, background: bg, color: color, padding: "4px 10px",
        borderRadius: 99, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em"
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor }} />
        {s.replace(/_/g, " ")}
      </span>
    );
  };

  const shortenAddress = (address: string) => {
    if (!address || address.length < 12) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div style={{ position: "relative", minHeight: "80vh", padding: "16px 8px", boxSizing: "border-box", maxWidth: "1100px", margin: "0 auto", fontFamily: "'Nunito', sans-serif" }}>
      <style>{`
        .history-controls-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 16px; flex-wrap: wrap; }
        
        .history-search-container { 
          display: flex; align-items: center; gap: 12px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; 
          padding: 12px 18px; flex: 1; max-width: 420px; width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.02); transition: all 0.3s ease;
        }
        .history-search-container:focus-within { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1); }
        .search-input { background: none; border: none; color: #111827; font-size: 14px; outline: none; width: 100%; font-weight: 500; }
        
        .wallet-select-container {
          position: relative; display: flex; align-items: center; background: #f9fafb; border: 1px solid #e5e7eb;
          border-radius: 12px; padding: 0 16px; height: 46px; transition: all 0.2s;
        }
        .wallet-select-container:hover { border-color: #d1d5db; background: #ffffff; }
        .wallet-select {
          appearance: none; background: transparent; border: none; color: #374151; font-weight: 800;
          font-size: 13px; font-family: 'Nunito', sans-serif; cursor: pointer; outline: none; padding-right: 24px; width: 100%;
        }

        .filter-row { 
          display: flex; gap: 8px; margin-bottom: 24px; overflow-x: auto; padding-bottom: 4px; 
          -webkit-overflow-scrolling: touch; scrollbar-width: none; 
        }
        .filter-row::-webkit-scrollbar { display: none; }
        .filter-pill { padding: 8px 16px; border-radius: 99px; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; transition: all 0.2s; border: 1px solid transparent; }
        .filter-pill.active { background: #111827; color: #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .filter-pill.inactive { background: #ffffff; color: #6b7280; border-color: #e5e7eb; }
        .filter-pill.inactive:hover { background: #f3f4f6; color: #374151; }

        .action-btns-wrapper { display: flex; gap: 12px; flex-wrap: wrap; flex: none; }
        .btn-request {
          background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; border: none; border-radius: 12px; padding: 0 24px; 
          height: 46px; font-size: 14px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 15px -3px rgba(139, 92, 246, 0.4);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: inline-flex; justify-content: center; align-items: center; gap: 8px;
        }
        .btn-request:hover { transform: translateY(-2px); box-shadow: 0 8px 20px -4px rgba(139, 92, 246, 0.5); }
        .btn-request:active { transform: translateY(1px) scale(0.98); }

        .btn-export {
          background: #ffffff; color: #4b5563; border: 1px solid #d1d5db; border-radius: 12px; padding: 0 16px; 
          height: 46px; font-size: 13px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.02);
          transition: all 0.2s ease; display: inline-flex; justify-content: center; align-items: center; gap: 8px;
        }
        .btn-export:hover:not(:disabled) { background: #f9fafb; border-color: #9ca3af; color: #111827; }
        .btn-export:disabled { opacity: 0.5; cursor: wait; }

        .tx-list-container { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 20px; padding: 8px; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.03); }
        .tx-row { display: flex; align-items: center; justify-content: space-between; padding: 18px 16px; border-radius: 14px; transition: all 0.2s ease; border: 1px solid transparent; border-bottom: 1px solid #f3f4f6; }
        .tx-row:hover { background: #f9fafb; border-color: #e5e7eb; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.02); }

        .tx-icon-box { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px; }
        .tx-info-col { flex: 2; display: flex; flex-direction: column; gap: 6px; min-width: 0; padding-left: 16px; }
        .tx-meta-col { flex: 1.5; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .tx-amt-col { flex: 1; text-align: right; display: flex; flex-direction: column; gap: 4px; }
        .tx-action-col { display: flex; align-items: center; justify-content: flex-end; gap: 16px; width: 140px; }

        .page-btn { padding: 8px 16px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; font-weight: 700; cursor: pointer; color: #374151; transition: 0.2s; }
        .page-btn:hover:not(:disabled) { background: #f3f4f6; }
        .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        @media (max-width: 768px) {
          .action-btns-wrapper { display: flex; flex-direction: column; width: 100%; gap: 10px; }
          .btn-export, .btn-request, .wallet-select-container { width: 100%; justify-content: center; }
          .history-controls-row { margin-bottom: 16px; }
          
          .tx-row { flex-wrap: wrap; padding: 16px; gap: 12px; }
          .tx-icon-box { width: 40px; height: 40px; font-size: 16px; }
          
          .tx-info-col { flex: 1 1 calc(100% - 60px); padding-left: 12px; }
          .tx-meta-col { display: none; }
          
          .tx-amt-col { flex: 1 1 100%; text-align: left; flex-direction: row; align-items: baseline; justify-content: space-between; border-top: 1px solid #f3f4f6; padding-top: 12px; margin-top: 4px; }
          .tx-action-col { flex: 1 1 100%; justify-content: space-between; margin-top: 4px; width: auto; }
        }
        
        .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        @keyframes scrollPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      <AnimatePresence>
        {(isLoading || isExporting) && (
          <LoadingOverlay
            isLoading={true}
            message={isExporting ? "Rendering Vector PDF..." : "Indexing blockchain records..."}
          />
        )}
      </AnimatePresence>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: "#111827", marginBottom: 6, letterSpacing: "-0.02em" }}>Transaction Ledger</h1>
        <p style={{ color: "#6b7280", fontSize: 15, margin: 0, fontWeight: 500 }}>Comprehensive history including app invoices and external wallet transfers.</p>
      </div>

      <div className="history-controls-row">
        <div className="history-search-container">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Reference, address, or amount..." className="search-input" />
        </div>

        <div className="action-btns-wrapper">
          <div className="wallet-select-container">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
            <select value={walletFilter} onChange={(e) => setWalletFilter(e.target.value as WalletFilterType)} className="wallet-select">
              <option value="ALL_WALLETS">All My Wallets</option>
              <option value="CURRENT_WALLET">Current Wallet Only</option>
              <option value="OLD_WALLETS">Old / Detached Wallets</option>
            </select>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: 14, pointerEvents: "none" }}><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>

          <div style={{ display: "flex", gap: "12px", width: isMobile ? "100%" : "auto" }}>
            <button type="button" onClick={handleExportPDF} disabled={isExporting || filteredTransactions.length === 0} className="btn-export" style={{ flex: isMobile ? 1 : "none" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export
            </button>
            <button type="button" onClick={() => navigate("/merchant/create")} className="btn-request" style={{ flex: isMobile ? 1 : "none" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Request
            </button>
          </div>
        </div>
      </div>

      <div className="filter-row">
        <button onClick={() => setActiveFilter("ALL")} className={`filter-pill ${activeFilter === "ALL" ? "active" : "inactive"}`}>All Activity</button>
        <button onClick={() => setActiveFilter("LUXPH")} className={`filter-pill ${activeFilter === "LUXPH" ? "active" : "inactive"}`}>LuxPH Invoices</button>
        <button onClick={() => setActiveFilter("EXTERNAL")} className={`filter-pill ${activeFilter === "EXTERNAL" ? "active" : "inactive"}`}>External (Lobstr/Others)</button>
        <button onClick={() => setActiveFilter("CASHOUT")} className={`filter-pill ${activeFilter === "CASHOUT" ? "active" : "inactive"}`}>Cashouts</button>
      </div>

      <div className="tx-list-container">
        {displayedTransactions.length > 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ staggerChildren: 0.05 }}>
            {displayedTransactions.map((tx, i) => {
              const isRx = tx.type === 'Received';
              const isExt = tx.source === 'External';
              const isOldWallet = tx.merchantWallet !== currentWalletAddress && tx.merchantWallet !== "";

              const iconBg = isExt ? '#f3e8ff' : isRx ? '#d1fae5' : '#dbeafe';
              const iconColor = isExt ? '#8b5cf6' : isRx ? '#10b981' : '#3b82f6';
              const iconSymbol = isExt ? '🛸' : isRx ? '↓' : '🏦';

              return (
                <motion.div key={tx.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="tx-row">
                  <div className="tx-icon-box" style={{ background: iconBg, color: iconColor }}>{iconSymbol}</div>

                  <div className="tx-info-col">
                    <div className="truncate" style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
                      {tx.description}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {isOldWallet && <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>Old Wallet</span>}
                      {isExt && <span style={{ background: "#ede9fe", color: "#7c3aed", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>External</span>}
                      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>{tx.date}</span>
                    </div>
                    {isMobile && (
                      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
                        {isRx ? "FR:" : "TO:"} {shortenAddress(tx.counterparty)} • REF: {shortenAddress(tx.reference)}
                      </div>
                    )}
                  </div>

                  {!isMobile && (
                    <div className="tx-meta-col">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 900, color: isRx ? "#059669" : "#4b5563", background: isRx ? "#ecfdf5" : "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
                          {isRx ? "FROM" : "TO"}
                        </span>
                        <span style={{ fontSize: 12, color: "#4b5563", fontFamily: "'DM Mono', monospace", fontWeight: 600 }} title={tx.counterparty}>
                          {shortenAddress(tx.counterparty)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "'DM Mono', monospace" }}>Ref: {shortenAddress(tx.reference)}</div>
                    </div>
                  )}

                  <div className="tx-amt-col">
                    <div style={{ fontSize: 16, fontWeight: 900, color: isRx ? "#059669" : "#111827", fontFamily: "'DM Mono', monospace" }}>
                      {isRx ? "+" : ""}{parseFloat(tx.cryptoAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: 12, color: "#6b7280" }}>{tx.token}</span>
                    </div>
                    {tx.fiatAmount > 0 ? (
                      <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700 }}>≈ ₱{tx.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#d1d5db", fontWeight: 700 }}>No fiat data</div>
                    )}
                  </div>

                  <div className="tx-action-col">
                    {renderStatus(tx.status)}
                    {tx.txHash ? (
                      <a href={`${explorerBaseUrl}${tx.txHash}`} target="_blank" rel="noreferrer" style={{ width: 34, height: 34, borderRadius: 10, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", textDecoration: "none", transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#e5e7eb"; e.currentTarget.style.color = "#111827"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.color = "#6b7280"; }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                      </a>
                    ) : <div style={{ width: 34, height: 34 }} />}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🧾</div>
            <div style={{ color: "#111827", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>No records found</div>
            <div style={{ color: "#6b7280", fontSize: 14 }}>Try adjusting your filters or search terms.</div>
          </div>
        )}

        {!isMobile && totalPagesUI > 1 && displayedTransactions.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, padding: "16px", borderTop: "1px solid #f3f4f6" }}>
            <button className="page-btn" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>&larr; Previous</button>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 800 }}>Page {currentPage} of {totalPagesUI}</span>
            <button className="page-btn" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPagesUI))} disabled={currentPage === totalPagesUI}>Next &rarr;</button>
          </div>
        )}

        {isMobile && displayedTransactions.length > 0 && (
          <div ref={lastElementRef} style={{ padding: "24px 0", textAlign: "center" }}>
            {hasMore ? (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", animation: "scrollPulse 2s infinite" }}>Scroll to load more...</div>
            ) : (
              <div style={{ fontSize: 12, fontWeight: 700, color: "#d1d5db" }}>End of records</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}