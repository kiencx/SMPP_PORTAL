import { RouterProvider } from 'react-router-dom'
import { PrimeReactProvider } from 'primereact/api'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './App.css'
import { AuthProvider } from './context/AuthContext'
import { router } from './router/router'

function App() {
  return (
    <PrimeReactProvider>
      <AuthProvider>
        <RouterProvider router={router} />
        <ToastContainer position="top-right" autoClose={3000} />
      </AuthProvider>
    </PrimeReactProvider>
  )
}

export default App
