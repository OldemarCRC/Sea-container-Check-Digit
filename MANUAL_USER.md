# User Manual: ContainerCheck (ISO 6346 Check Digit Validator)

## Introduction

ContainerCheck verifies shipping container numbers against the **ISO 6346** standard. It can:

- **calculate** the check digit of a 10-character number,
- **verify** an 11-character number and suggest the correct digit if it is wrong,
- **validate whole lists** at once and export the results.

The app runs entirely in your browser. Nothing you type is sent to a server or saved.

Open it at **https://oldemarcrc.github.io/Sea-container-Check-Digit/**

---

## Container number format

A container number has 11 characters, for example `CSQU 305438 3`:

| Part | Length | Example | Meaning |
|---|---|---|---|
| Owner code (BIC) | 3 letters | `CSQ` | Registered owner |
| Category identifier | 1 letter | `U` | `U` freight container · `J` detachable freight equipment · `Z` trailer or chassis |
| Serial number | 6 digits | `305438` | Assigned by the owner |
| Check digit | 1 digit | `3` | Calculated from the first 10 characters |

Spaces, hyphens, dots and slashes are ignored, so `CSQU 305438-3` and `CSQU3054383` are the same number. Lowercase is converted to uppercase automatically.

---

## Single mode

Use it to check one number with live feedback.

1. Make sure the **Single** tab is selected. It is selected by default.
2. Type or paste the container number into the input field. The status updates as you type:
   - **Fewer than 10 characters**: a progress bar shows how many characters are left.
   - **10 characters**: the app **calculates** the check digit and shows the complete number (blue).
   - **11 characters, correct**: **Valid container number** (green).
   - **11 characters, wrong digit**: **Invalid check digit** (red), with the expected digit and the correct number. Click **Use corrected** to replace your input.
   - **Format problem**: for example a digit where a letter should be, or a category other than U, J or Z. An amber message explains what is wrong, and the affected box in the breakdown panel is highlighted.
3. The **breakdown panel** shows each part of the number separately. The **container marking** plate shows it as painted on a real container, with the check digit in a box.
4. Open **Step-by-step calculation** to see how the digit was computed.

**Buttons and shortcuts**

| Action | How |
|---|---|
| Copy the complete, correct number | **Copy result** |
| Clear the input | **Clear** or `Esc` |
| Load a sample | **Try example: CSQU305438-3** |

---

## Bulk mode

Use it to check many numbers at once.

1. Click the **Bulk** tab.
2. Paste your numbers into the text area, separated by **new lines, commas, semicolons or tabs**. You can paste a column straight from Excel. The counter in the top-right shows how many entries were detected.
3. Click **Validate all** or press `Ctrl + Enter` (`Cmd + Enter` on Mac).
4. Review the results:
   - **Counters**: Total, Valid, Invalid, Missing digit, Malformed.
   - **Filters**: show All, Valid, Invalid, Missing or Malformed entries.
   - **Table**: for each entry, its status, the entered and expected check digit, and the correct number. A **DUP** label marks numbers that appear more than once.

| Status | Meaning |
|---|---|
| ✅ Valid | The check digit is correct |
| ❌ Invalid | The check digit is wrong. The correct number is shown |
| ➕ Missing digit | 10 characters were entered. The check digit was added |
| ⚠️ Malformed | Wrong length or format. The reason is shown under the status |

5. Export the results:
   - **Copy as CSV**: copies the full table so you can paste it into Excel or Google Sheets.
   - **Download CSV**: saves `container-check-results.csv`.
   - **Copy corrected**: copies every number that is valid or could be fixed, one per line, with the correct check digit.
   - The copy icon on a row copies that single number.

**Limits:** up to 2,000 entries (50,000 characters) per run. If you paste more, a notice appears and the extra entries are skipped. Split very large lists into several runs.

**Load sample** fills the text area with example numbers that show every status. **Clear** empties the text area and the results.

---

## Other features

- **Dark mode**: the app follows your system theme. Use the moon or sun button in the top-right to switch it for the current visit.
- **Shareable links**:
  - `https://oldemarcrc.github.io/Sea-container-Check-Digit/?c=CSQU3054383` opens Single mode with that number filled in.
  - `https://oldemarcrc.github.io/Sea-container-Check-Digit/#bulk` opens Bulk mode directly.
- **Install as an app**: in Chrome or Edge, use **Install app** in the address bar. On a phone, use **Add to Home Screen**. Once installed, it also works offline.

---

## Privacy

- All validation happens locally in your browser.
- The app does not use cookies, localStorage or any other storage. Closing or reloading the page discards everything you entered.
- There is no tracking or analytics, and the app loads no third-party resources.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Format error" on a number that looks right | Check for the letter **O** instead of the digit **0** (or **I** instead of **1**). The first 4 characters must be letters and the next 7 must be digits. |
| "… is not a valid category" | The 4th character must be **U**, **J** or **Z**. |
| "Too short" in Bulk mode | The entry has fewer than 10 characters after removing spaces and hyphens. |
| Copy buttons don't work | Your browser may block clipboard access. Allow it for this site, or use **Download CSV** instead. |
| The page looks outdated after an update | Press `Ctrl + F5` (`Cmd + Shift + R` on Mac) to reload without the cache. |
| The page is blank | Enable JavaScript. Also note that, for security, the app does not display inside frames or iframes on other websites; open the link directly. |

---

## Support

For support or questions, contact **oldemar.chaves@gmail.com** or open an issue at https://github.com/OldemarCRC/Sea-container-Check-Digit/issues.

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md).
