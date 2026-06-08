import { Link, Outlet } from 'react-router'

/**
 * App shell rendered around every route. Put shared chrome here
 * (nav, header, footer). Child routes render into <Outlet />.
 */
export default function RootLayout() {
  return (
    <>
      <nav className="nav">
        <Link to="/">Home</Link>
        <Link to="/queue">Queue</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  )
}
