import { Server as SorobanServer, TransactionBuilder, Operation, Account, xdr } from "soroban-client";
import { Server as HorizonServer } from "@stellar/stellar-sdk";

export type SorobanFunctionArg = string | number | boolean;

const toScVal = (value: SorobanFunctionArg): xdr.ScVal => {
  if (typeof value === "boolean") {
    return xdr.ScVal.scvBool(value);
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? xdr.ScVal.scvI64(value)
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
  const horizonServer = new HorizonServer(options.horizonUrl);
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

export async function prepareSorobanTransaction(transaction: ReturnType<typeof TransactionBuilder.prototype.build>, sorobanRpcUrl: string, networkPassphrase: string) {
  const sorobanServer = new SorobanServer(sorobanRpcUrl);
  return sorobanServer.prepareTransaction(transaction, networkPassphrase);
}

export async function parseSignedTransaction(signedXdr: string, networkPassphrase: string) {
  return TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
}

export async function submitSorobanTransaction(signedTransaction: ReturnType<typeof TransactionBuilder.fromXDR>, sorobanRpcUrl: string) {
  const sorobanServer = new SorobanServer(sorobanRpcUrl);
  return sorobanServer.sendTransaction(signedTransaction as any);
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

  const preparedTransaction = await prepareSorobanTransaction(transaction, options.sorobanRpcUrl, options.networkPassphrase);
  const xdrEnvelope = preparedTransaction.toEnvelope().toXDR("base64");
  const signedXdr = await options.walletSign(xdrEnvelope, options.networkPassphrase);
  const signedTransaction = await parseSignedTransaction(signedXdr, options.networkPassphrase);
  return submitSorobanTransaction(signedTransaction, options.sorobanRpcUrl);
}
