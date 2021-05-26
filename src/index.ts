import {
  Cluster,
  clusterApiUrl,
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

export type SignCallback = (transaction: Transaction) => Promise<Transaction>;
const defaultSigner = (keypair: Keypair): SignCallback => async (
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

type Config = {
  cluster: Cluster;
  commitment: Commitment;
};
const DEFAULT_CONFIG: Config = {
  cluster: 'mainnet-beta',
  commitment: 'confirmed',
};
export const prove = async (
  key: PublicKey | Keypair,
  signer?: SignCallback,
  config: Config = DEFAULT_CONFIG
): Promise<Buffer> => {
  if (isKeypair(key) && signer)
    throw new Error('Provide a keypair or a signer, not both');
  if (!isKeypair(key) && !signer)
    throw new Error('Provide either a keypair or a signer');
  const sign = signer || defaultSigner(key as Keypair);

  const connection = new Connection(
    clusterApiUrl(config.cluster),
    config.commitment
  );

  const publicKey = pubkeyOf(key);

  // any instruction that requires a signature
  const instruction = SystemProgram.transfer({
    fromPubkey: publicKey,
    lamports: 0,
    toPubkey: publicKey,
  });

  const { blockhash } = await connection.getRecentBlockhash();
  const transaction = new Transaction({
    recentBlockhash: blockhash,
  }).add(instruction);
  const signedTransaction = await sign(transaction);
  return signedTransaction.serialize();
};

export const verify = (evidence: Buffer, publicKey: PublicKey): void => {
  const transaction = Transaction.from(evidence);
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
