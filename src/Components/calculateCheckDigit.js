const calculateCheckDigit = (containerNumber) => {
  const letterValues = {
    A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
    K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30,
    T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
  };
  let sum = 0;
  const upperContainerNumber = containerNumber.toUpperCase();
  const letters = upperContainerNumber.slice(0, 4);
  const digits = upperContainerNumber.slice(4, 10);
  let factor = 1;

  for (let i = 0; i < letters.length; i++) {
    sum += (letterValues[letters[i]] || 0) * factor;
    factor *= 2;
  }

  for (let i = 0; i < digits.length; i++) {
    sum += parseInt(digits[i], 10) * factor;
    factor *= 2;
  }

  const mod = sum % 11;
  const checkDigit = mod === 10 ? 0 : mod; // if mod = 10 then checkdigit is 0

  return checkDigit;
};

export default calculateCheckDigit;
