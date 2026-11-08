/**
 * IELTS Platform Global Configuration
 * -------------------------------------------------------------
 * Masukkan URL Web App Google Apps Script Anda di APPS_SCRIPT_URL.
 * Panduan deploy ada di README.md & google_apps_script.js.
 */
const CONFIG = {
  // Ganti URL di bawah ini dengan URL Web App Google Apps Script Anda (akhiran /exec):
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbx5ZGAqKZ-W2EMePQjB2vFNIBlKbvppw8Vg5YsIKx_CtO7UNPGY2MBHRxPrTQUJoIr0/exec",

  // Akun cadangan (Offline Fallback) jika Apps Script belum terhubung atau saat offline:
  OFFLINE_USERS: [
    { username: "defitta", password: "12345", displayName: "Defitta", role: "Candidate" },
    { username: "marshal", password: "12345", displayName: "Marshal", role: "Candidate" }
  ]
};

window.CONFIG = CONFIG;

