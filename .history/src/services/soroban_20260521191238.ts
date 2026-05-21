import {
    Horizon,
    rpc,
    TransactionBuilder,
    Operation,
    Account,
    xdr
} from "@stellar/stellar-sdk";

export type SorobanFunctionArg = string | number | boolean;

const toScVal = (value: SorobanFunctionArg): xdr.ScVal => {
    if (typeof value === "boolean") {
        return xdr.ScVal.scvBool(value);
    }

    if (typeof value === "number") {
        return Number.isInteger(value)
            ? xdr.ScVal.scvI64(xdr.Int64.fromString(value.toString()))
            : xdr.ScVal.scvString(value.toString());
    }

    return xdr.ScVal.scvString(value);
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
    // FIX 1: Use options.horizonUrl (it was previously undefined in this scope)
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

// FIX 2: Use the standard rpc.Server from stellar-sdk instead of soroban-client
export async function prepareSorobanTransaction(transaction: any, sorobanRpcUrl: string) {
    const sorobanServer = new rpc.Server(sorobanRpcUrl);
    return await sorobanServer.prepareTransaction(transaction);
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