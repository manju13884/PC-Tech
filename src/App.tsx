import { FormEvent, useEffect, useState } from 'react'
import Dashboard, { getDefaultPermittedMenuKey } from './Dashboard'

interface AuthenticatedUser {
  id: number
  email: string
  fullName: string
  role: string
  status: string
  sessionVersion: number
  mustChangePassword: boolean
  menuAccess: string[]
}

interface LoginResponse {
  success?: boolean
  error?: string
  user?: AuthenticatedUser
}

interface BasicResponse {
  success?: boolean
  error?: string
}

const currentYear = new Date().getFullYear()

function navigateToDefaultAuthenticatedPage(menuAccess: string[]) {
  const defaultKey = getDefaultPermittedMenuKey(menuAccess)

  if (defaultKey) {
    window.history.replaceState(null, '', `#${defaultKey}`)
  }
}

function App() {
  const initialSetupToken = new URLSearchParams(window.location.search).get('setup_token') ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('')
  const [changePassword, setChangePassword] = useState('')
  const [changeConfirmPassword, setChangeConfirmPassword] = useState('')
  const [setupToken, setSetupToken] = useState(initialSetupToken)
  const [message, setMessage] = useState('')
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const loginBrand = (
    <div className="login-brand">
      <img
        className="site-logo"
        src="/assets/PC-Bord-Logo-only-transparent.png"
        alt="PolarCanvas bird logo"
      />
      <div className="portal-identity" aria-label="PolarCanvas Tech Portal">
        <span>PolarCanvas</span>
        <em>Tech Portal</em>
      </div>
    </div>
  )

  useEffect(() => {
    let isCurrent = true

    async function loadCurrentUser() {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 6000)

      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
          signal: controller.signal,
        })
        const data: LoginResponse = await response.json()

        if (!isCurrent || !response.ok || !data.success || !data.user) {
          return
        }

        setUser(data.user)
        setEmail(data.user.email)
      } catch {
        // Stay on the login screen when no valid session can be loaded.
      } finally {
        window.clearTimeout(timeoutId)
        if (isCurrent) {
          setCheckingSession(false)
        }
      }
    }

    loadCurrentUser()

    return () => {
      isCurrent = false
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email: normalizedEmail, password }),
      })
      const data: LoginResponse = await response.json()

      if (!response.ok) {
        setMessage(data.error || 'Invalid email or password.')
        return
      }

      if (data.success && data.user) {
        navigateToDefaultAuthenticatedPage(data.user.menuAccess)
        setUser(data.user)
        setEmail(data.user.email)
        setMessage('')
        return
      }

      setMessage(data.error || 'Unable to authenticate.')
    } catch (error) {
      setMessage('Unable to connect to authentication service.')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Clear local state even if the logout request cannot be completed.
    }

    setUser(null)
    setEmail('')
    setPassword('')
    setChangePassword('')
    setChangeConfirmPassword('')
    setMessage('')
  }

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (changePassword !== changeConfirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ password: changePassword }),
      })
      const data: BasicResponse = await response.json()

      if (!response.ok || !data.success) {
        setMessage(data.error || 'Unable to change password.')
        return
      }

      setUser((currentUser) => currentUser ? { ...currentUser, mustChangePassword: false } : currentUser)
      navigateToDefaultAuthenticatedPage(user?.menuAccess ?? [])
      setPassword('')
      setChangePassword('')
      setChangeConfirmPassword('')
      setMessage('')
    } catch {
      setMessage('Unable to connect to authentication service.')
    }
  }

  const handleSetupPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (setupPassword !== setupConfirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    try {
      const response = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: setupToken, password: setupPassword }),
      })
      const data: BasicResponse = await response.json()

      if (!response.ok || !data.success) {
        setMessage(data.error || 'Unable to set password.')
        return
      }

      window.history.replaceState(null, '', window.location.pathname)
      setSetupToken('')
      setSetupPassword('')
      setSetupConfirmPassword('')
      setMessage('Password set. Please login.')
    } catch {
      setMessage('Unable to connect to authentication service.')
    }
  }

  if (user && user.mustChangePassword) {
    return (
      <main className="app-shell">
        <section className="login-card">
          <div className="login-grid">
            <div className="login-panel">
              {loginBrand}
              <div className="login-panel-copy">
                <h2>Change password</h2>
                <p>This is your first login. Create a new password before continuing to PC-Tech.</p>
              </div>
            </div>
            <div className="login-form-panel">
              <form onSubmit={handleChangePassword} className="login-form">
                <div className="login-form-title">
                  <h3>Set new password</h3>
                </div>

                <label htmlFor="change-password">New Password</label>
                <input
                  id="change-password"
                  type="password"
                  value={changePassword}
                  onChange={(event) => setChangePassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />

                <label htmlFor="change-confirm-password">Confirm Password</label>
                <input
                  id="change-confirm-password"
                  type="password"
                  value={changeConfirmPassword}
                  onChange={(event) => setChangeConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />

                <button type="submit">Change Password</button>

                {message && <p className="message">{message}</p>}
              </form>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (user) {
    return <Dashboard username={user.fullName || user.email} menuAccess={user.menuAccess} onLogout={handleLogout} />
  }

  if (checkingSession) {
    return (
      <main className="app-shell">
        <section className="login-card auth-loading-card">
          <p>Loading...</p>
        </section>
      </main>
    )
  }

  if (setupToken) {
    return (
      <main className="app-shell">
        <section className="login-card">
          <div className="login-grid">
            <div className="login-panel">
              {loginBrand}
              <div className="login-panel-copy">
                <h2>Set password</h2>
                <p>Create your password to activate your PC-Tech account.</p>
              </div>
            </div>
            <div className="login-form-panel">
              <form onSubmit={handleSetupPassword} className="login-form">
                <div className="login-form-title">
                  <h3>Account setup</h3>
                </div>

                <label htmlFor="setup-password">Password</label>
                <input
                  id="setup-password"
                  type="password"
                  value={setupPassword}
                  onChange={(event) => setSetupPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />

                <label htmlFor="setup-confirm-password">Confirm Password</label>
                <input
                  id="setup-confirm-password"
                  type="password"
                  value={setupConfirmPassword}
                  onChange={(event) => setSetupConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />

                <button type="submit">Set Password</button>

                {message && <p className="message">{message}</p>}
              </form>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="login-card">
        <div className="login-grid">
          <div className="login-panel">
            {loginBrand}
            <div className="login-panel-copy">
              <h2>Welcome back</h2>
              <p>Securely sign in to your PolarCanvas portal for pricing, compliance certificates, and shipping documentation.</p>
            </div>
            <div className="login-stats">
              <div>
                <strong>99.9%</strong>
                <span>Uptime</span>
              </div>
              <div>
                <strong>24/7</strong>
                <span>Support</span>
              </div>
            </div>
          </div>
          <div className="login-form-panel">
            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-form-title">
                <h3>Sign in</h3>
              </div>

              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />

              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />

              <button type="submit">Login</button>

              {message && <p className="message">{message}</p>}
            </form>
          </div>
        </div>
      </section>
      <footer className="login-copyright">Copyright &copy; {currentYear} - Polar Canvas Technologies Private Limited</footer>
    </main>
  )
}

export default App
