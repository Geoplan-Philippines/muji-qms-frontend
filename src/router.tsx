import { createBrowserRouter } from 'react-router'
import RootLayout from './layouts/RootLayout'
import Home from './pages/Home'
import Queue from './pages/Queue'
import NotFound from './pages/NotFound'

/**
 * Central route table. Add routes as children of the layout.
 * For heavier screens prefer `lazy: () => import('./pages/X')` so
 * they code-split automatically as the app grows.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { 
        index: true, 
        element: <Home /> 
      },
      { 
        path: 'queue', 
        element: <Queue /> 
      },
      { 
        path: '*', 
        element: <NotFound /> 
      },
    ],
  },
])
