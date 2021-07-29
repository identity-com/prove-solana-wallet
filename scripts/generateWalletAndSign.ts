import { Keypair } from '@solana/web3.js';
import {prove, verify} from '../src'

const keypair = Keypair.generate();

(async () => {
  const proof = await prove(keypair)

  console.log("Wallet: " + keypair.publicKey.toBase58());
  console.log("Proof: " + proof.toString('base64'));

  const verified = await verify(proof, keypair.publicKey).then(() => true);
  console.log("Verified: " + verified)
})();
