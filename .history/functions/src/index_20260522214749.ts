import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
    Horizon,
    Keypair,
    Asset,
    Operation,
    Claimant,
    TransactionBuilder,
    Networks,
    BASE_FEE
} from "@stellar/stellar-sdk";

// Initialize Firebase Admin to interact with Firestore
admin.initializeApp();
const db = admin.firestore();

// Define the interface for strict typing
interface VaultConfig {
    isEnabled: boolean;
    deductionPercentage: number;
    lockDurationDays: number;
    networkUrl: string;
    targetAsset: string;
}

// Scheduled to run every 10 minutes
export const processVaultDeductions = functions.pubsub.schedule("every 10 minutes").onRun(async (context) => {
    // 1. Fetch all merchants who have the vault active
    const merchantsSnapshot = await db.collection("merchants").where("vaultConfig.isEnabled", "==", true).get();

    for (const doc of merchantsSnapshot.docs) {
        const data = doc.data();
        const config = data.vaultConfig as VaultConfig;

        // IMPORTANT: In a production build, decrypt this key before using it.
        const secretKey = data.encryptedSecretKey;
        if (!secretKey) continue;

        try {
            const kp = Keypair.fromSecret(secretKey);
            const server = new Horizon.Server(config.networkUrl);

            // 2. Fetch payments since the last saved cursor
            const lastCursor = data.lastProcessedCursor || "now";
            const payments = await server.payments().forAccount(kp.publicKey()).cursor(lastCursor).order("asc").limit(50).call();

            let latestCursor = lastCursor;

            // 3. Process new incoming transactions
            for (const record of payments.records) {
                const payment = record as any; // Casting to any to read custom asset properties easily
                latestCursor = payment.paging_token;

                // Verify this is a deposit TO the merchant in the correct target asset
                if (payment.to === kp.publicKey() && payment.asset_code === config.targetAsset) {
                    const amount = parseFloat(payment.amount);
                    const deduction = amount * (config.deductionPercentage / 100);

                    if (deduction > 0) {
                        const deductionStr = deduction.toFixed(7);
                        const account = await server.loadAccount(kp.publicKey());

                        const unlockDate = new Date();
                        unlockDate.setDate(unlockDate.getDate() + config.lockDurationDays);

                        const timePredicate = Claimant.predicateNot(
                            Claimant.predicateBeforeAbsoluteTime(Math.floor(unlockDate.getTime() / 1000).toString())
                        );

                        const op = Operation.createClaimableBalance({
                            asset: new Asset(config.targetAsset, payment.asset_issuer),
                            amount: deductionStr,
                            claimants: [new Claimant(kp.publicKey(), timePredicate)]
                        });

                        const networkPassphrase = config.networkUrl.includes("testnet") ? Networks.TESTNET : Networks.PUBLIC;

                        const transaction = new TransactionBuilder(account, {
                            fee: BASE_FEE,
                            networkPassphrase
                        })
                            .addOperation(op)
                            .setTimeout(30)
                            .build();

                        transaction.sign(kp);
                        await server.submitTransaction(transaction);

                        // 4. Write to a telemetry logs collection for the frontend
                        await db.collection("telemetryLogs").add({
                            merchantId: doc.id,
                            message: `Vault allocation successful! Auto-deducted ${deductionStr} ${config.targetAsset}`,
                            timestamp: admin.firestore.FieldValue.serverTimestamp(),
                            type: "success"
                        });
                    }
                }
            }

            // 5. Update the cursor so we don't re-process the exact same payments on the next run
            if (latestCursor !== lastCursor) {
                await doc.ref.update({ lastProcessedCursor: latestCursor });
            }

        } catch (error) {
            console.error(`Error processing merchant ${doc.id}:`, error);
        }
    }
});