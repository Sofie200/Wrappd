import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Baby, LogOut, Plus, UserPen, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { APP_NAME } from "../config.js";
import Avatar from "./Avatar.jsx";
import ProfileModal from "./ProfileModal.jsx";
import SettingsMenu from "./SettingsMenu.jsx";

export default function Layout() {
    const { user, logout } = useAuth();
    const [editingProfile, setEditingProfile] = useState(false);

    return (
        <div className="app">
            <header className="header">
                <div className="header-inner">
                    <Link to="/" className="logo">
                        <img src="/logo.png" alt={APP_NAME} id="logo" />
                    </Link>

                    <nav className="nav" aria-label="Huvudmeny">
                        <NavLink to="/" end>
                            Översikt
                        </NavLink>
                        <NavLink to="/lists/new" className="nav-cta">
                            <Plus size={16} aria-hidden="true" /> Ny lista
                        </NavLink>
                    </nav>

                    <div className="user-menu">
                        <SettingsMenu
                            label={`Meny för ${user.name}`}
                            title={`${user.name} (@${user.username})`}
                            buttonClassName="profile-button"
                            trigger={<Avatar icon={user.avatarIcon} color={user.avatarColor} />}
                        >
                            <button type="button" className="menu-item" role="menuitem" onClick={() => setEditingProfile(true)}>
                                <UserPen size={16} aria-hidden="true" /> Redigera profil
                            </button>
                            <NavLink to="/groups" className="menu-item" role="menuitem">
                                <Users size={16} aria-hidden="true" /> Mina grupper
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

            {editingProfile && <ProfileModal onClose={() => setEditingProfile(false)} />}

            <main className="main">
                <Outlet />
            </main>
        </div>
    );
}
