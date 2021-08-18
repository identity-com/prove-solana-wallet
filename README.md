# Prove-Solana-Wallet

This library proves ownership of a [Solana](https://solana.com) wallet to off-chain verifiers.

It is compatible with standard browser wallet adapters, such as 
[sol-wallet-adapter](https://github.com/project-serum/sol-wallet-adapter), 
and can be extended to others.

## Install

```sh
npm install @identity.com/prove-solana-wallet
```

or 

```sh
yarn add @identity.com/prove-solana-wallet
```

## Usage

Prove ownership of a keypair

Prover side: 
```js
const {prove} = require('@identity.com/prove-solana-wallet');
const proof = await prove(myKeypair);
```

Verifier side:
```js
const {verify} = require('@identity.com/prove-solana-wallet');
await verify(proof, expectedPublicKey);
```

Prove ownership of an external wallet (e.g. sol-wallet-adapter).
See [here](https://github.com/project-serum/sol-wallet-adapter) for more details.

Prover side:
```js
const {prove} = require('@identity.com/prove-solana-wallet');
import Wallet from "@project-serum/sol-wallet-adapter";

const providerUrl = 'https://www.sollet.io';
const wallet = new Wallet(providerUrl);
wallet.on('connect', async (publicKey) => {
  // once the wallet is connected, we can prove ownership
  const signer = (transaction:Transaction) => wallet.signTransaction(transaction);

  const proof = await prove(myKeypair);
});
```

Verifier side:
```js
const {verify} = require('@identity.com/prove-solana-wallet');
await verify(proof, expectedPublicKey);
```

## Details

The prove() function generates a zero-value transaction, and
signs it with the wallet private key. For the transaction to be verified
by the verify() function, it must:

- have ony one instruction: SystemProgram.transfer
- be zero-value
- be self-to-self (i.e the sender and recipient are the same)
- have a recent blockhash on mainnet
- but not be broadcast to mainnet

These measures increase the security by reducing the likelihood
that an attacker can either coerce the wallet owner to sign
a transaction or intercept a broadcast one.

## Configuration

The prove and verify functions can be configured as follows:

### `cluster`

Default: `mainnet-beta`

The cluster that should be used when generating and verifying proofs

### `commitment`

Default: `confirmed`

When checking that a proof transaction has not been transmitted, the commitment to be used, i.e. the degree to which the transaction is finalised by the network

### `supportedClusterUrls`

Optional
Default: empty

If the cluster is not a standard solana public cluster, this map provides
the cluster URL to connect to. Use this when the proof may contain a cluster that is
not recognised by solana's clusterApiUrl function.
