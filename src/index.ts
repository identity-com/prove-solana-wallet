import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  checkRecentBlock,
  checkSignatures,
  checkTransactionNotBroadcast,
  checkTransactionParameters,
  Config,
  DEFAULT_CONFIG,
  defaultSigner,
  getClusterUrl,
  isKeypair,
  makeTransaction,
  pubkeyOf,
  SignCallback,
} from './utilities';
import nacl from 'tweetnacl';

export { SignCallback, Config, DEFAULT_CONFIG } from './utilities';

export type SignMessageFn = (message: string) => Promise<Uint8Array>;

export const create = async (
  signMessage: SignMessageFn,
  message: string
): Promise<string> => {
  const signature = await signMessage(message);
  if (!signature) throw new Error('Error creating signature');

  const signatureB64 = Buffer.from(signature).toString('base64');
  return `${signatureB64}`;
};

export const verify = (
  publicKey: PublicKey,
  signature: string,
  message: string
): boolean => {
  const decodedSignature = Buffer.from(signature, 'base64');
  const decodedMessage = Buffer.from(message);
  const verified = nacl.sign.detached.verify(
    decodedMessage,
    decodedSignature,
    publicKey.toBytes()
  );
  if (!verified) {
    throw new Error('Invalid proof');
  }

  return true;
};

export const proveTransaction = async (
  key: PublicKey | Keypair,
  signer?: SignCallback,
  config: Config = DEFAULT_CONFIG
): Promise<Buffer> => {
  if (isKeypair(key) && signer)
    throw new Error('Provide a keypair or a signer, not both');
  if (!isKeypair(key) && !signer)
    throw new Error('Provide either a keypair or a signer');
  const sign = signer || defaultSigner(key as Keypair);

  const connection =
    config.connection ||
    new Connection(getClusterUrl(config), config.commitment);

  const publicKey = pubkeyOf(key);

  const transaction = await makeTransaction(
    connection,
    publicKey,
    publicKey,
    0
  );
  const signedTransaction = await sign(transaction);
  return signedTransaction.serialize();
};

export const verifyStatic = (evidence: Buffer, publicKey: PublicKey): void => {
  const transaction = Transaction.from(evidence);

  checkSignatures(transaction, publicKey);
  checkTransactionParameters(transaction);
};

export const verifyTransaction = async (
  evidence: Buffer,
  publicKey: PublicKey,
  config: Config = DEFAULT_CONFIG
): Promise<void> => {
  verifyStatic(evidence, publicKey);

  const transaction = Transaction.from(evidence);

  const connection =
    config.connection ||
    new Connection(getClusterUrl(config), config.commitment);

  const checkTransactionNotBroadcastPromise = config.broadcastCheck
    ? checkTransactionNotBroadcast(connection, transaction)
    : Promise.resolve();

  const checkBlockPromise = config.recentBlockCheck
    ? checkRecentBlock(connection, transaction)
    : Promise.resolve();

  await Promise.all([checkTransactionNotBroadcastPromise, checkBlockPromise]);
};
