import React from 'react';
import './App.css';
import ContainerVerificationNr from './Components/ContainerVerificationNr';
import Footer from './Components/Footer';
import Header from './Components/Header';

function App() {
  return (
    <div className="App">
      <Header />
      <ContainerVerificationNr />
      <Footer />
    </div>
  );
}

export default App;