import { Navigate, Outlet, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_HOME_PATH } from '../constants/auth'

function RequireRole({ roles }) {
  const { authRole } = useAuth()
  const outletContext = useOutletContext()

  if (!roles.includes(authRole)) {
    return <Navigate to={ROLE_HOME_PATH[authRole] || '/login'} replace />
  }

  return <Outlet context={outletContext} />
}

export default RequireRole
