/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  sendEmailVerification,
  signOut
} from 'firebase/auth'
import { auth } from '../firebase/firebase'

const AuthContext = createContext(null)
const SESSION_KEY = 'asistia-session'

function savedSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY))
    return value?.token && value?.user ? value : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(savedSession)

  const login = async (email, password, remember = true) => {
    try {
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence
      )

      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      )

      if (!credential.user.emailVerified) {
        await signOut(auth)
        return { ok: false, needsEmailVerification: true, message: 'La cuenta existe. Verifica tu correo antes de entrar; puedes reenviar el mensaje desde el botón siguiente.' }
      }

      const idToken = await credential.user.getIdToken()

      const response = await fetch('/api/auth/firebase/exchange', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`
        }
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        await signOut(auth)
        return {
          ok: false,
          message: result.message || 'Acceso no autorizado.'
        }
      }

      const next = {
        user: result.user,
        token: result.token
      }

      setSession(next)

      if (remember) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(next))
      } else {
        localStorage.removeItem(SESSION_KEY)
      }

      return { ok: true, user: result.user }
    } catch (error) {
      const messages = {
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
        'auth/invalid-email': 'El correo ingresado no es válido.',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
        'auth/user-disabled': 'Esta cuenta está deshabilitada.'
      }

      return {
        ok: false,
        message: messages[error.code] ||
          'No fue posible iniciar sesión con Firebase.'
      }
    }
  }

  const resendVerification = async (email, password) => {
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      if (credential.user.emailVerified) return { ok: true, message: 'El correo ya está verificado. Pulsa Ingresar al sistema.' }
      await sendEmailVerification(credential.user)
      return { ok: true, message: 'Se solicitó un nuevo correo de verificación. Revisa también Spam y abre el enlace antes de volver a ingresar.' }
    } catch (error) {
      return { ok: false, message: error.code === 'auth/too-many-requests' ? 'Espera unos minutos antes de pedir otro mensaje.' : 'No se pudo reenviar. Comprueba el correo y la contraseña del panel.' }
    } finally { await signOut(auth).catch(() => {}) }
  }

  // ASISTIA_187_14_61_LOGOUT_AUTH
  const logout = () => {
    const currentToken = session?.token

    localStorage.removeItem(SESSION_KEY)
    setSession(null)

    if (currentToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`
        }
      }).catch(() => {})
    }

    signOut(auth).catch(() => {})
  }

  const value = {
    user: session?.user || null,
    token: session?.token || null,
    login,
    resendVerification,
    logout
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
