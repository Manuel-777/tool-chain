import sha256 from "./sha256";
import { VerifyResult, VerificationData } from "../types/message";

import { ToolDb } from "..";

/**
 * Verifies a message validity (PoW, Address, timestamp, signatures)
 * @param msg AnyMessage
 * @param pow amount of proof of work required, number of leading zeroes (default is 0/no pow)
 * @returns boolean or undefined if the message type does not match
 */
export default async function verifyMessage<T>(
  this: ToolDb,
  msg: Partial<VerificationData<T>>,
  pow = 0
): Promise<VerifyResult> {
  // console.log("verify: ", msg);
  const strData = JSON.stringify(msg.v);

  if (
    msg.t === undefined ||
    msg.k === undefined ||
    msg.h === undefined ||
    msg.a === undefined ||
    msg.s === undefined ||
    msg.c === undefined
  ) {
    return VerifyResult.InvalidData;
  }

  // Max clock shift allowed is 30 seconds.
  // Ten seconds was my original threshold but it failed some times.
  if (msg.t > new Date().getTime() + 30000) {
    // console.warn("Invalid message timestamp.");
    return VerifyResult.InvalidTimestamp;
  }

  // This is a user namespace
  let adressNamespace: false | string = false;
  if (msg.k.slice(0, 1) == ":") {
    adressNamespace = msg.k.split(".")[0].slice(1);
  }

  // This namespace can only be written if data does not exist previously
  // This violates the offline first principle..?
  if (msg.k.slice(0, 2) == "==") {
    const key = msg.k;
    const data = await new Promise<VerificationData<T> | null>((resolve) => {
      this.store.get(key, (err, data) => {
        if (data) {
          try {
            const message = JSON.parse(data);
            resolve(message);
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
    if (data && data.a !== msg.a) return VerifyResult.CantOverwrite;
  }

  if (adressNamespace && adressNamespace !== msg.a) {
    // console.warn("Provided address does not match");
    return VerifyResult.AddressMismatch;
  }

  // Verify hash and nonce (adjust zeroes for difficulty of the network)
  // While this POW does not enforce security per-se, it does make it harder
  // for attackers to spam the network, and could be adjusted by peers.
  // Disabled for now because it is painful on large requests
  if (pow > 0) {
    if (msg.h.slice(0, pow) !== new Array(pow).fill("0").join("")) {
      // console.warn("No valid hash (no pow)");
      return VerifyResult.NoProofOfWork;
    }

    if (sha256(`${strData}${msg.a}${msg.t}${msg.n}`) !== msg.h) {
      // console.warn("Specified hash does not generate a valid pow");
      return VerifyResult.InvalidHashNonce;
    }
  }

  const address = this.recoverAddress(msg.h, msg.s);
  const verified = address === msg.a;
  // console.warn(`Signature validation: ${verified ? "Sucess" : "Failed"}`);

  return verified ? VerifyResult.Verified : VerifyResult.InvalidSignature;
}
