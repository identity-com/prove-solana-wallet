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
  SystemProgram,
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
    it('should create a wallet ownership proof encoded in base64 when a signer function is provided', async () => {
      const proof = await create(signMessageFn, message);
      const decodedBuffer = Buffer.from(proof, 'base64');
      expect(decodedBuffer).toBeTruthy();
      expect(typeof proof).toBe('string');
    });

    it('should verify wallet ownership with provided signer function', async () => {
      myKeypair = Keypair.generate();
      signMessageFn = (message: string) =>
        Promise.resolve(
          nacl.sign.detached(Buffer.from(message), myKeypair.secretKey)
        );
      const proof = await create(signMessageFn, message);
      expect(() => verify(myKeypair.publicKey, proof, message)).not.toThrow();
    });

    it('should throw an error if the transaction is signed with a different key', async () => {
      const someOtherKey = Keypair.generate();

      const proof = await create(
        (message: string) =>
          Promise.resolve(
            nacl.sign.detached(Buffer.from(message), someOtherKey.secretKey)
          ),
        message
      );
      expect(() => verify(myKeypair.publicKey, proof, message)).toThrow();
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

    describe('instruction length check', () => {
      it('throws an error if the transaction has extra instructions', async () => {
        const transaction = await makeTransaction(
          connection,
          myKeypair.publicKey,
          myKeypair.publicKey,
          0
        );
        const badInstruction = SystemProgram.transfer({
          fromPubkey: myKeypair.publicKey,
          lamports: 1,
          toPubkey: Keypair.generate().publicKey,
        });
        transaction.add(badInstruction);
        transaction.sign(myKeypair);

        const proof = transaction.serialize();
        await expect(
          verifyTransaction(proof, myKeypair.publicKey)
        ).rejects.toThrow(
          'Incorrect instruction count. The transaction must contain only one Transfer instruction'
        );
      });

      it('does not throw an error if the transaction extra instructions and computeBudget', async () => {
        const transactionPublicKey = new PublicKey(
          '4TTtkisSU2iuVYQuytKzEeZmuY8waZwgaQzLSXpZ5CrJ'
        );
        // this transaction has 3 instructions: one zero-amount transfer, and two 'computeBudget' instructions
        const transaction =
          'Ac826+f6a0l0Kcf2ACbgHHBOIuSmDWJP0c2VEtvmDttZxr7olZ5PAXTRbntBif+cYKMJ8Ugaz2FnGF5pGQrtNwIBAAIDM1qRrNuzTH+w7d2q2O27SdVMzqxO6kqGNLNShtqk0bcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAA40RbTFI3eSz8gWzJ80C8PQgDm5STQxWOOWMdm1ewk9wDAQIAAAwCAAAAAAAAAAAAAAACAAkDQB8AAAAAAAACAAUCQA0DAA==';
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
