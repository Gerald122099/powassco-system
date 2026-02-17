// src/components/Navbar.jsx
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react"; // Add useState and useEffect
import logo from "../assets/logo.png";
import "./Navbar.css";

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Add state for mobile menu

  const isActive = (path) => {
    return location.pathname === path;
  };

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.nav-menu') && !e.target.closest('.mobile-menu-btn')) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo" onClick={() => setIsMenuOpen(false)}>
          <img src={logo} alt="Powassco Logo" className="logo" />
          <div className="logo-text">
            <span className="logo-main">POWASSCO</span>
            <span className="logo-sub">Multipurpose Cooperative</span>
          </div>
        </Link>

        {/* Mobile Menu Button - Hamburger Icon */}
        <button 
          className={`mobile-menu-btn ${isMenuOpen ? 'active' : ''}`} 
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>

        {/* Navigation Menu */}
        <ul className={`nav-menu ${isMenuOpen ? 'active' : ''}`}>
          <li className="nav-item">
            <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
              <i className="fas fa-home"></i>
              <span>Home</span>
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/inquiry" className={`nav-link ${isActive('/inquiry') ? 'active' : ''}`}>
              <i className="fas fa-search"></i>
              <span>Inquiry</span>
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/calculator" className={`nav-link ${isActive('/calculator') ? 'active' : ''}`}>
              <i className="fas fa-calculator"></i>
              <span>Tariff Calculator</span>
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/about" className={`nav-link ${isActive('/about') ? 'active' : ''}`}>
              <i className="fas fa-info-circle"></i>
              <span>About</span>
            </Link>
          </li>
          <li className="nav-item">
            {user ? (
              <button onClick={logout} className="nav-link logout-btn">
                <i className="fas fa-sign-out-alt"></i>
                <span>Logout</span>
              </button>
            ) : (
              <Link to="/login" className={`nav-link login-link ${isActive('/login') ? 'active' : ''}`}>
                <i className="fas fa-user-lock"></i>
                <span>Login</span>
              </Link>
            )}
          </li>
        </ul>
      </div>
    </nav>
  );
}