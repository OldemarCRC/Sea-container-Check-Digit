import React from 'react';
import './header.css';
import logo from "./check-1.png"

function Header() {
  return (
    <header className="header">
      <img src={logo} alt="check-digit" />
    </header>
  );
}

export default Header;