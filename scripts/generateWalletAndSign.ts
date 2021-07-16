import { Keypair } from '@solana/web3.js';
import {prove} from '../src'

const keypair = Keypair.generate();
(async () => {
  const proof = await prove(keypair)

  console.log("Wallet: " + keypair.publicKey.toBase58());
  console.log("Proof: " + proof.toString('base64'));
})();
