/*

| (• ◡•)| (❍ᴥ❍ʋ)

*/

const sdk = fissionSdk

const API_ENDPOINT = "https://runfission.net"
const DATA_ROOT_DOMAIN = "fissionuser.net"

let app
let ipfs


// 🚀


bootIpfs().then(bootElm)


// ELM
// ---

async function bootElm() {
  const usedUsername = localStorage.getItem("usedUsername")

  app = Elm.Main.init({
    flags: {
      dataRootDomain: DATA_ROOT_DOMAIN,
      url: location.href,
      usedUsername
    }
  })

  ports()
}


function ports() {
  app.ports.checkIfUsernameIsAvailable.subscribe(checkIfUsernameIsAvailable)
  app.ports.createAccount.subscribe(createAccount)
  app.ports.linkApp.subscribe(linkApp)
  app.ports.openSecureChannel.subscribe(openSecureChannel)
  app.ports.publishOnSecureChannel.subscribe(publishOnSecureChannel)
  app.ports.publishEncryptedOnSecureChannel.subscribe(publishEncryptedOnSecureChannel)
}


// IPFS
// ----

async function bootIpfs() {
  ipfs = await Ipfs.create({
    config: {
      Addresses: {
        Swarm: [
          "/ip4/0.0.0.0/tcp/9090/ws/p2p-webrtc-star/",
          // "/dns4/node.fission.systems/tcp/4003/wss/ipfs/QmVLEz2SxoNiFnuyLpbXsH6SvjPTrHNMU88vCQZyhgBzgw"
        ]
      }
    }
  })

  await sdk.ipfs.setIpfs(ipfs)
}



// ACCOUNT
// =======

let rootDidCache

/**
 * Get the root DID for a user.
 *
 * That might be the DID of this domain/device,
 * it could be another DID from a UCAN,
 * or it might be that we need to look this up.
 *
 * The only way we get a UCAN in this lobby,
 * is to link this domain/device to another one.
 */
async function rootDid(maybeUsername) {
  let ucan

  if (rootDidCache) {
    null
  } else if (maybeUsername) {
    rootDidCache = await sdk.dns.lookupTxtRecord(`_did.${maybeUsername}.${DATA_ROOT_DOMAIN}`)
  } else if (ucan = localStorage.getItem("ucan")) {
    rootDidCache = sdk.core.ucanRootIssuer(ucan)
  } else {
    rootDidCache = await sdk.core.did()
  }

  return rootDidCache
}


// CREATE
// ------

async function checkIfUsernameIsAvailable(username) {
  if (sdk.lobby.isUsernameValid(username)) {
    const isAvailable = await sdk.lobby.isUsernameAvailable(username, DATA_ROOT_DOMAIN)
    app.ports.gotUsernameAvailability.send({ available: isAvailable, valid: true })

  } else {
    app.ports.gotUsernameAvailability.send({ available: false, valid: false })

  }
}


async function createAccount(args) {
  const { success } = await sdk.lobby.createAccount(args, { apiEndpoint: API_ENDPOINT })

  if (success) {
    localStorage.setItem("usedUsername", args.username)

    app.ports.gotCreateAccountSuccess.send(
      null
    )

  } else {
    app.ports.gotCreateAccountFailure.send(
      "Unable to create an account, maybe you have one already?"
    )

  }
}


// LINK
// ----

async function linkApp({ did }) {
  const ucan = await core.ucan({
    audience: did,
    issuer: await rootDid(),
    lifetimeInSeconds: 60 * 60 * 24 * 30 // one month,
  })

  app.ports.gotUcanForApplication.send(
    { ucan }
  )
}



// SECURE CHANNEL
// ==============

let pingInterval


/**
 * Tries to subscribe to a pubsub channel
 * with the root DID as the topic.
 *
 * If it succeeds, it'll call the `secureChannelOpened` port,
 * otherwise the `secureChannelTimeout` port will called.
 */
async function openSecureChannel(maybeUsername) {
  const rootDid_ = await rootDid(maybeUsername)
  const ipfsId = (await ipfs.id()).id

  await ipfs.pubsub.subscribe(
    rootDid_,
    secureChannelMessage(rootDid_, ipfsId)
  )

  if (maybeUsername) {
    pingInterval = setInterval(
      () => ipfs.pubsub.publish(rootDid_, "PING"),
      500
    )
  }
}


