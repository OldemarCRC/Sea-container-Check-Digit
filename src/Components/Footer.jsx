import React from 'react';

function Footer() {
  return (
    <footer style={{ background: 'white', textAlign: 'center', padding: '20px 0' }}>
      <p>&copy; {new Date().getFullYear()} Check Digit. All rights reserved.</p>
      <p>Powered by Koodi CRC.</p>
    </footer>
  );
}

export default Footer;