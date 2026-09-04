import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Each role's landing route — used when a role tries to reach a route it's
// not allowed on, so the redirect target is always something that role CAN
// see. Redirecting everyone to "/" would loop for roles whose home isn't "/".
const ROLE_HOME = {
  facility_admin: '/',
  moh_super_admin: '/moh',
  doctor: '/clinical',
  nurse: '/clinical',
  pharmacist: '/pharmacy',
  store_officer: '/',
  chw: '/chw',
};

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return null;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const home = ROLE_HOME[user.role] || '/login';
    // Guard against redirecting into the same disallowed route, which would loop.
    if (home === location.pathname) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to={home} replace />;
  }

  return children;
}
