# IELTS Reading Practice Platform (IDP Official Computer-Delivered Interface)
### Online Deployment Guide: Netlify + GitHub + Google Sheets + Apps Script

Platform latihan IELTS Reading resmi dengan antarmuka presisi mengikuti **IDP Computer-Delivered IELTS (CD-IELTS) terbaru (2024–2026)**, menggunakan seluruh materi asli **Cambridge IELTS 1** (Standard 40 Soal), sistem autentikasi kandidat multi-user, dan database cloud berbasis Google Sheets.

---

## 🏗️ Arsitektur Sistem

```
+-------------------------------------------------------------+
|                 FRONTEND (HOSTING NETLIFY)                  |
|  - HTML5, CSS3 (IDP Official Theme), JavaScript Vanilla      |
|  - 100% Statis, Super Cepat, Gratis Selamanya, HTTPS Aman    |
|  - Evaluasi IELTS Band Score Otomatis di Browser             |
+------------------------------+------------------------------+
                               |
                   Fetch API (JSON/Text)
                               |
                               v
+-------------------------------------------------------------+
|              BACKEND (GOOGLE APPS SCRIPT WEB APP)           |
|  - Router REST API: Login, Record Score, Get History        |
|  - Endpoint /exec publik tanpa server berbayar              |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                 DATABASE (GOOGLE SPREADSHEET)               |
|  - Sheet "user"   : Manajemen Username, Password & Nama     |
|  - Sheet "scores" : Catatan Tanggal, Benar, Salah, Band     |
+-------------------------------------------------------------+
```

---

## 📋 PANDUAN LENGKAP & URUT DARI AWAL HINGGA ONLINE

Ikuti 6 langkah mudah berikut secara berurutan:

---

### LANGKAH 1: Buat Google Spreadsheet & Pasang Apps Script

