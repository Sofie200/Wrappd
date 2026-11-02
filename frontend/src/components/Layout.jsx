import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { APP_NAME } from "../config.js";

export default function Layout() {
    const { user, logout } = useAuth();

    return (
        <div className="app">
            <header className="header">
                <div className="header-inner">
                    <Link to="/" className="logo">
                        <img src="/logo.png" alt="{APP_NAME}" id="logo" />
                    </Link>

                    <nav className="nav" aria-label="Huvudmeny">
                        <NavLink to="/" end>
                            Översikt
                        </NavLink>
                        <NavLink to="/groups">Grupper</NavLink>
                        <NavLink to="/children">Mina barn</NavLink>
                        <NavLink to="/lists/new" className="nav-cta">
                            + Ny lista
                        </NavLink>
                    </nav>

                    <div className="user-menu">
                        <span className="user-name" title={`@${user.username}`}>
                            {user.name}
                        </span>
                        <button type="button" className="btn btn-small btn-ghost" onClick={logout}>
                            Logga ut
                        </button>
                    </div>
                </div>
            </header>

            <main className="main">
                <Outlet />
            </main>
        </div>
    );
}
