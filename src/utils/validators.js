// Ported from Ecommerce-sept-1-2026/src/pages/SignupPage/SignupPage.jsx (email
// + signup-password regex) and src/pages/MyProfile/MyProfile.jsx (change-
// password rule). These two screens intentionally use DIFFERENT password
// strictness in the source app — signup requires a letter+digit, change-
// password only requires 8+ chars — and that inconsistency is preserved here
// rather than silently unified, per the "don't change existing behavior
// without asking" migration rule.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Min 8 chars, at least one letter and one number.
const SIGNUP_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export const isValidEmail = (email) => EMAIL_REGEX.test(email || '');

/** Signup password rule: 8+ chars, at least one letter and one digit. */
export const isValidSignupPassword = (password) => SIGNUP_PASSWORD_REGEX.test(password || '');

/** Change-password rule (MyProfile): 8+ chars only, no letter/digit requirement. */
export const isValidNewPassword = (password) => (password || '').length >= 8;

export const passwordsMatch = (password, confirmPassword) => password === confirmPassword;