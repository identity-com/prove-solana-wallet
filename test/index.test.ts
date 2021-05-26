import { prove, verify } from '../src';
import { Keypair, Transaction } from '@solana/web3.js';

describe('prove-solana-wallet', () => {
  it('verifies wallet ownership with provided key', async () => {
    const myKeypair = Keypair.generate();

    const proof = await prove(myKeypair);
    expect(() => verify(proof, myKeypair.publicKey)).not.toThrow();
  });

  it('proves ownership of an external wallet', async () => {
    const myKeypair = Keypair.generate();
    const externalWalletSignCallback = async (transaction: Transaction) => {
      transaction.sign(myKeypair);
      return transaction;
    };

    const proof = await prove(myKeypair.publicKey, externalWalletSignCallback);
    expect(() => verify(proof, myKeypair.publicKey)).not.toThrow();
  });

  it('throws an error if the transaction is signed with a different key', async () => {
    const myKeypair = Keypair.generate();
    const someOtherKey = Keypair.generate().publicKey;

    const proof = await prove(myKeypair);
    expect(() => verify(proof, someOtherKey)).toThrow();
  });
});
