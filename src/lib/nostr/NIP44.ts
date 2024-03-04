import {nip44} from "nostr-tools"

 const encrypt = (message: string, pk: string, sk: string) : string => {
    return nip44.v2.encrypt(message, getSharedSecret(sk, pk))
  }


 const getSharedSecret = (secretKey :string, publicKey :string) : Uint8Array => {
    return nip44.v2.utils.getConversationKey(secretKey, publicKey);
}

// // TEST NIP44

//console.log(encrypt("test", "ac94d78e09f012bf568e84fb9524ee7e1df29258bcb249866a61d99cef82447b", "aa1d8209e858a2505d796e190a14ac19ee7ca4a255e096e9b0f91c5caec5ff14"));


export {encrypt}