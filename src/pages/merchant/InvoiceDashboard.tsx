import React, { useState, useEffect } from 'react';
import { signTransaction } from '@stellar/freighter-api';
import { TransactionBuilder, Networks, Operation, Keypair, Account, Transaction } from '@stellar/stellar-sdk';
import { doc, getDoc, updateDoc, setDoc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface InvoiceDashboardProps {
    userUid: string | undefined;
    stellarAddress: string;
}

const FALLBACK_HORIZON_URL = "https://horizon-testnet.stellar.org";

export default function InvoiceDashboard({ userUid, stellarAddress }: InvoiceDashboardProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [txHash, setTxHash] = useState("");
    const [invoiceAccount, setInvoiceAccount] = useState<string | null>(null);

    const [networkConfig, setNetworkConfig] = useState({
        horizonUrl: FALLBACK_HORIZON_URL,
        passphrase: Networks.TESTNET,
        explorerUrl: "https://stellar.expert/explorer/testnet/tx/"
    });

    useEffect(() => {
        const fetchNetworkConfig = async () => {
            try {
                const configSnap = await getDoc(doc(db, "system_config", "global"));
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    if (data.stellarNetwork === "Mainnet (Public)") {
                        setNetworkConfig({
                            horizonUrl: data.horizonUrl || "https://horizon.stellar.org",
                            passphrase: Networks.PUBLIC,
                            explorerUrl: "https://stellar.expert/explorer/public/tx/"
                        });
                    } else {
                        setNetworkConfig({
                            horizonUrl: data.horizonUrl || FALLBACK_HORIZON_URL,
                            passphrase: Networks.TESTNET,
                            explorerUrl: "https://stellar.expert/explorer/testnet/tx/"
                        });
                    }
                }
            } catch (e) {
                console.error("Failed to sync global platform configs:", e);
            }
        };
        fetchNetworkConfig();
    }, []);

    const generateInvoiceEscrow = async () => {
        if (!stellarAddress) {
            alert("Please connect your Freighter wallet in Settings first!");
            return;
        }

        setIsProcessing(true);
        try {
            // 1. Fetch live transaction ledger state sequence details from Horizon
            const response = await fetch(`${networkConfig.horizonUrl}/accounts/${stellarAddress}`);
            if (!response.ok) {
                throw new Error("Merchant account not funded or found on the Stellar network.");
            }
            const accountData = await response.json();

            const sourceAccount = new Account(stellarAddress, accountData.sequence);

            alert("Step 1 of 2: Generating unique escrow tracking targets...");

            const dynamicInvoiceTarget = Keypair.random();
            const escrowPublicKey = dynamicInvoiceTarget.publicKey();

            alert("Step 2 of 2: Packaging blueprint rules for Freighter validation...");

            const horizonTx = new TransactionBuilder(sourceAccount, {
                fee: "10000",
                networkPassphrase: networkConfig.passphrase,
            })
                .addOperation(Operation.createAccount({
                    destination: escrowPublicKey,
                    startingBalance: "2.5"
                }))
                .addOperation(Operation.setOptions({
                    source: escrowPublicKey,
                    signer: {
                        ed25519PublicKey: stellarAddress,
                        weight: 1
                    },
                    masterWeight: 0,
                    lowThreshold: 1,
                    medThreshold: 1,
                    highThreshold: 1
                }))
                .setTimeout(180)
                .build();

            alert("Please approve the transaction signature request inside your Freighter wallet extension...");

            const signResponse = await signTransaction(horizonTx.toXDR(), {
                network: networkConfig.passphrase === Networks.PUBLIC ? "PUBLIC" : "TESTNET",
                networkPassphrase: networkConfig.passphrase,
            });

            let freighterSignedXdr = "";

            if (typeof signResponse === 'string') {
                freighterSignedXdr = signResponse;
            } else if (signResponse && typeof signResponse === 'object') {
                if ((signResponse as any).error) {
                    throw new Error(`Freighter Error: ${(signResponse as any).error}`);
                }
                freighterSignedXdr = (signResponse as any).signedTxXdr || (signResponse as any).signedTransaction || "";
            }

            if (!freighterSignedXdr) {
                throw new Error("Freighter returned an empty or unrecognized signature response.");
            }

            alert("Appending secure local escrow transaction tokens...");

            const finalTx = TransactionBuilder.fromXDR(freighterSignedXdr, networkConfig.passphrase) as Transaction;
            finalTx.sign(dynamicInvoiceTarget);

            alert("Submitting unified transaction blueprint package onto Horizon infrastructure...");

            const fullySignedXdr = finalTx.toXDR();

            const submitResponse = await fetch(`${networkConfig.horizonUrl}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ tx: fullySignedXdr })
            });

            const submissionResult = await submitResponse.json();

            if (!submissionResult.successful) {
                console.error("Horizon Reject Receipt Log:", submissionResult);
                throw new Error(submissionResult.extras?.result_codes?.transaction || "Horizon node rejected transaction structure properties.");
            }

            setTxHash(submissionResult.hash);
            setInvoiceAccount(escrowPublicKey);

            // 🚨 FIRESTORE TRACKING SYNCHRONIZATION 🚨
            if (userUid) {
                // A. Save the individual invoice record into the subcollection
                const invoiceDocRef = doc(db, `merchants/${userUid}/invoices`, escrowPublicKey);
                await setDoc(invoiceDocRef, {
                    invoiceAddress: escrowPublicKey,
                    creationTxHash: submissionResult.hash,
                    merchantAddress: stellarAddress,
                    timestamp: new Date().toISOString(),
                    status: "pending",
                    amount: "0",      // Placed as string to handle flexible parsing values later
                    fiatAmount: "0"
                });

                // B. Increment the global volume metrics on the merchant parent profile
                const merchantRef = doc(db, "merchants", userUid);
                await updateDoc(merchantRef, {
                    invoicesGenerated: increment(1)
                });
            }

            alert(`Success! Invoice tracker active and synchronized with Firestore!\nAddress: ${escrowPublicKey}`);

        } catch (error: any) {
            console.error("Horizon Ledger Submission Matrix Crash:", error);
            alert(`Deployment Failed: ${error.message || "Review dashboard network configurations."}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ padding: "4px" }}>
            <style>{`
                .id-grid-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 24px; }
                .id-panel-card { padding: 20px; background: rgba(255,255,255,.04); border-radius: 12px; border: 1px solid rgba(255,255,255,.08); display: flex; flex-direction: column; justify-content: space-between; }
                .id-status-row { background: rgba(0,0,0,.2); padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,.05); display: flex; justify-content: space-between; align-items: center; gap: 16px; }
                
                @media (max-width: 768px) {
                    .id-grid-container { grid-template-columns: 1fr; gap: 16px; }
                    .id-panel-card { gap: 16px; }
                    .id-status-row { flex-direction: column; align-items: flex-start; }
                    .id-status-row button { width: 100%; text-align: center; margin-top: 8px; }
                }
            `}</style>

            <div className="id-grid-container">
                <div className="id-panel-card">
                    <div>
                        <h3 style={{ color: "#fff", fontFamily: "'Nunito',sans-serif", marginTop: 0, marginBottom: 8 }}>Invoice Target Management</h3>
                        <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 20 }}>Initialize an independent transaction tracking address natively onto the Stellar transaction ledger using Horizon engines.</p>
                    </div>

                    <button
                        type="button"
                        onClick={generateInvoiceEscrow}
                        disabled={isProcessing || !stellarAddress}
                        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 14, fontWeight: 700, cursor: (isProcessing || !stellarAddress) ? "not-allowed" : "pointer", fontFamily: "'Nunito',sans-serif", width: "100%" }}
                    >
                        {isProcessing ? "Building Ledger Anchor..." : "Generate Invoice Account"}
                    </button>

                    {txHash && (
                        <div style={{ marginTop: 16, padding: 12, background: "rgba(124,58,237,.1)", borderRadius: 8, border: "1px solid rgba(124,58,237,.2)" }}>
                            <div style={{ fontSize: 11, color: "#c084fc", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Activation Transaction Hash</div>
                            <a href={`${networkConfig.explorerUrl}${txHash}`} target="_blank" rel="noreferrer" style={{ color: "#a855f7", fontSize: 12, wordBreak: "break-all", textDecoration: "none" }}>
                                {txHash}
                            </a>
                        </div>
                    )}
                </div>

                <div className="id-panel-card">
                    <div>
                        <h3 style={{ color: "#fff", fontFamily: "'Nunito',sans-serif", marginTop: 0, marginBottom: 8 }}>Live Address Resolution</h3>
                        <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 20 }}>Active payment point reference tracked inside standard Stellar Network explorer systems.</p>
                    </div>

                    <div className="id-status-row">
                        <div style={{ width: "100%" }}>
                            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Target Payment Tracker Public Key</div>
                            <div style={{ color: "#4ade80", fontFamily: "'DM Mono',monospace", fontSize: 13, wordBreak: "break-all" }}>
                                {invoiceAccount || "No active invoice generated yet"}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

