import { Link, NavLink, Outlet } from "react-router-dom";
import { Baby, Gift, Heart, House, ListChecks, LogOut, Menu, Plus, TreePine, UserPen, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { APP_NAME } from "../config.js";
import Avatar from "./Avatar.jsx";
import SettingsMenu from "./SettingsMenu.jsx";

export default function Layout() {
    const { user, logout } = useAuth();

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
                            <Plus size={16} aria-hidden="true" /> Ny lista
                        </NavLink>
                        <NavLink to="/santa/new" className="nav-cta">
                            <TreePine size={16} aria-hidden="true" /> Secret Santa
                        </NavLink>
                    </nav>

                    <div className="user-menu">
                        <SettingsMenu label="Meny" icon={Menu}>
                            <NavLink to="/groups" className="menu-item" role="menuitem">
                                <Users size={16} aria-hidden="true" /> Grupper
                            </NavLink>
                            <NavLink to="/lists" end className="menu-item" role="menuitem">
                                <ListChecks size={16} aria-hidden="true" /> Listor
                            </NavLink>
                            <NavLink to="/gifts" end className="menu-item" role="menuitem">
                                <Gift size={16} aria-hidden="true" /> Gåvor
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
        </div>
    );
}
