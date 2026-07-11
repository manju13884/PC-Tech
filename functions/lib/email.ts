interface InviteEmailInput {
  to: string
  fullName: string
  setupLink: string
}

interface EmailEnv {
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
}

export interface InviteEmailResult {
  sent: boolean
  reason?: string
}

export async function sendPasswordSetupEmail(
  env: EmailEnv,
  input: InviteEmailInput,
): Promise<InviteEmailResult> {
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.EMAIL_FROM?.trim()

  if (!apiKey || !from) {
    return { sent: false, reason: 'Email provider is not configured' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: 'Set up your PC-Tech password',
      html: `
        <p>Hello ${input.fullName},</p>
        <p>Your PC-Tech account has been created. Use the link below to set your password.</p>
        <p><a href="${input.setupLink}">Set password</a></p>
        <p>This link expires in 24 hours.</p>
      `,
    }),
  })

  if (!response.ok) {
    return { sent: false, reason: `Email provider returned ${response.status}` }
  }

  return { sent: true }
}
