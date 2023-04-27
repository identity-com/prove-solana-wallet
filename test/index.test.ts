import {
  proveTransaction,
  verifyTransaction,
  create,
  verify,
  SignMessageFn,
} from '../src';
import {
  Transaction,
  Connection,
  clusterApiUrl,
  PublicKey,
  Keypair,
} from '@solana/web3.js';
import { Config, DEFAULT_CONFIG, makeTransaction } from '../src/utilities';
import * as nacl from 'tweetnacl';

describe('prove-solana-wallet', () => {
  afterEach(() => jest.restoreAllMocks());

  let myKeypair: Keypair;

  const connection = new Connection(
    clusterApiUrl('devnet'),
    DEFAULT_CONFIG.commitment
  );

  let signMessageFn: SignMessageFn;
  let message: string;
  beforeEach(() => {
    myKeypair = Keypair.generate();
    signMessageFn = (message: string) =>
      Promise.resolve(
        nacl.sign.detached(Buffer.from(message), myKeypair.secretKey)
      );
    DEFAULT_CONFIG.cluster = 'devnet';
    message = new Date().getTime().toString();
  });
  describe('create and verify', () => {
    it('creates a wallet ownership proof when a signer function is provided', async () => {
      const proof = await create(signMessageFn, message);
      expect(proof).toMatch(/.*\..*/); // the message is a base64 version of the signature concatenated with the message
    });

    it('verifies wallet ownership with provided signer function', async () => {
      myKeypair = Keypair.generate();
      signMessageFn = (message: string) =>
        Promise.resolve(
          nacl.sign.detached(Buffer.from(message), myKeypair.secretKey)
        );
      const proof = await create(signMessageFn, message);
      await expect(verify(myKeypair.publicKey, proof)).resolves.not.toThrow();
    });

    it('throws an error if the transaction is signed with a different key', async () => {
      const someOtherKey = Keypair.generate();

      const proof = await create(
        (message: string) =>
          Promise.resolve(
            nacl.sign.detached(Buffer.from(message), someOtherKey.secretKey)
          ),
        message
      );
      await expect(verify(myKeypair.publicKey, proof)).rejects.toThrow();
    });
  });

  describe('proveTransaction and verifyTransaction', () => {
    it('verifies wallet ownership with provided key', async () => {
      const proof = await proveTransaction(myKeypair);
      await expect(
        verifyTransaction(proof, myKeypair.publicKey)
      ).resolves.not.toThrow();
    });

    it('prove ownership of an external wallet', async () => {
      const externalWalletSignCallback = async (transaction: Transaction) => {
        transaction.sign(myKeypair);
        return transaction;
      };

      const proof = await proveTransaction(
        myKeypair.publicKey,
        externalWalletSignCallback
      );
      await expect(
        verifyTransaction(proof, myKeypair.publicKey)
      ).resolves.not.toThrow();
    });

    it('supports using a non-standard cluster url', async () => {
      const config: Config = {
        cluster: 'mynet',
        commitment: 'confirmed',
        supportedClusterUrls: {
          // in this test, "mynet" is basically an alias for devnet, but it could be any cluster
          mynet: 'https://api.devnet.solana.com/',
        },
        recentBlockCheck: true,
        broadcastCheck: true,
      };
      const proof = await proveTransaction(myKeypair, undefined, config);
      await expect(
        verifyTransaction(proof, myKeypair.publicKey, config)
      ).resolves.not.toThrow();
    });

    it('uses a passed-in-connection', async () => {
      const config: Config = {
        cluster: 'devnet',
        commitment: 'confirmed',
        connection: new Connection(clusterApiUrl('devnet'), 'confirmed'),
        recentBlockCheck: true,
        broadcastCheck: true,
      };
      const proof = await proveTransaction(myKeypair, undefined, config);
      await expect(
        verifyTransaction(proof, myKeypair.publicKey, config)
      ).resolves.not.toThrow();
    });

    it('throws an error if the transaction is signed with a different key', async () => {
      const someOtherKey = Keypair.generate().publicKey;

      const proof = await proveTransaction(myKeypair);
      await expect(verifyTransaction(proof, someOtherKey)).rejects.toThrow();
    });

    it('throws an error if the transaction is too old', async () => {
      // A blockhash on mainnet from july 2021 (epoch 206)
      const oldBlockhash = 'HsH8JCpHtNwo9LgMZcxA8g7DGQu7HQDcDGcCvJSM9iZZ';

      jest
        .spyOn(Connection.prototype, 'getLatestBlockhash')
        .mockImplementation(() =>
          Promise.resolve({
            blockhash: oldBlockhash,
            lastValidBlockHeight: 12345,
          })
        );

      const proof = await proveTransaction(myKeypair);
      await expect(
        verifyTransaction(proof, myKeypair.publicKey)
      ).rejects.toThrow('Block was not found');
    });

    it('allows an old transaction if recentBlockCheck is disabled', async () => {
      // A blockhash on mainnet from july 2021 (epoch 206)
      const oldBlockhash = 'HsH8JCpHtNwo9LgMZcxA8g7DGQu7HQDcDGcCvJSM9iZZ';

      const config = {
        ...DEFAULT_CONFIG,
        recentBlockCheck: false,
      };

      jest
        .spyOn(Connection.prototype, 'getRecentBlockhash')
        .mockImplementation(() =>
          Promise.resolve({
            blockhash: oldBlockhash,
            feeCalculator: { lamportsPerSignature: 0 },
          })
        );

      const proof = await proveTransaction(myKeypair);
      await expect(
        verifyTransaction(proof, myKeypair.publicKey, config)
      ).resolves.not.toThrow();
    });

    it('throws an error if the transaction amout is non-zero', async () => {
      const amount = 100;
      const transaction = await makeTransaction(
        connection,
        myKeypair.publicKey,
        myKeypair.publicKey,
        amount
      );
      transaction.sign(myKeypair);

      const proof = transaction.serialize();

      await expect(
        verifyTransaction(proof, myKeypair.publicKey)
      ).rejects.toThrow('The transaction must have zero value');
    });

    it('throws an error if the transaction is not self-signed', async () => {
      const someOtherKey = Keypair.generate().publicKey;
      const transaction = await makeTransaction(
        connection,
        myKeypair.publicKey,
        someOtherKey,
        0
      );
      transaction.sign(myKeypair);

      const proof = transaction.serialize();

      await expect(
        verifyTransaction(proof, myKeypair.publicKey)
      ).rejects.toThrow('The transaction must be self-to-self');
    });

    // Skip to avoid rate-limiting on mainnet - TODO switch this one to devnet
    it.skip('throws an error if the transaction was broadcast', async () => {
      // this is a self-to-self transaction broadcast to mainnet in july 2021
      const transactionPublicKey = new PublicKey(
        '2B64EYBMqrPTHyqXWYeJYT4QmqVgwc4vQ7qbLrBJ6J6n'
      );
      const transaction =
        'AfqmAU243f1RyJUeSCu9wNNivwAiO8QNmVKDA8biALn8CBCb6jFNT4WKvgtzl7kRnATr27lTEQNdmAQZVOm5BwkBAAECEXE2KXQBAW2MC9Y8dPoDnheiXINczzUNFGfMaNC79YsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADtvR4/w2jei6eOB72wd18W6ofvsMpMoGXvCZP0yP1g1AQECAAAMAgAAAAAAAAAAAAAA';
      const proof = Buffer.from(transaction, 'base64');

      // stub out the recent blockhash check with a valid recent blockhash
      jest
        .spyOn(Connection.prototype, 'getFeeCalculatorForBlockhash')
        .mockImplementation(() =>
          Promise.resolve({
            value: { lamportsPerSignature: 0 },
            context: { slot: 0 },
          })
        );

      await expect(
        verifyTransaction(proof, transactionPublicKey)
      ).rejects.toThrow('Transaction was broadcast!');
    });

    it('allows a broadcast transaction if broadcastCheck is disabled', async () => {
      // this is a self-to-self transaction broadcast to mainnet in july 2021
      const transactionPublicKey = new PublicKey(
        '2B64EYBMqrPTHyqXWYeJYT4QmqVgwc4vQ7qbLrBJ6J6n'
      );
      const transaction =
        'AfqmAU243f1RyJUeSCu9wNNivwAiO8QNmVKDA8biALn8CBCb6jFNT4WKvgtzl7kRnATr27lTEQNdmAQZVOm5BwkBAAECEXE2KXQBAW2MC9Y8dPoDnheiXINczzUNFGfMaNC79YsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADtvR4/w2jei6eOB72wd18W6ofvsMpMoGXvCZP0yP1g1AQECAAAMAgAAAAAAAAAAAAAA';
      const proof = Buffer.from(transaction, 'base64');

      const config = {
        ...DEFAULT_CONFIG,
        broadcastCheck: false,
        recentBlockCheck: false,
      };
      await expect(
        verifyTransaction(proof, transactionPublicKey, config)
      ).resolves.not.toThrow();
    });
  });
});
