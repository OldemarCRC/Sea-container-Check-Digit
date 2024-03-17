/*"Modulus 11 Algorithm" to calculate the check digit of a shipping container*/

import React, { useState } from "react";

function CheckDigit() {
  const [containerNr, setContainerNr] = useState("");
  const [checkDigit, setCheckDigit] = useState("");
  const [containerNrVerified, setContainerNrVerified] = useState("");

  // Objeto con los valores para cada letra
  const letterValues = {
    A: 10,
    B: 12,
    C: 13,
    D: 14,
    E: 15,
    F: 16,
    G: 17,
    H: 18,
    I: 19,
    J: 20,
    K: 21,
    L: 23,
    M: 24,
    N: 25,
    O: 26,
    P: 27,
    Q: 28,
    R: 29,
    S: 30,
    T: 31,
    U: 32,
    V: 34,
    W: 35,
    X: 36,
    Y: 37,
    Z: 38,
  };

  const calculateCheckDigit = (containerNumber) => {
    let summa = 0;
    const upperContainerNumber = containerNumber.toUpperCase();
    const letters = upperContainerNumber.slice(0, 4);
    const digits = upperContainerNumber.slice(4, 10);
    let ii = 1;

    // Calcula la suma para las letras utilizando el objeto letterValues
    for (let ka = 0; ka < letters.length; ka++) {
      summa += (letterValues[letters[ka]] || 0) * ii;
      ii *= 2;
    }

    // Calcula la suma para los dígitos
    for (let ka = 0; ka < digits.length; ka++) {
      summa += parseInt(digits[ka], 10) * ii;
      ii *= 2;
    }

    const mod = summa % 11;
    const difference = mod === 10 ? 0 : mod; // El dígito de verificación es 0 si el módulo es 10
    return difference;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const calculatedCheckDigit = calculateCheckDigit(containerNr);
    setCheckDigit(calculatedCheckDigit);
    setContainerNrVerified(containerNr + calculatedCheckDigit);
  };

  const handleInputChange = (event) => {
    const upperCaseValue = event.target.value.toUpperCase();
    setContainerNr(upperCaseValue);
  };

  return (
    <div className="container-verification">
      <h1>Container Check Digit Verification</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={containerNr}
          onChange={handleInputChange}
          placeholder="Container ID"
        />
        <div className="submit-button">
          <button type="submit">Check</button>
        </div>
      </form>
      <p>Check Digit: {checkDigit}</p>
      <p>Container Number: {containerNrVerified}</p>
    </div>
  );
}

export default CheckDigit;
