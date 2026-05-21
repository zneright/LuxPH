import {
    Horizon,
    rpc,
    TransactionBuilder,
    Operation,
    Account,
    xdr,
    Address
} from "@stellar/stellar-sdk";

export type SorobanFunctionArg = string | number | boolean | bigint | xdr.ScVal;

const isAddressString = (value: string) => {
    try {
        Address.fromString(value);
        return true;
    } catch {
        return false;
    }
};

const toScVal = (value: SorobanFunctionArg): xdr.ScVal => {
    if (typeof value === "boolean") {
        return xdr.ScVal.scvBool(value);
    }

    if (typeof value === "number" || typeof value === "bigint") {
        const stringValue = value.toString();
        const isNegative = stringValue.startsWith("-");

        if (typeof value === "number" && !Number.isInteger(value)) {
            return xdr.ScVal.scvString(stringValue);
        }

        if (typeof value === "bigint" || isNegative) {
            return xdr.ScVal.scvI128(stringValue);
        }

        const parsedNumber = Number(stringValue);
        if (!Number.isNaN(parsedNumber) && Number.isSafeInteger(parsedNumber)) {
            return xdr.ScVal.scvU64(stringValue);
        }

        return xdr.ScVal.scvU128(stringValue);
    }

    if (typeof value === "string") {
        if (isAddressString(value)) {
            return Address.fromString(value).toScVal();
        }

        return xdr.ScVal.scvString(value);
    }

    if (value && typeof value === "object" && typeof (value as any).toScVal === "function") {
        return (value as any).toScVal();
    }

    return xdr.ScVal.scvString(String(value));
};

export interface SorobanInvokeOptions {
    sourcePublicKey: string;
    contractId: string;
    functionName: string;
    functionArgs?: SorobanFunctionArg[];
    horizonUrl: string;
    sorobanRpcUrl: string;
    networkPassphrase: string;
    walletSign: (xdr: string, networkPassphrase: string) => Promise<string>;
    fee?: string;
    timeout?: number;
}

export async function buildSorobanContractInvocationTransaction(options: {
    sourcePublicKey: string;
    contractId: string;
    functionName: string;
    functionArgs?: SorobanFunctionArg[];
    horizonUrl: string;
    networkPassphrase: string;
    fee?: string;
    timeout?: number;
}) {
    const horizonServer = new Horizon.Server(options.horizonUrl);

    const sourceAccountResponse = await horizonServer.loadAccount(options.sourcePublicKey);
    const account = new Account(options.sourcePublicKey, sourceAccountResponse.sequence);

    const tx = new TransactionBuilder(account, {
        fee: options.fee ?? "100",
        networkPassphrase: options.networkPassphrase,
    })
        .addOperation(
            Operation.invokeContractFunction({
                contract: options.contractId,
                function: options.functionName,
                args: (options.functionArgs || []).map(toScVal),
            })
        )
        .setTimeout(options.timeout ?? 300)
        .build();

    return tx;
}

export async function prepareSorobanTransaction(transaction: any, sorobanRpcUrl: string) {
    const sorobanServer = new rpc.Server(sorobanRpcUrl);
    const preparedTransaction = await sorobanServer.prepareTransaction(transaction);

    // Safety check: Prevent passing failed simulations to the wallet
    if ((preparedTransaction as any).error) {
        throw new Error(`Soroban simulation failed: ${(preparedTransaction as any).error}`);
    }

    return preparedTransaction;
}

export async function parseSignedTransaction(signedXdr: string, networkPassphrase: string) {
    return TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
}

export async function submitSorobanTransaction(signedTransaction: any, sorobanRpcUrl: string) {
    const sorobanServer = new rpc.Server(sorobanRpcUrl);
    return await sorobanServer.sendTransaction(signedTransaction);
}

export async function invokeSorobanContract(options: SorobanInvokeOptions) {
    const transaction = await buildSorobanContractInvocationTransaction({
        sourcePublicKey: options.sourcePublicKey,
        contractId: options.contractId,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        horizonUrl: options.horizonUrl,
        networkPassphrase: options.networkPassphrase,
        fee: options.fee,
        timeout: options.timeout,
    });

    const preparedTransaction = await prepareSorobanTransaction(transaction, options.sorobanRpcUrl);
    const xdrEnvelope = preparedTransaction.toEnvelope().toXDR("base64");
    const signedXdr = await options.walletSign(xdrEnvelope, options.networkPassphrase);
    const signedTransaction = await parseSignedTransaction(signedXdr, options.networkPassphrase);

    return submitSorobanTransaction(signedTransaction, options.sorobanRpcUrl);
}