import { FormEvent, useState } from 'react'
import Dashboard from './Dashboard'

function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [authenticated, setAuthenticated] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        setMessage(errorData.error || 'Invalid username or password.')
        return
      }

      const data = await response.json()
      if (data.authenticated) {
        setAuthenticated(true)
        setMessage('')
      }
    } catch (error) {
      setMessage('Unable to connect to authentication service.')
    }
  }

  const handleLogout = () => {
    setAuthenticated(false)
    setUsername('')
    setPassword('')
    setMessage('')
  }

  if (authenticated) {
    return <Dashboard username={username} onLogout={handleLogout} />
  }

  return (
    <main className="app-shell">
      <section className="login-card">
        <div className="login-grid">
          <div className="login-panel">
            <img
              className="site-logo"
              src="/assets/logo.png"
              alt="PolarCanvas"
            />
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

              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
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
    </main>
  )
}

export default App
