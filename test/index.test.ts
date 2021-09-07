import { prove, verify } from '../src';
import {
  Keypair,
  Transaction,
  Connection,
  clusterApiUrl,
  PublicKey,
  Cluster,
} from '@solana/web3.js';
import { Config, DEFAULT_CONFIG, makeTransaction } from '../src/utilities';

describe('prove-solana-wallet', () => {
  afterEach(() => jest.restoreAllMocks());

  let myKeypair: Keypair;

  const connection = new Connection(
    clusterApiUrl(DEFAULT_CONFIG.cluster as Cluster),
    DEFAULT_CONFIG.commitment
  );

  beforeEach(() => {
    myKeypair = Keypair.generate();
  });

  it('verifies wallet ownership with provided key', async () => {
    const proof = await prove(myKeypair);
    await expect(verify(proof, myKeypair.publicKey)).resolves.not.toThrow();
  });

  it('proves ownership of an external wallet', async () => {
    const externalWalletSignCallback = async (transaction: Transaction) => {
      transaction.sign(myKeypair);
      return transaction;
    };

    const proof = await prove(myKeypair.publicKey, externalWalletSignCallback);
    await expect(verify(proof, myKeypair.publicKey)).resolves.not.toThrow();
  });

  it('supports using a non-standard cluster url', async () => {
    const config: Config = {
      cluster: 'mynet',
      commitment: 'confirmed',
      supportedClusterUrls: {
        // in this test, "mynet" is basically an alias for mainnet, but it could be any cluster
        mynet: 'https://api.mainnet-beta.solana.com/',
      },
      recentBlockCheck: true,
    };
    const proof = await prove(myKeypair, undefined, config);
    await expect(
      verify(proof, myKeypair.publicKey, config)
    ).resolves.not.toThrow();
  });

  it('throws an error if the transaction is signed with a different key', async () => {
    const someOtherKey = Keypair.generate().publicKey;

    const proof = await prove(myKeypair);
    await expect(verify(proof, someOtherKey)).rejects.toThrow();
  });

  it('throws an error if the transaction is too old', async () => {
    // A blockhash on mainnet from july 2021 (epoch 206)
    const oldBlockhash = 'HsH8JCpHtNwo9LgMZcxA8g7DGQu7HQDcDGcCvJSM9iZZ';

    jest
      .spyOn(Connection.prototype, 'getRecentBlockhash')
      .mockImplementation(() =>
        Promise.resolve({
          blockhash: oldBlockhash,
          feeCalculator: { lamportsPerSignature: 0 },
        })
      );

    const proof = await prove(myKeypair);
    await expect(verify(proof, myKeypair.publicKey)).rejects.toThrow(
      'Block was not found'
    );
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

    const proof = await prove(myKeypair);
    await expect(
      verify(proof, myKeypair.publicKey, config)
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

    await expect(verify(proof, myKeypair.publicKey)).rejects.toThrow(
      'The transaction must have zero value'
    );
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

    await expect(verify(proof, myKeypair.publicKey)).rejects.toThrow(
      'The transaction must be self-to-self'
    );
  });

  it('throws an error if the transaction was broadcast', async () => {
    // this is a self-to-self transaction broadcast to mainnet in july 2021
    const transactionPublicKey = new PublicKey(
      '2B64EYBMqrPTHyqXWYeJYT4QmqVgwc4vQ7qbLrBJ6J6n'
    );
    const transactionSignature =
      '61eu2kkizCGrDDVwWoG7tijS6ZSzZeyqxQvfhog3TqfptHV4GhV92wEtiNtuFKJNPgsRjLXa8HejfDPVMgK4Jqig';
    const transaction = await connection
      .getConfirmedTransaction(transactionSignature)
      .then(response => response!.transaction);

    const proof = transaction.serialize();

    // stub out the recent blockhash check with a valid recent blockhash
    jest
      .spyOn(Connection.prototype, 'getFeeCalculatorForBlockhash')
      .mockImplementation(() =>
        Promise.resolve({
          value: { lamportsPerSignature: 0 },
          context: { slot: 0 },
        })
      );

    await expect(verify(proof, transactionPublicKey)).rejects.toThrow(
      'Transaction was broadcast!'
    );
  });
});
