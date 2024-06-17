import React from 'react';

function Footer() {
  return (
    <footer style={{ background: 'white', textAlign: 'center', padding: '20px 0' }}>
      <p>&copy; {new Date().getFullYear()} Jose Oldemar Chaves Urbina. All rights reserved.</p>
    </footer>
  );
}

export default Footer;
