import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Baby, Gift, Heart, House, ScrollText, LogOut, Menu, HatGlasses, UserPen, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { APP_NAME } from "../config.js";
import Avatar from "./Avatar.jsx";
import Footer from "./Footer.jsx";
import SettingsMenu from "./SettingsMenu.jsx";

export default function Layout() {
    const { user, logout } = useAuth();
    const { pathname } = useLocation();

    // A new page starts at the top – otherwise you'd land as far down as you were on the last one
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return (
        <div className="app">
            <header className="header">
                <div className="header-inner">
                    <Link to="/" className="logo">
                        <img src="/logo.png" alt={APP_NAME} id="logo" />
                    </Link>

                    <nav className="nav" aria-label="Huvudmeny">
                        <NavLink to="/" end>
                            <House size={16} aria-hidden="true" /> Översikt
                        </NavLink>
                        <NavLink to="/lists/new" className="nav-cta">
                            <ScrollText size={16} aria-hidden="true" /> Ny lista
                        </NavLink>
                        <NavLink to="/santa/new" className="nav-cta">
                            <HatGlasses size={16} aria-hidden="true" /> Secret Santa
                        </NavLink>
                    </nav>

                    <div className="user-menu">
                        <SettingsMenu label="Meny" icon={Menu}>
                            {/* Mobile only: the main menu lives here instead of in the header */}
                            <NavLink to="/" end className="menu-item menu-mobile-only" role="menuitem">
                                <House size={16} aria-hidden="true" /> Översikt
                            </NavLink>
                            <NavLink to="/santa/new" className="menu-item menu-mobile-only" role="menuitem">
                                <HatGlasses size={16} aria-hidden="true" /> Secret Santa
                            </NavLink>
                            <hr className="menu-divider menu-mobile-only" />
                            <NavLink to="/groups" className="menu-item" role="menuitem">
                                <Users size={16} aria-hidden="true" /> Mina grupper
                            </NavLink>
                            <NavLink to="/lists" end className="menu-item" role="menuitem">
                                <ScrollText size={16} aria-hidden="true" /> Mina listor
                            </NavLink>
                            <NavLink to="/gifts" end className="menu-item" role="menuitem">
                                <Gift size={16} aria-hidden="true" /> Mina gåvor
                            </NavLink>
                        </SettingsMenu>
                        <SettingsMenu
                            label={`Meny för ${user.name}`}
                            title={`${user.name} (${user.username})`}
                            buttonClassName="profile-button"
                            trigger={<Avatar icon={user.avatarIcon} color={user.avatarColor} />}
                        >
                            <NavLink to="/profile" className="menu-item" role="menuitem">
                                <UserPen size={16} aria-hidden="true" /> Redigera profil
                            </NavLink>
                            <NavLink to={`/people/${user.id}/edit`} className="menu-item" role="menuitem">
                                <Heart size={16} aria-hidden="true" /> Min önskeprofil
                            </NavLink>
                            <NavLink to="/children" className="menu-item" role="menuitem">
                                <Baby size={16} aria-hidden="true" /> Mina barn
                            </NavLink>
                            <hr className="menu-divider" />
                            <button type="button" className="menu-item" role="menuitem" onClick={logout}>
                                <LogOut size={16} aria-hidden="true" /> Logga ut
                            </button>
                        </SettingsMenu>
                    </div>
                </div>
            </header>

            <div className="app-sheet">
                <main className="main">
                    <Outlet />
                </main>
            </div>

            {/* Out on the backdrop, below the sheet */}
            <Footer />
        </div>
    );
}
