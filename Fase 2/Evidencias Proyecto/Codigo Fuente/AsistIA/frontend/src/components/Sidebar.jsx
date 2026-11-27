import { NavLink } from 'react-router-dom'

import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarDays,
  ScanFace,
  UserX,
  Clock3,
  TriangleAlert,
  ChartNoAxesColumnIncreasing,
  Settings,
  ClipboardList,
  School,
} from 'lucide-react'

import { useAuth } from '../auth/AuthContext'

function Sidebar() {
  const {
    user,
  } = useAuth()

  // ASISTIA_MENU_ROLES_187_14_14
  const role = user?.role
  const isPilotAdmin = role === 'Administradora' && user?.scope === 'enrolamiento-piloto'
  const isAdmin = role === 'Administradora' && !isPilotAdmin
  const isTeacher = role === 'Docente'
  const isStudent = role === 'Alumno'
  return (
    <aside className="sidebar">

      {/* =========================================
          LOGO
      ========================================= */}

      <div className="brand">

        <div className="brand-symbol">
          A
        </div>

        <div className="brand-text">
          <h2>
            AsistencialIA
          </h2>

          <span>
            Instituto Profesional
          </span>
        </div>

      </div>

      {/* =========================================
          MENÚ
      ========================================= */}

      <nav className="menu">
        {isPilotAdmin ? <MenuLink to="/enrolamiento" icon={ScanFace} text="Administrar enrolamiento" /> : <MenuLink
          to="/"
          icon={LayoutDashboard}
          text="Panel"
        />}

        {isAdmin && (
          <>
            <MenuLink to="/alumnos" icon={GraduationCap} text="Alumnos" />
            <MenuLink to="/enrolamiento" icon={ScanFace} text="Enrolamiento" />
            <MenuLink to="/docentes" icon={Users} text="Docentes" />
            <MenuLink to="/cursos" icon={BookOpen} text="Cursos" />
            <MenuLink to="/horarios" icon={CalendarDays} text="Horario de clases" />
            <MenuLink to="/marcaciones" icon={ScanFace} text="Marcaciones" />
            {/* ASISTIA_187_14_82_TOTEM_PIN_DEMO */}
            <MenuLink to="/totem-pin-demo" icon={ScanFace} text="Tótem PIN demo" />
            <MenuLink to="/ausencias" icon={UserX} text="Ausencias" />
            <MenuLink to="/atrasos" icon={Clock3} text="Atrasos" />
            <MenuLink to="/incidencias" icon={TriangleAlert} text="Incidencias" />
            <MenuLink to="/reportes" icon={ChartNoAxesColumnIncreasing} text="Informes" />
            <MenuLink to="/configuracion" icon={Settings} text="Configuración" />
            <MenuLink to="/auditoria" icon={ClipboardList} text="Auditoría" />
          </>
        )}

                {/* ASISTIA_187_14_27_MENU_ACADEMICO */}
        {(isTeacher || isStudent) && (
          <>
            <span style={{
              display: 'block',
              padding: '12px 20px',
              fontSize: 12,
              opacity: 0.7
            }}>
              Mi espacio académico
            </span>

            {isStudent && (
              <>
                <MenuLink to="/academico/horario" icon={CalendarDays} text="Mi horario" />
                <MenuLink to="/academico/cursos" icon={BookOpen} text="Mis cursos" />
                <MenuLink to="/academico/asistencia" icon={ScanFace} text="Mi asistencia" />
                <MenuLink to="/academico/justificaciones" icon={ClipboardList} text="Justificaciones" />
                <MenuLink to="/academico/perfil" icon={GraduationCap} text="Mi perfil" />
                
              </>
            )}

            {isTeacher && (
              <>
                <MenuLink to="/academico/clases" icon={CalendarDays} text="Mis clases" />
                <MenuLink to="/academico/alumnos" icon={Users} text="Mis alumnos" />
                <MenuLink to="/academico/tomar-asistencia" icon={ScanFace} text="Tomar asistencia" />
                <MenuLink to="/academico/reportes" icon={ChartNoAxesColumnIncreasing} text="Reportes" />
                <MenuLink to="/academico/perfil" icon={GraduationCap} text="Mi perfil" />
              </>
            )}
          </>
        )}
      </nav>

      {/* =========================================
          INSTITUCIÓN
      ========================================= */}

      <div className="institution">

        <div className="institution-symbol">

          <School
            size={20}
            strokeWidth={1.7}
          />

        </div>

        <div>

          <strong>
            Instituto Profesional
          </strong>

          <span>
            Gestión institucional académica
          </span>

        </div>

      </div>

    </aside>
  )
}

function MenuLink({
  to,
  icon: Icon,
  text,
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={
        ({ isActive }) =>
          isActive
            ? 'menu-link active'
            : 'menu-link'
      }
    >

      <Icon
        size={19}
        strokeWidth={1.8}
      />

      <span>
        {text}
      </span>

    </NavLink>
  )
}

export default Sidebar
