import React, { useState, useEffect } from 'react';
import { signTransaction } from '@stellar/freighter-api';
import { Horizon, TransactionBuilder, Networks, Operation } from '@stellar/stellar-sdk';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface InvoiceDashboardProps {
    userUid: string | undefined;
    stellarAddress: string;
}

export default function InvoiceDashboard({ userUid, stellarAddress }: InvoiceDashboardProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [txHash, setTxHash] = useState("");
    const [onChainInvoice, setOnChainInvoice] = useState<string | null>(null);
    const [isFetchingChainData, setIsFetchingChainData] = useState(false);

    // 1. Write to Blockchain (Generate Invoice)
    const generateBlockchainInvoice = async () => {
        if (!stellarAddress) {
            alert("Please connect your Freighter wallet in Settings first!");
            return;
        }

        setIsProcessing(true);
        try {
            const server = new Horizon.Server("https://horizon-testnet.stellar.org");
            const account = await server.loadAccount(stellarAddress);

            // Generate a simple mock Invoice ID
            const invoiceId = `INV-${Date.now().toString().slice(-6)}`;

            const transaction = new TransactionBuilder(account, {
                fee: "100",
                networkPassphrase: Networks.TESTNET,
            })
                .addOperation(Operation.manageData({
                    name: "Latest_Invoice",
                    value: invoiceId,
                }))
                .setTimeout(30)
                .build();

            // Ask Freighter to sign the transaction
            const signResponse = await signTransaction(transaction.toXDR(), {
                network: "TESTNET",
                networkPassphrase: Networks.TESTNET,
            });

            if (!signResponse || signResponse.error) {
                throw new Error(signResponse.error || "Transaction signing was cancelled.");
            }

            // ==========================================
            // THE BULLETPROOF STRING EXTRACTION FIX
            // ==========================================
            let signedXdrString = "";
            if (typeof signResponse === "string") {
                signedXdrString = signResponse;
            } else if (signResponse.signedTxXdr) {
                signedXdrString = signResponse.signedTxXdr;
            } else {
                signedXdrString = Object.values(signResponse)[0] as string;
            }

            const txBody = new URLSearchParams();
            txBody.append("tx", signedXdrString);

            const submitResponse = await fetch("https://horizon-testnet.stellar.org/transactions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: txBody.toString()
            });

            const responseData = await submitResponse.json();

            if (!submitResponse.ok) {
                console.error("Network Error Details:", responseData.extras?.result_codes || responseData);
                throw new Error("Transaction rejected by the network.");
            }
            // ==========================================

            // Success! Set the hash in the UI
            setTxHash(responseData.hash);

            // Update Firebase
            if (userUid) {
                const merchantRef = doc(db, "merchants", userUid);
                await updateDoc(merchantRef, {
                    invoicesGenerated: increment(1)
                });
            }

            alert(`Invoice ${invoiceId} successfully logged on Stellar!`);
            // Automatically fetch the updated data from the chain
            fetchBlockchainData();

        } catch (error) {
            console.error("Blockchain Error:", error);
            alert("Failed to execute transaction. Check console for details.");
        }
        setIsProcessing(false);
    };

    // 2. Read from Blockchain (Verify)
    const fetchBlockchainData = async () => {
        if (!stellarAddress) return;

        setIsFetchingChainData(true);
        try {
            const server = new Horizon.Server("https://horizon-testnet.stellar.org");
            const account = await server.loadAccount(stellarAddress);

            // Stellar stores 'manageData' values as base64 strings in the data_attr object
            if (account.data_attr && account.data_attr["Latest_Invoice"]) {
                const decodedInvoice = atob(account.data_attr["Latest_Invoice"]);
                setOnChainInvoice(decodedInvoice);
            } else {
                setOnChainInvoice("No invoice found on-chain.");
            }
        } catch (error) {
            console.error("Failed to fetch from Horizon", error);
            setOnChainInvoice("Error fetching data.");
        }
        setIsFetchingChainData(false);
    };

    useEffect(() => {
        if (stellarAddress) {
            fetchBlockchainData();
        }
    }, [stellarAddress]);

    return (
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Action Panel */}
            <div style={{ padding: 20, background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.08)" }}>
                <h3 style={{ color: "#fff", fontFamily: "'Nunito',sans-serif", marginTop: 0, marginBottom: 8 }}>Issue Invoice</h3>
                <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 20 }}>Create a new invoice and log its ID immutably on the Stellar Testnet.</p>

                <button
                    onClick={generateBlockchainInvoice}
                    disabled={isProcessing || !stellarAddress}
                    style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 14, fontWeight: 700, cursor: (isProcessing || !stellarAddress) ? "not-allowed" : "pointer", fontFamily: "'Nunito',sans-serif", width: "100%" }}
                >
                    {isProcessing ? "Processing..." : "Generate & Sign"}
                </button>

                {txHash && (
                    <div style={{ marginTop: 16, padding: 12, background: "rgba(16,185,129,.1)", borderRadius: 8, border: "1px solid rgba(16,185,129,.2)" }}>
                        <div style={{ fontSize: 11, color: "#a7f3d0", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Tx Hash</div>
                        <a href={`https://stellar.expert/explorer/testnet/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: "#34d399", fontSize: 12, wordBreak: "break-all", textDecoration: "none" }}>
                            {txHash}
                        </a>
                    </div>
                )}
            </div>

            {/* Verification Panel */}
            <div style={{ padding: 20, background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.08)" }}>
                <h3 style={{ color: "#fff", fontFamily: "'Nunito',sans-serif", marginTop: 0, marginBottom: 8 }}>On-Chain Verification</h3>
                <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 20 }}>Live data read directly from the Horizon network, proving immutability.</p>

                <div style={{ background: "rgba(0,0,0,.2)", padding: 16, borderRadius: 8, border: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Latest Logged Invoice</div>
                        <div style={{ color: "#fff", fontFamily: "'DM Mono',monospace", fontSize: 16 }}>
                            {isFetchingChainData ? "Reading ledger..." : (onChainInvoice || "None")}
                        </div>
                    </div>
                    <button onClick={fetchBlockchainData} style={{ background: "transparent", border: "1px solid rgba(255,255,255,.2)", color: "#fff", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>
                        Refresh
                    </button>
                </div>
            </div>

        </div>
    );
}