1. Buka [Google Drive](https://drive.google.com/) Anda dan buat **Google Spreadsheet Baru**.
2. Beri nama file spreadsheet Anda, misalnya: `IELTS Practice Database`.
3. Pada menu atas spreadsheet, klik menu **Extensions** (Ekstensi) &rarr; **Apps Script**.
4. Akan terbuka tab baru Google Apps Script.
5. Hapus semua kode default (`function myFunction() { ... }`).
6. Buka file **[`google_apps_script.js`](./google_apps_script.js)** yang ada di folder project ini, **copy seluruh isinya**, lalu **paste** ke editor Apps Script tersebut.
7. Klik ikon **Save** (Disket) atau tekan `Ctrl + S`.

---

### LANGKAH 2: Deploy Google Apps Script sebagai Web App

1. Di halaman Apps Script, klik tombol biru **Deploy** di pojok kanan atas &rarr; pilih **New deployment**.
2. Di samping kiri *Select type*, klik ikon gerigi ⚙️ &rarr; pilih **Web app**.
3. Isi konfigurasinya sebagai berikut:
   * **Description**: `IELTS Backend API`
   * **Execute as**: `Me (email-anda@gmail.com)`
   * **Who has access**: **`Anyone`** *(PENTING: Wajib pilih Anyone agar website Netlify dapat mengakses API tanpa error izin).*
4. Klik tombol **Deploy**.
5. Jika muncul jendela pop-up perizinan akun Google:
   * Klik **Authorize access**.
   * Pilih akun Google Anda.
   * Jika muncul peringatan *"Google hasn't verified this app"*, klik **Advanced** di kiri bawah &rarr; lalu klik **Go to Untitled project (unsafe)**.
   * Klik tombol **Allow**.
6. Setelah selesai, akan muncul kotak **Deployment successfully updated**.
7. **Copy URL Web App** yang berakhiran **`/exec`**.
   *(Contoh URL: `https://script.google.com/macros/s/AKfycbx.../exec`)*.

---

### LANGKAH 3: Hubungkan URL Web App ke File Konfigurasi Frontend

1. Buka folder project Anda di komputer, lalu buka file:
   **`static/js/config.js`**
2. Cari bagian `APPS_SCRIPT_URL`, lalu ganti dengan URL yang Anda copy dari Langkah 2:
   ```javascript
   const CONFIG = {
     // Paste URL Web App Anda di sini:
     APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbx.../exec",
     ...
   };
   ```
3. Simpan file (`Ctrl + S`).

> **Catatan:**
> Begitu skrip pertama kali dijalankan, Google Apps Script akan **otomatis membuatkan 2 Sheet di Spreadsheet Anda**:
> - Sheet **`user`**: Otomatis terisi akun `defitta` (password: `12345`) dan `marshal` (password: `12345`).
> - Sheet **`scores`**: Otomatis membuat kolom pencatatan waktu, nama, benar, salah, band score, dll.

---

### LANGKAH 4: Upload Project ke GitHub Repository

1. Buat repositori baru di [GitHub](https://github.com/new):
   * Beri nama repo, misalnya: `ielts-practice-platform`.
   * Pilih opsi **Public** atau **Private** (bebas).
   * Jangan centang *Add a README file* (karena file sudah ada).
   * Klik **Create repository**.
2. Buka terminal atau PowerShell di folder project (`d:\00. Pribadi\ielts-defitta`), lalu jalankan perintah berikut secara berurutan:
   ```bash
   git init
   git add .
   git commit -m "Feat: Complete IDP IELTS Platform with Auth and Google Sheets"
   git branch -M main
   git remote add origin https://github.com/USERNAME_ANDA/ielts-practice-platform.git
   git push -u origin main
   ```
   *(Ganti `USERNAME_ANDA` dengan username akun GitHub Anda).*

---

### LANGKAH 5: Deploy Gratis di Netlify (Langsung Aktif dalam 1 Menit)

1. Buka situs [Netlify](https://www.netlify.com/) dan lakukan login (bisa langsung login menggunakan akun GitHub Anda).
2. Di dashboard Netlify, klik tombol **Add new site** &rarr; pilih **Import an existing project**.
3. Pilih penyedia Git: **GitHub**.
4. Cari dan pilih repositori Anda (`ielts-practice-platform`).
5. Pada bagian **Build settings**:
   * **Branch to deploy**: `main`
   * **Base directory**: *(Biarkan kosong)*
   * **Build command**: *(Biarkan kosong)*
   * **Publish directory**: `.` *(Ketik titik atau biarkan default root)*
6. Klik tombol **Deploy site**.
7. Tunggu sekitar 10–20 detik. Website Anda akan langsung berstatus **Published**!
8. Anda akan mendapatkan URL publik gratis dari Netlify, misalnya:
   `https://ielts-practice-defitta.netlify.app`
   *(Nama domain ini bisa diganti sesuai keinginan di menu **Site configuration** &rarr; **Change site name**).*

---

### LANGKAH 6: Cara Menambah User Baru & Melihat Hasil Skor

#### A. Cara Menambah User Baru di Spreadsheet
1. Buka Google Spreadsheet Anda.
2. Buka tab sheet bernama **`user`**.
3. Tambahkan baris baru di bawahnya:
   | Username | Password | Nama Tampilan | Role | Tanggal Dibuat |
   | :--- | :--- | :--- | :--- | :--- |
   | `defitta` | `12345` | Defitta | Candidate | 08/11/2026 |
   | `marshal` | `12345` | Marshal | Candidate | 08/11/2026 |
   | `budi` | `rahasia123` | Budi Santoso | Candidate | 08/11/2026 |
4. Begitu Anda ketik di Google Sheets, user tersebut **langsung bisa login detik itu juga** di website Netlify!

#### B. Cara Melihat Catatan Skor Semua Peserta (Admin View)
1. Buka tab sheet bernama **`scores`** di Spreadsheet Anda.
2. Setiap kali peserta mengklik tombol **Finish Test**, baris baru akan otomatis tercatat berisi:
   * Waktu pengerjaan (WIB)
   * Username & Nama Kandidat
   * Nama Tes (misal: *Academic Practice Test 1*)
   * Jumlah Benar (*Raw Score*)
   * Jumlah Salah & Kosong
   * IELTS Band Score (1.0 – 9.0)
   * CEFR Level (C2, C1, B2, B1, dll.)
   * Durasi pengerjaan waktu

#### C. Cara Peserta Melihat Riwayat Mereka Sendiri
* Pada halaman Dashboard website Netlify, peserta cukup mengklik tombol **`📜 Riwayat Latihan (History)`**.
* Pop-up riwayat latihan akan muncul menampilkan ringkasan:
  * Total berapa kali latihan
  * Skor Band tertinggi yang pernah dicapai
  * Rata-rata skor
  * Tabel riwayat lengkap tanggal, jam, benar/salah, dan IELTS Band masing-masing tes!

---

## 💻 Menjalankan Secara Lokal (Offline)

Jika ingin membuka secara lokal di laptop sendiri tanpa koneksi internet:
1. Double-click file **[`run.bat`](./run.bat)**.
2. Browser akan terbuka otomatis di `http://127.0.0.1:5000`.
3. Anda bisa login menggunakan akun bawaan:
   * Username: `defitta` | Password: `12345`
   * Username: `marshal` | Password: `12345`
