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
verify(proof, expectedPublicKey);
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
verify(proof, expectedPublicKey);
```
