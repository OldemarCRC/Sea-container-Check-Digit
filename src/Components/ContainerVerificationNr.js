import React, { useState } from "react";
import calculateCheckDigit from "./calculateCheckDigit.js";

function ContainerVerificationNr() {
  const [inputText, setInputText] = useState("");
  const [results, setResults] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

  const handleInputChange = (event) => {
    setInputText(event.target.value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setErrorMessage("");

    // Splits input text into separate lines
    const containerLines = inputText.trim().split(/\r?\n/);

    // Checks each line to make sure it meets the expected format
    const newResults = containerLines.map((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine.length !== 11) {
        setErrorMessage("Invalid formatting on one or more lines.");
        return {
          containerNr: trimmedLine,
          isValid: false,
          message: "Invalid format",
        };
      }
      const actualCheckDigit = parseInt(trimmedLine.slice(-1), 10);
      const calculatedCheckDigit = calculateCheckDigit(
        trimmedLine.slice(0, -1)
      );
      return {
        containerNr: trimmedLine,
        actualCheckDigit,
        calculatedCheckDigit,
        isValid: actualCheckDigit === calculatedCheckDigit,
      };
    });

    if (!errorMessage) {
      setResults(newResults);
    }
  };

  const handleClear = () => {
    setInputText("");
    setResults([]);
    setErrorMessage("");
  };

  return (
    <div className="container-verification">
      <h1>Sea container Check-digit verification</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          value={inputText}
          onChange={handleInputChange}
          placeholder="Enter container numbers separated by new lines with format: ABCU1234567"
          rows="10"
          cols="50"
        />
        <div className="buttons">
          <button type="submit" className="button">Check</button>
          <button type="button" className="button" onClick={handleClear}>Clear</button>
        </div>
      </form>
      {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
      <div className="results">
        {results.map((result, index) => (
          <p key={index} style={{ color: result.isValid ? "green" : "red" }}>
            {result.containerNr}:{" "}
            {result.isValid
              ? "Valid"
              : `Invalid (Should be ${
                  result.containerNr.slice(0, -1) + result.calculatedCheckDigit
                })`}
          </p>
        ))}
      </div>
    </div>
  );
}

export default ContainerVerificationNr;
