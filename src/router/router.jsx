import { createBrowserRouter, Navigate, useNavigate, useOutletContext } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import RequireRole from './RequireRole'
import { ROLES, ROLE_HOME_PATH } from '../constants/auth'
import MainLayout from '../layouts/MainLayout'
import LoginPage from '../pages/LoginPage'
import HomeContent from '../pages/HomeContent'
import ProvidersContent from '../pages/ProvidersContent'
import ReportsContent from '../pages/ReportsContent'
import SmsRequestSection from '../pages/SmsRequestSection'
import RoutingRulesContent from '../pages/RoutingRulesContent'
import GatewayConfigContent from '../pages/GatewayConfigContent'
import BrandnameDeclarationContent from '../pages/BrandnameDeclarationContent'
import PricingManagementContent from '../pages/PricingManagementContent'
import AccountManagementContent from '../pages/AccountManagementContent'
import ReconciliationContent from '../pages/ReconciliationContent'
import MessageLookupContent from '../pages/MessageLookupContent'
import CustomerDashboardContent from '../pages/CustomerDashboardContent'
import CustomerCampaignCreateContent from '../pages/CustomerCampaignCreateContent'
import CustomerCampaignApprovalContent from '../pages/CustomerCampaignApprovalContent'
import CustomerContactsContent from '../pages/CustomerContactsContent'
import CustomerMessageLookupContent from '../pages/CustomerMessageLookupContent'
import ComingSoon from '../components/common/ComingSoon'
import { useAuth } from '../context/AuthContext'
// import { calculateDistribution } from '../utils/providerUtils'

// Pages below this line need data shared by MainLayout (provider list/modals)
// or the auth token, which they read via useOutletContext()/useAuth() instead
// of prop drilling through the route config.

function ProvidersPage() {
  const ctx = useOutletContext()
  return (
    <ProvidersContent
      providers={ctx.providers}
      totalPercentage={ctx.totalPercentage}
      openAddModal={ctx.openAddModal}
      distributeEvenly={ctx.distributeEvenly}
      openEditModal={ctx.openEditModal}
      deleteProvider={ctx.deleteProvider}
    />
  )
}

function ReportsPage() {
  const ctx = useOutletContext()
  return <ReportsContent providers={ctx.providers} totalPercentage={ctx.totalPercentage} />
}

function SendSmsPage() {
  const { authToken } = useAuth()
  return <SmsRequestSection authToken={authToken} />
}

function LoginRoute() {
  const { authToken, authRole, login } = useAuth()
  const navigate = useNavigate()

  if (authToken && authRole) {
    return <Navigate to="/" replace />
  }

  const handleLoginSuccess = (token, username, role) => {
    login(token, username, role)
    navigate('/', { replace: true })
  }

  return <LoginPage onLoginSuccess={handleLoginSuccess} />
}

function RoleHomeRedirect() {
  const { authRole } = useAuth()
  return <Navigate to={ROLE_HOME_PATH[authRole] || '/login'} replace />
}

function NotFoundPage() {
  return (
    <div className="feature-developing">
      <div className="feature-developing-icon">🚧</div>
      <h2 className="feature-developing-title">Tính năng đang phát triển</h2>
      <p className="feature-developing-text">Chức năng này sẽ sớm được ra mắt. Vui lòng quay lại sau.</p>
    </div>
  )
}

// Single source of truth: one entry per page/route in the app.
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginRoute />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <RoleHomeRedirect /> },
      { path: 'home', element: <RoleHomeRedirect /> },
      {
        element: <RequireRole roles={[ROLES.ADMIN]} />,
        children: [
          { path: 'dashboard', element: <HomeContent /> },
          { path: 'providers', element: <ProvidersPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'send-sms', element: <SendSmsPage /> },
          { path: 'routing', element: <RoutingRulesContent /> },
          { path: 'gateway', element: <GatewayConfigContent /> },
          { path: 'brandname', element: <BrandnameDeclarationContent /> },
          { path: 'pricing', element: <PricingManagementContent /> },
          { path: 'account', element: <AccountManagementContent /> },
          { path: 'reconcile', element: <ReconciliationContent /> },
          { path: 'lookup', element: <MessageLookupContent /> },
        ],
      },
      {
        element: <RequireRole roles={[ROLES.CLIENT]} />,
        children: [
          { path: 'customer/dashboard', element: <CustomerDashboardContent /> },
          { path: 'customer/campaigns/new', element: <CustomerCampaignCreateContent /> },
          { path: 'customer/campaigns/approval', element: <CustomerCampaignApprovalContent /> },
          { path: 'customer/contacts', element: <CustomerContactsContent /> },
          { path: 'customer/lookup', element: <CustomerMessageLookupContent /> },
          {
            path: 'customer/history',
            element: <ComingSoon title="Lịch sử tin nhắn" description="Tính năng lịch sử tin nhắn đang được phát triển." />,
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
