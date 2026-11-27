import TituloPagina from './TituloPagina.jsx'
import Enrolamiento from './pages/Enrolamiento.jsx'
import Academico from './pages/Academico.jsx'
import TotemPinDemo from './pages/TotemPinDemo.jsx' // ASISTIA_187_14_82_TOTEM_PIN_DEMO

import './App.css'
import { useEffect } from 'react'

import {
  BrowserRouter,
  Routes,
  Route,
} from 'react-router-dom'

import Layout from './components/Layout'
import Registro from './pages/Registro'
import ActivarCuenta from './pages/ActivarCuenta'

import Dashboard from './pages/Dashboard'
import Alumnos from './pages/Alumnos'
import Docentes from './pages/Docentes'
import Cursos from './pages/Cursos'
import Horarios from './pages/Horarios'
import Marcaciones from './pages/Marcaciones'
import Ausencias from './pages/Ausencias'
import Atrasos from './pages/Atrasos'
import Incidencias from './pages/Incidencias'
import Reportes from './pages/Reportes'
import Configuracion from './pages/Configuracion'
import Auditoria from './pages/Auditoria'
import Login from './pages/Login'

import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'

import { AuthProvider } from './auth/AuthContext'

// PRUEBA TEMPORAL DE CONEXIÓN CON FIREBASE
import { probarConexionFirebase } from './firebase/testConexion'

function App() {

  useEffect(() => {
    probarConexionFirebase()
  }, [])

  return (
    <AuthProvider>
      <BrowserRouter>
      <TituloPagina />
        <Routes>

          {/* LOGIN */}
          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/registro"
            element={<Registro />}
          />

          <Route
            path="/activar-cuenta"
            element={<ActivarCuenta />}
          />

          {/* TODAS LAS RUTAS REQUIEREN SESIÓN */}
          <Route element={<ProtectedRoute />}>

            <Route element={<Layout />}>

              {/* TODOS LOS USUARIOS */}
              <Route element={<RoleRoute allowedRoles={['Administradora', 'Alumno']} />}>
                <Route path="/enrolamiento" element={<Enrolamiento />} />
              </Route>
              <Route
                path="/"
                element={<Dashboard />}
              />

                            {/* ASISTIA_187_14_29_PAGINAS_ACADEMICAS */}

              {/* ASISTIA_187_14_82_TOTEM_PIN_DEMO */}
              <Route element={<RoleRoute allowedRoles={['Administradora']} />}>
                <Route path="/totem-pin-demo" element={<TotemPinDemo />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={['Alumno']} />}>
                <Route path="/academico/horario" element={<Academico />} />
                <Route path="/academico/cursos" element={<Academico />} />
                <Route path="/academico/asistencia" element={<Academico />} />
                <Route path="/academico/justificaciones" element={<Academico />} />
              </Route>

              <Route element={<RoleRoute allowedRoles={['Docente']} />}>
                <Route path="/academico/clases" element={<Academico />} />
                <Route path="/academico/alumnos" element={<Academico />} />
                <Route path="/academico/tomar-asistencia" element={<Academico />} />
                <Route path="/academico/reportes" element={<Academico />} />
              </Route>

              <Route element={<RoleRoute allowedRoles={['Alumno', 'Docente']} />}>
                <Route path="/academico/perfil" element={<Academico />} />
              </Route>
{/* ASISTIA_RUTAS_ADMIN_187_14_16 */}
<Route
  element={
    <RoleRoute allowedRoles={['Administradora']} />
  }
>
<Route
                path="/cursos"
                element={<Cursos />}
              />

              <Route
                path="/horarios"
                element={<Horarios />}
              />

              <Route
                path="/marcaciones"
                element={<Marcaciones />}
              />
</Route>

              {/* ADMINISTRADOR + DOCENTE */}
              <Route
                element={
                  <RoleRoute
                    allowedRoles={['Administradora']}
                  />
                }
              >

                <Route
                  path="/alumnos"
                  element={<Alumnos />}
                />

                <Route
                  path="/ausencias"
                  element={<Ausencias />}
                />

                <Route
                  path="/atrasos"
                  element={<Atrasos />}
                />

                <Route
                  path="/incidencias"
                  element={<Incidencias />}
                />

                <Route
                  path="/reportes"
                  element={<Reportes />}
                />

              </Route>

              {/* SOLO ADMINISTRADOR */}
              <Route
                element={
                  <RoleRoute
                    allowedRoles={[
                      'Administradora',
                    ]}
                  />
                }
              >

                <Route
                  path="/docentes"
                  element={<Docentes />}
                />

                <Route
                  path="/configuracion"
                  element={<Configuracion />}
                />

                <Route
                  path="/auditoria"
                  element={<Auditoria />}
                />

              </Route>

            </Route>

          </Route>

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
