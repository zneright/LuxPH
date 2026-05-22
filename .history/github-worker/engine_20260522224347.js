const admin = require("firebase-admin");
const { Horizon, Keypair, Asset, Operation, Claimant, TransactionBuilder, Networks, BASE_FEE } = require("@stellar/stellar-sdk");

try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    console.error("Failed to parse Firebase credentials.");
    process.exit(1);
}

const db = admin.firestore();

async function runEngine() {
    console.log("Starting Contingency Vault Engine...");

    // Check if toggle is ON
    const merchantsSnapshot = await db.collection("merchants").where("vaultConfig.isEnabled", "==", true).get();

    if (merchantsSnapshot.empty) {
        console.log("No active vaults found. Make sure the toggle is ON in settings.");
        return;
    }

    for (const doc of merchantsSnapshot.docs) {
        const data = doc.data();
        const config = data.vaultConfig;
        const secretKey = data.encryptedSecretKey;

        if (!secretKey) {
            console.log(`Skipping Merchant ${doc.id}: No secret key saved in database.`);
            continue;
        }

        try {
            const kp = Keypair.fromSecret(secretKey);
            const server = new Horizon.Server(config.networkUrl);

            // --- THE CURSOR FIX ---
            let lastCursor = data.lastProcessedCursor;

            if (!lastCursor || lastCursor === "now") {
                console.log(`Initializing numeric cursor for ${doc.id}...`);
                const latest = await server.payments().forAccount(kp.publicKey()).order("desc").limit(1).call();

                if (latest.records.length > 0) {
                    lastCursor = latest.records[0].paging_token;
                } else {
                    lastCursor = "0";
                }

                // Save the numeric cursor and wait for the NEXT payment
                await doc.ref.update({ lastProcessedCursor: lastCursor });
                console.log(`Cursor initialized to ${lastCursor}. Ready for next payment.`);
                continue;
            }

            // Fetch actual payments using the numeric cursor
            const payments = await server.payments().forAccount(kp.publicKey()).cursor(lastCursor).order("asc").limit(50).call();

            let latestCursor = lastCursor;
            let processedCount = 0;

            for (const payment of payments.records) {
                latestCursor = payment.paging_token;

                const isNative = payment.asset_type === "native" && config.targetAsset === "XLM";
                const isAssetMatch = payment.asset_code === config.targetAsset;

                if (payment.to === kp.publicKey() && (isNative || isAssetMatch)) {
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

                        let assetToLock = config.targetAsset === "XLM"
                            ? Asset.native()
                            : new Asset(config.targetAsset, payment.asset_issuer);

                        const op = Operation.createClaimableBalance({
                            asset: assetToLock,
                            amount: deductionStr,
                            claimants: [new Claimant(kp.publicKey(), timePredicate)]
                        });

                        const networkPassphrase = config.networkUrl.includes("testnet") ? Networks.TESTNET : Networks.PUBLIC;

                        const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
                            .addOperation(op)
                            .setTimeout(30)
                            .build();

                        transaction.sign(kp);
                        await server.submitTransaction(transaction);

                        await db.collection("telemetryLogs").add({
                            merchantId: doc.id,
                            message: `Vault allocation successful! Auto-deducted ${deductionStr} ${config.targetAsset}`,
                            timestamp: admin.firestore.FieldValue.serverTimestamp(),
                            type: "success"
                        });

                        processedCount++;
                    }
                }
            }

            if (latestCursor !== lastCursor) {
                await doc.ref.update({ lastProcessedCursor: latestCursor });
            }

            console.log(`Processed ${processedCount} new deductions for merchant: ${doc.id}`);

        } catch (error) {
            console.error(`Error processing merchant ${doc.id}:`, error.message);
        }
    }
}

runEngine()
    .then(() => process.exit(0))
    .catch((error) => process.exit(1));