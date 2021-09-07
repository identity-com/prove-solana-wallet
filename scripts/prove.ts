import { Keypair } from '@solana/web3.js';
import {Config, prove, verify} from '../src'
import * as fs from "fs";
import * as os from "os";

const keypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, { encoding: 'utf-8'}))));

(async () => {
  const config: Config = {
    cluster: 'mainnet-beta',
    commitment: 'confirmed',
    supportedClusterUrls: {
      'mainnet-beta': 'https://solflarew9wyt3yf6u.main.genesysgo.net:8899/'//https://rough-misty-night.solana-mainnet.quiknode.pro/0e5b8044efa931baf6eb130ff4798fb84af114d3/'
    }
  };
  const proof = await prove(keypair, undefined);

  console.log("Wallet: " + keypair.publicKey.toBase58());
  console.log("Proof: " + proof.toString('base64'));

  const verified = await verify(proof, keypair.publicKey, config).then(() => true);
  console.log("Verified: " + verified)
})();
