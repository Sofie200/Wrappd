import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ErrorMessage, Loading } from "./Feedback.jsx";
import LandingPage from "../pages/LandingPage.jsx";

// The whole app requires login. Not logged in → /login, and back here afterwards -
// except the start page (/): visitors who aren't logged in see the landing page there instead.
export default function RequireAuth({ children }) {
    const { user, checking, error, retry } = useAuth();
    const location = useLocation();

    if (checking) {
        return (
            <div className="page-center">
                <Loading />
            </div>
        );
    }

    // There is a token, but the server couldn't be reached - don't log out, offer a retry
    if (!user && error) {
        return (
            <div className="page-center">
                <ErrorMessage message={error} onRetry={retry} />
            </div>
        );
    }

    if (!user && location.pathname === "/") return <LandingPage />;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

    return children;
}
