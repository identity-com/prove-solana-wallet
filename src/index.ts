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

export { SignCallback, Config, DEFAULT_CONFIG } from './utilities';

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

export const verify = async (
  evidence: Buffer,
  publicKey: PublicKey,
  config: Config = DEFAULT_CONFIG
): Promise<void> => {
  verifyStatic(evidence, publicKey);

  const transaction = Transaction.from(evidence);

  const connection =
    config.connection ||
    new Connection(getClusterUrl(config), config.commitment);

  const checkTransactionNotBroadcastPromise = checkTransactionNotBroadcast(
    connection,
    transaction
  );
  const checkBlockPromise = config.recentBlockCheck
    ? checkRecentBlock(connection, transaction)
    : Promise.resolve();

  await Promise.all([checkTransactionNotBroadcastPromise, checkBlockPromise]);
};
