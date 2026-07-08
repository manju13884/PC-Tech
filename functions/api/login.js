const USER = {
  username: "superadmin",
  passwordHash: "80cef81b2230e13afc8f93713f3b2c0ebd08852bd358fabcf605b5dc3f61d37890150657ea7da5e0965c97e37146dc7978c92d8a22a33bb5f84f2edbc97bc4e1",
  salt: "0592b57259a1a2fd9781ef6658abced3",
  iterations: 310000,
  keyLength: 64
}

async function verifyPassword(password) {
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: Uint8Array.from(
        USER.salt.match(/.{1,2}/g).map(b => parseInt(b, 16))
      ),
      iterations: USER.iterations
    },
    key,
    USER.keyLength * 8
  )

  const hash = [...new Uint8Array(derivedBits)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")

  return hash === USER.passwordHash
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json()

    if (body.username !== USER.username) {
      return Response.json(
        { error: "Invalid username or password" },
        { status: 401 }
      )
    }

    const ok = await verifyPassword(body.password)

    if (!ok) {
      return Response.json(
        { error: "Invalid username or password" },
        { status: 401 }
      )
    }

    return Response.json({
      authenticated: true,
      username: USER.username
    })
  } catch (err) {
    return Response.json(
      { error: err.message },
      { status: 500 }
    )
  }
}