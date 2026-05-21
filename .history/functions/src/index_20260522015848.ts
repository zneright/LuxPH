import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
    Horizon,
    Keypair,
    Asset,
    TransactionBuilder,
    Networks,
    Operation,
    Claimant,
    BASE_FEE
} from "@stellar/stellar-sdk";

admin.initializeApp();
const db = admin.firestore();

// Wakes up every 2 minutes 24/7
export const autoContingencyVault = functions.pubsub.schedule('every 2 minutes').onRun(async (context) => {
    const merchantsSnap = await db.collection("merchants").get();

    for (const doc of merchantsSnap.docs) {
        const data = doc.data();
        const config = data.vaultConfig;

        // Skip if vault is off, or if the merchant hasn't saved their secret key
        if (!config || !config.isEnabled || !config.backendSecretKey) continue;

        try {
            const kp = Keypair.fromSecret(config.backendSecretKey);
            const server = new Horizon.Server(config.networkUrl);

            // 1. Fetch payments since the last time we checked
            let paymentCall = server.payments().forAccount(kp.publicKey()).limit(50);
            if (config.lastCursor) {
                paymentCall = paymentCall.cursor(config.lastCursor);
            }

            const response = await paymentCall.call();
            const records = response.records;

            if (records.length === 0) continue; // No new payments

            // 2. Process new payments
            let latestCursor = config.lastCursor || "";
            const isTestnet = config.networkUrl.includes("testnet");
            const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

            const account = await server.loadAccount(kp.publicKey());
            let txBuilder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase });
            let opsAdded = 0;

            for (const payment of records) {
                latestCursor = payment.paging_token;

                if (payment.type !== "payment") continue;

                const isNative = (payment as any).asset_type === "native" && config.targetAsset === "XLM";
                const isAssetMatch = (payment as any).asset_code === config.targetAsset;

                // If money arrived IN our wallet
                if ((isNative || isAssetMatch) && (payment as any).to === kp.publicKey()) {
                    const amount = parseFloat((payment as any).amount);
                    const deduction = amount * (config.deductionPercentage / 100);

                    if (deduction > 0) {
                        // Calculate Time Lock
                        const unlockDate = new Date();
                        unlockDate.setDate(unlockDate.getDate() + config.lockDurationDays);
                        const unlockUnixSeconds = Math.floor(unlockDate.getTime() / 1000).toString();

                        const strictTimePredicate = Claimant.predicateNot(
                            Claimant.predicateBeforeAbsoluteTime(unlockUnixSeconds)
                        );

                        // Determine Asset Object
                        let assetObj = Asset.native();
                        if (config.targetAsset !== "XLM") {
                            // Replace with your actual issuer logic if needed
                            assetObj = new Asset(config.targetAsset, "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
                        }

                        // Add lock operation to the batch
                        txBuilder.addOperation(Operation.createClaimableBalance({
                            asset: assetObj,
                            amount: deduction.toFixed(7),
                            claimants: [new Claimant(kp.publicKey(), strictTimePredicate)]
                        }));
                        opsAdded++;
                    }
                }
            }

            // 3. If we calculated deductions, sign and submit to the blockchain
            if (opsAdded > 0) {
                const transaction = txBuilder.setTimeout(30).build();
                transaction.sign(kp);
                await server.submitTransaction(transaction);
                console.log(`Successfully auto-vaulted funds for merchant: ${doc.id}`);
            }

            // 4. Save the cursor so we don't process these payments again
            await db.collection("merchants").doc(doc.id).update({
                "vaultConfig.lastCursor": latestCursor
            });

        } catch (error) {
            console.error(`Vault Engine Error for ${doc.id}:`, error);
        }
    }
});