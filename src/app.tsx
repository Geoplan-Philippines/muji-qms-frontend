import { Suspense, lazy } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { MotionConfig } from "motion/react";

const DisplayScreen = lazy(() => import("./screens/display/display-screen"));
const StaffScreen = lazy(() => import("./screens/staff/staff-screen"));

function ScreenFallback() {
  return <div className="route-fallback" aria-busy="true" />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Suspense fallback={<ScreenFallback />}>
        <DisplayScreen />
      </Suspense>
    ),
  },
  {
    path: "/staff",
    element: (
      <Suspense fallback={<ScreenFallback />}>
        <StaffScreen />
      </Suspense>
    ),
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}
