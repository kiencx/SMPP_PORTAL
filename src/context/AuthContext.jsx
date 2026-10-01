import { createContext, useContext, useState } from 'react'
import { normalizeRole } from '../constants/auth'

const AuthContext = createContext(null)

function clearStoredSession() {
  sessionStorage.removeItem('sms_token')
  sessionStorage.removeItem('sms_username')
  sessionStorage.removeItem('sms_role')
}

// A session without a supported role (e.g. stored before roles existed) must not
// be allowed into the app, otherwise it would bypass role-based menus and routes.
function readStoredSession() {
  const token = sessionStorage.getItem('sms_token')
  const role = normalizeRole(sessionStorage.getItem('sms_role'))
  if (!token || !role) {
    clearStoredSession()
    return { token: null, username: '', role: '' }
  }
  return { token, username: sessionStorage.getItem('sms_username') || '', role }
}

export function AuthProvider({ children }) {
  const [initialSession] = useState(readStoredSession)
  const [authToken, setAuthToken] = useState(initialSession.token)
  const [authUsername, setAuthUsername] = useState(initialSession.username)
  const [authRole, setAuthRole] = useState(initialSession.role)

  const login = (token, username, role) => {
    const normalizedRole = normalizeRole(role)
    sessionStorage.setItem('sms_token', token)
    sessionStorage.setItem('sms_username', username)
    sessionStorage.setItem('sms_role', normalizedRole)
    setAuthToken(token)
    setAuthUsername(username)
    setAuthRole(normalizedRole)
  }

  const logout = () => {
    clearStoredSession()
    setAuthToken(null)
    setAuthUsername('')
    setAuthRole('')
  }

  return (
    <AuthContext.Provider value={{ authToken, authUsername, authRole, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
