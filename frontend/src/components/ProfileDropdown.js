import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/layout.css';

const ProfileDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { logout } = useAuth();

  return (
    <div className="profile-dropdown-container">
      <div className="avatar" onClick={() => setIsOpen(!isOpen)}>
        U
      </div>
      {isOpen && (
        <div className="dropdown-menu">
          <Link to="/profile" className="dropdown-item">Profile</Link>
          <Link to="/settings" className="dropdown-item">Settings</Link>
          <div className="dropdown-divider"></div>
          <button onClick={logout} className="dropdown-item logout">Logout</button>
        </div>
      )}
    </div>
  );
};

export default ProfileDropdown;