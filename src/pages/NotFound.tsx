import { Link } from 'react-router'

export default function NotFound() {
  return (
    <section>
      <h1>404</h1>
      <p>Page not found.</p>
      <Link to="/">Go home</Link>
    </section>
  )
}
