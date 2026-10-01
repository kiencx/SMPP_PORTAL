import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import TopNav from '../components/layout/TopNav'
import Sidebar from '../components/layout/Sidebar'
import Footer from '../components/layout/Footer'
import EditProviderModal from '../components/modals/EditProviderModal'
import AddProviderModal from '../components/modals/AddProviderModal'
import { useAuth } from '../context/AuthContext'
import { initialProviders } from '../data/initialProviders'

function MainLayout() {
  const { authUsername, authRole, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [providers, setProviders] = useState(initialProviders)
  const [totalMessages, setTotalMessages] = useState(1000)
  const [showDistribution, setShowDistribution] = useState(false)

  const [editingProvider, setEditingProvider] = useState(null)
  const [editPercentage, setEditPercentage] = useState(0)
  const [editProviderName, setEditProviderName] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [newProviderModalName, setNewProviderModalName] = useState('')
  const [newProviderModalPercentage, setNewProviderModalPercentage] = useState(0)

  const totalPercentage = providers.reduce((sum, provider) => sum + provider.percentage, 0)

  const openAddModal = () => {
    setShowAddModal(true)
    setNewProviderModalName('')
    setNewProviderModalPercentage(0)
  }

  const closeAddModal = () => {
    setShowAddModal(false)
    setNewProviderModalName('')
    setNewProviderModalPercentage(0)
  }

  const saveNewProvider = () => {
    if (!newProviderModalName.trim()) {
      return
    }

    const newProvider = {
      id: Date.now(),
      name: newProviderModalName.trim(),
      percentage: newProviderModalPercentage,
      color: '#000',
      successRate: 0,
      errorRate: 0,
      totalSent: 0,
    }

    setProviders([...providers, newProvider])
    closeAddModal()
  }

  const handleAddKeyPress = (event) => {
    if (event.key === 'Enter' && newProviderModalName.trim()) {
      saveNewProvider()
    }
  }

  const deleteProvider = (id) => {
    setProviders(providers.filter((provider) => provider.id !== id))
  }

  const openEditModal = (provider) => {
    setEditingProvider(provider)
    setEditPercentage(provider.percentage)
    setEditProviderName(provider.name)
  }

  const closeEditModal = () => {
    setEditingProvider(null)
    setEditPercentage(0)
    setEditProviderName('')
  }

  const saveEdit = () => {
    setProviders(
      providers.map((provider) =>
        provider.id === editingProvider.id
          ? { ...provider, percentage: editPercentage, name: editProviderName }
          : provider,
      ),
    )
    closeEditModal()
  }

  const distributeEvenly = () => {
    const evenPercentage = Math.floor(100 / providers.length)
    const remainder = 100 - evenPercentage * providers.length
    setProviders(
      providers.map((provider, index) => ({
        ...provider,
        percentage: index === 0 ? evenPercentage + remainder : evenPercentage,
      })),
    )
  }

  const activeMenu = location.pathname.replace(/^\//, '') || 'routing'
  const onChangeMenu = (menuId) => navigate(`/${menuId}`)
  const onGoHome = () => {
    setShowDistribution(false)
    navigate('/')
  }

  return (
    <div className="app">
      <TopNav activeMenu={activeMenu} onChangeMenu={onChangeMenu} onGoHome={onGoHome} username={authUsername} onLogout={logout} />

      <div className="app-body">
        <Sidebar activeMenu={activeMenu} onChangeMenu={onChangeMenu} username={authUsername} role={authRole} onLogout={logout} />

        <main className="main-content">
          <div className="container">
            <Outlet
              context={{
                providers,
                totalPercentage,
                totalMessages,
                setTotalMessages,
                showDistribution,
                setShowDistribution,
                openAddModal,
                distributeEvenly,
                openEditModal,
                deleteProvider,
              }}
            />

            <EditProviderModal
              editingProvider={editingProvider}
              editProviderName={editProviderName}
              setEditProviderName={setEditProviderName}
              editPercentage={editPercentage}
              setEditPercentage={setEditPercentage}
              closeEditModal={closeEditModal}
              saveEdit={saveEdit}
            />

            <AddProviderModal
              showAddModal={showAddModal}
              closeAddModal={closeAddModal}
              newProviderModalName={newProviderModalName}
              setNewProviderModalName={setNewProviderModalName}
              newProviderModalPercentage={newProviderModalPercentage}
              setNewProviderModalPercentage={setNewProviderModalPercentage}
              handleAddKeyPress={handleAddKeyPress}
              saveNewProvider={saveNewProvider}
            />
          </div>

          <Footer />
        </main>
      </div>
    </div>
  )
}

export default MainLayout