function secureChannelMessage(rootDid_, ipfsId) { return async function({ from, data }) {
  const string = arrayBufferToString(data)

  if (from !== ipfsId) {
    console.log("Got", string)
  } else {
    console.log("Sending", string)
  }

  if (from === ipfsId) {
    return

  } else if (string === "PING") {
    ipfs.pubsub.publish(rootDid_, "PONG")

  } else if (string === "PONG") {
    clearInterval(pingInterval)
    app.ports.secureChannelOpened.send(null)

  } else {
    try {
      gotSecureChannelMessage(from, string)
    } catch (_) {
      console.log("Trying to decrypt")
      const decryptedString = await decrypt(string, rootDid_)
      console.log("Decrypted", decryptedString)
      gotSecureChannelMessage(from, decryptedString)
    }

  }
}}


  function gotSecureChannelMessage(from, string) {
    const decodedJson = JSON.parse(string)

    app.ports.gotSecureChannelMessage.send({
      ...decodedJson,
      from,
      timestamp: Date.now(),
    })
  }


async function publishOnSecureChannel([ maybeUsername, dataWithPlaceholders ]) {
  ipfs.pubsub.publish(
    await rootDid(maybeUsername),
    await prepareData(dataWithPlaceholders)
  )
}


async function publishEncryptedOnSecureChannel([ maybeUsername, passphrase, dataWithPlaceholders ]) {
  ipfs.pubsub.publish(
    await rootDid(maybeUsername),
    await encrypt(await prepareData(dataWithPlaceholders), passphrase)
  )
}


  async function prepareData(dataWithPlaceholders) {
    let ks

    // Payload to sign
    const payloadToSign = dataWithPlaceholders.signature !== undefined
      ? { ...dataWithPlaceholders }
      : null

    if (payloadToSign) {
      delete payloadToSign.signature
      ks = await sdk.keystore.get()
    }

    // Replace placeholders
    const data = {
      ...dataWithPlaceholders,
      did: dataWithPlaceholders.did !== undefined ? await sdk.core.did() : undefined,
      signature: payloadToSign ? await ks.sign(payloadToSign) : undefined
    }

    // Return
    return JSON.stringify(data)
  }


async function encrypt(string, passphrase) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFromPassphrase(passphrase)
  const buf = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
      tagLength: 128
    },
    key,
    stringToArrayBuffer(string)
  )

  const iv_b64 = arrayBufferToBase64(iv)
  const buf_b64 = arrayBufferToBase64(buf)
  return iv_b64 + buf_b64
}


async function decrypt(string, passphrase) {
  const key = await keyFromPassphrase(passphrase)

  const iv_b64 = string.substring(0, 16)
  const buf_b64 = string.substring(16)

  const iv = base64ToArrayBuffer(iv_b64)
  const buf = base64ToArrayBuffer(buf_b64)

  console.log("here", key, buf)

  const decryptedBuf = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
      tagLength: 128
    },
    key,
    buf
  )

  return arrayBufferToString(
    decryptedBuf
  )
}


function keyFromPassphrase(passphrase) {
  return crypto.subtle.importKey(
    "raw",
    stringToArrayBuffer(passphrase),
    {
      name: "PBKDF2"
    },
    false,
    [ "deriveKey" ]

  ).then(baseKey => crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: stringToArrayBuffer("fission"),
      iterations: 10000,
      hash: "SHA-512"
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    [ "encrypt", "decrypt" ]

  ))
}


function arrayBufferToBase64(buf) {
  return btoa(
    Array
      .from(new Uint8Array(buf))
      .map(c => String.fromCharCode(c))
      .join("")
  )
}


function arrayBufferToString(buf) {
  return new TextDecoder().decode(buf)
}


function base64ToArrayBuffer(b64) {
  return new Uint8Array(
    atob(b64)
      .split("")
      .map(c => c.charCodeAt(0))
  ).buffer
}


function stringToArrayBuffer(str) {
  return new TextEncoder().encode(str).buffer
}
