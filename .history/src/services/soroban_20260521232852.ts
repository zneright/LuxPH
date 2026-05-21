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

const createI128Parts = (value: bigint) => {
    const hiType = xdr.Int128Parts._fields[0][1];
    const loType = xdr.Int128Parts._fields[1][1];
    const low = BigInt.asUintN(64, value);
    const high = value >> 64n;
    return new xdr.Int128Parts({
        hi: new hiType(high),
        lo: new loType(low),
    });
};

const createU128Parts = (value: bigint) => {
    const hiType = xdr.UInt128Parts._fields[0][1];
    const loType = xdr.UInt128Parts._fields[1][1];
    const low = BigInt.asUintN(64, value);
    const high = value >> 64n;
    return new xdr.UInt128Parts({
        hi: new hiType(high),
        lo: new loType(low),
    });
};

const toScVal = (value: SorobanFunctionArg): xdr.ScVal => {
    if (typeof value === "boolean") {
        return xdr.ScVal.scvBool(value);
    }

    if (typeof value === "number") {
        if (!Number.isInteger(value)) {
            return xdr.ScVal.scvString(value.toString());
        }
        if (value < 0) {
            return xdr.ScVal.scvI128(createI128Parts(BigInt(value)));
        }
        return xdr.ScVal.scvU64(new xdr.Uint64(value.toString()));
    }

    if (typeof value === "bigint") {
        if (value < 0) {
            return xdr.ScVal.scvI128(createI128Parts(value));
        }
        const u64Max = 2n ** 64n - 1n;
        if (value <= u64Max) {
            return xdr.ScVal.scvU64(new xdr.Uint64(value.toString()));
        }
        return xdr.ScVal.scvU128(createU128Parts(value));
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