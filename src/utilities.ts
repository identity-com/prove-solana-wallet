import {
  Cluster,
  clusterApiUrl,
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
  TransactionResponse,
} from '@solana/web3.js';
import { encode } from 'bs58';

export type SignCallback = (transaction: Transaction) => Promise<Transaction>;
export const defaultSigner = (keypair: Keypair): SignCallback => async (
  transaction: Transaction
) => {
  transaction.sign(keypair);
  return transaction;
};

type KeyMaterial = Keypair | PublicKey;
export const isKeypair = (k: KeyMaterial): k is Keypair =>
  k.constructor.name === 'Keypair';
export const pubkeyOf = (k: KeyMaterial): PublicKey =>
  isKeypair(k) ? k.publicKey : k;

export type ClusterUrlMap = Record<string, string>;

export type Config = {
  // the cluster that should be used when generating and verifying proofs
  cluster: string;
  // when checking that a proof transaction has not been transmitted, the commitment
  // to be used, i.e. the degree to which the transaction is finalised by the network
  commitment: Commitment;
  // if the cluster is not a standard solana public cluster, this map provides
  // the cluster URL to connect to. Use this when the proof may contain a cluster that is
  // not recognised by solana's clusterApiUrl function
  supportedClusterUrls?: ClusterUrlMap;
  // If true, check that the transaction includes a recent blockhash.
  // Disable if nodes are having difficulty synchronising,
  // warning - this makes replay attacks easier as proofs remain valid longer
  recentBlockCheck: boolean;
  /// If set, use this connection rather than creating a new one - ignores cluster, commitment, supportedClusterUrls
  connection?: Connection;
};

export const DEFAULT_CONFIG: Config = {
  cluster: 'mainnet-beta',
  commitment: 'confirmed',
  supportedClusterUrls: {},
  recentBlockCheck: true,
};

// get the solana cluster URL to connect to. Use the cluster in the config,
// unless overridden. If the cluster is referenced in supportedClusterUrls,
// use the clusterUrl specified there, otherwise use the default solana one
export const getClusterUrl = (config: Config) => {
  if (
    config.supportedClusterUrls &&
    config.supportedClusterUrls[config.cluster]
  ) {
    return config.supportedClusterUrls[config.cluster];
  }
  return clusterApiUrl(config.cluster as Cluster);
};

export const makeTransaction = async (
  connection: Connection,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amount: number
): Promise<Transaction> => {
  const instruction = SystemProgram.transfer({
    fromPubkey,
    lamports: amount,
    toPubkey,
  });

  const { blockhash } = await connection.getRecentBlockhash();
  return new Transaction({
    recentBlockhash: blockhash,
    feePayer: fromPubkey,
  }).add(instruction);
};

const findBlock = async (
  connection: Connection,
  blockhash: string
): Promise<void> =>
  connection
    .getFeeCalculatorForBlockhash(blockhash, 'confirmed')
    .then(result => {
      if (!result.value) throw new Error('Block was not found');
      // if we were interested in the age of the block,
      // we could check the value of result.context.slot here and use getBlock() to look it up
    });

export const checkRecentBlock = async (
  connection: Connection,
  transaction: Transaction
): Promise<void> => {
  if (!transaction.recentBlockhash)
    throw new Error('Transaction has no recent blockhash!');
  await findBlock(connection, transaction.recentBlockhash);
};

const findTransaction = async (
  connection: Connection,
  transaction: Transaction
): Promise<TransactionResponse | null> => {
  if (!transaction.signature) {
    throw new Error('Transaction has no signature');
  }
  const txSig = encode(transaction.signature);
  return connection.getTransaction(txSig);
};

export const checkTransactionNotBroadcast = async (
  connection: Connection,
  transaction: Transaction
): Promise<void> =>
  findTransaction(connection, transaction).then(result => {
    if (result) throw new Error('Transaction was broadcast!');
  });

export const checkTransactionParameters = (transaction: Transaction) => {
  if (transaction.instructions.length !== 1)
    throw new Error(
      'Incorrect instruction count. The transaction must contain only one Transfer instruction'
    );

  const [instruction] = transaction.instructions;

  let transferParams;
  try {
    transferParams = SystemInstruction.decodeTransfer(instruction);
  } catch (error) {
    console.log(error);
    throw new Error(
      'Invalid instruction. The transaction must contain a Transfer instruction'
    );
  }

  if (!transferParams.fromPubkey.equals(transferParams.toPubkey))
    throw new Error('The transaction must be self-to-self');
  if (transferParams.lamports !== 0)
    throw new Error('The transaction must have zero value');
};

export const checkSignatures = (
  transaction: Transaction,
  publicKey: PublicKey
) => {
  if (!transaction.verifySignatures()) {
    // some expected signature is missing
    throw new Error('Signatures not verified');
  }
  const signatureForExpectedKey = transaction.signatures.find(
    signaturePubkeyPair => signaturePubkeyPair.publicKey.equals(publicKey)
  );
  if (!signatureForExpectedKey) {
    throw new Error('Missing signature for ' + publicKey.toBase58());
  }
};
