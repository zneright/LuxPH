const admin = require("firebase-admin");
const { Horizon, Keypair, Asset, Operation, Claimant, TransactionBuilder, Networks, BASE_FEE } = require("@stellar/stellar-sdk");

// 1. Authenticate with Firebase using GitHub Secrets
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    console.error("Failed to parse Firebase credentials. Is the FIREBASE_SERVICE_ACCOUNT secret set?");
    process.exit(1);
}

const db = admin.firestore();

async function runEngine() {
    console.log("Starting Contingency Vault Engine...");
    const merchantsSnapshot = await db.collection("merchants").where("vaultConfig.isEnabled", "==", true).get();

    if (merchantsSnapshot.empty) {
        console.log("No active vaults found. Exiting.");
        return;
    }

    for (const doc of merchantsSnapshot.docs) {
        const data = doc.data();
        const config = data.vaultConfig;
        const secretKey = data.encryptedSecretKey;

        if (!secretKey) continue;

        try {
            const kp = Keypair.fromSecret(secretKey);
            const server = new Horizon.Server(config.networkUrl);

            const lastCursor = data.lastProcessedCursor || "now";
            const payments = await server.payments().forAccount(kp.publicKey()).cursor(lastCursor).order("asc").limit(50).call();

            let latestCursor = lastCursor;
            let processedCount = 0;

            for (const payment of payments.records) {
                latestCursor = payment.paging_token;

                // --- NEW: Correctly identify Native XLM vs Custom Assets ---
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

                        // --- NEW: Construct the correct Stellar Asset Object ---
                        let assetToLock;
                        if (config.targetAsset === "XLM") {
                            assetToLock = Asset.native();
                        } else {
                            assetToLock = new Asset(config.targetAsset, payment.asset_issuer);
                        }

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

                        // Write Telemetry
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

            // Execute the script
            runEngine()
                .then(() => {
                    console.log("Engine run complete.");
                    process.exit(0);
                })
                .catch((error) => {
                    console.error("Critical Engine Failure:", error);
                    process.exit(1);
                });