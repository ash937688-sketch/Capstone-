import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const nombres = {
  '/': 'Panel de control',
  '/dashboard': 'Panel de control',
  '/panel': 'Panel de control',
  '/alumnos': 'Alumnos',
  '/docentes': 'Docentes',
  '/cursos': 'Cursos',
  '/horarios': 'Horarios',
  '/marcaciones': 'Marcaciones',
  '/ausencias': 'Ausencias',
  '/atrasos': 'Atrasos',
  '/incidencias': 'Incidencias',
  '/informes': 'Informes',
  '/configuracion': 'Configuración',
  '/login': 'Iniciar sesión',
}

export default function TituloPagina() {
  const { pathname } = useLocation()

  useEffect(() => {
    const ruta = pathname.replace(/\/+$/, '') || '/'
    const titulo = nombres[ruta] ||
      (ruta.startsWith('/configuracion/')
        ? 'Configuración'
        : 'AsistencialIA')

    document.title = titulo === 'AsistencialIA'
      ? titulo
      : `AsistencialIA | ${titulo}`
  }, [pathname])

  return null
}