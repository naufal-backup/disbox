# Disbox ⬡ (Cloud-Native Edition)

Disbox adalah aplikasi desktop penyimpanan awan (cloud storage) modern yang memanfaatkan Discord sebagai media penyimpanan tak terbatas. Disbox kini hadir dengan arsitektur **Cloud-Native Database-First**, di mana seluruh struktur file Anda dikelola secara efisien menggunakan **Supabase**, memberikan performa yang jauh lebih cepat dan andal.

![Main UI](preview/file_explorer.png)

## 🚀 Fitur Utama

*   **☁️ Cloud-Native Architecture (Supabase):** [BARU] Struktur folder dan file kini disimpan secara teratur di database Cloud. Tidak lagi bergantung pada file JSON manual di Discord untuk memuat drive.
*   **🔐 3-Mode Login System:** [BARU]
    1.  **Masuk dengan Akun:** Sinkronisasi otomatis seluruh perangkat menggunakan Username & Password.
    2.  **Daftar Akun Baru:** Buat profil cloud baru dan amankan profil drive Anda.
    3.  **Setup Baru (Guest):** Akses cepat hanya menggunakan Webhook (Metadata disimpan secara lokal & otomatis termigrasi ke Cloud Database).
*   **🛡️ Keamanan Maksimal:**
    *   **Password Hashing:** Password disimpan menggunakan algoritma SHA-256 yang aman.
    *   **Webhook Encryption:** URL Webhook Anda dienkripsi menggunakan AES-256 (Server-side) sebelum disimpan di database.
    *   **Client-side Encryption:** Seluruh struktur drive dienkripsi di sisi klien menggunakan kunci yang diturunkan dari Webhook Anda.
*   **👤 Manajemen Profil:** Kelola banyak akun drive dan pindah antar akun secara instan melalui sistem *badge* profil.
*   **⚡ Sinkronisasi Latar Belakang:** Setiap perubahan (buat folder, upload, hapus) otomatis tersinkronisasi ke Cloud di latar belakang tanpa mengganggu aktivitas Anda.
*   **Virtual File System:** Kelola file Anda dengan struktur folder yang rapi, layaknya Google Drive atau Dropbox.
*   **Dukungan Multi-Bahasa:** Tersedia dalam bahasa **Indonesia**, **English**, dan **Mandarin (China)**.
*   **Pratinjau File Langsung:** Dukungan Gambar, Video, Audio, PDF, dan Kode (*Syntax Highlighting*).

## 🌍 Lokalisasi

Disbox mendukung pengaturan bahasa secara dinamis:
- 🇮🇩 **Indonesia** (Default)
- 🇺🇸 **English**
- 🇨🇳 **Mandarin (China)**

## 📸 Cuplikan Layar

| Login Page | File Explorer |
|:---:|:---:|
| ![Login](preview/login_page.png) | ![Drive](preview/file_explorer.png) |

| Document Viewer | Context Menu |
|:---:|:---:|
| ![Preview](preview/preview_documents.png) | ![Context](preview/right_click.png) |

## ⚙️ Instalasi

1.  **Kloning repositori ini:**
    ```bash
    git clone https://github.com/naufal-backup/disbox.git
    cd disbox
    ```

2.  **Instal dependensi:**
    ```bash
    npm install
    ```

3.  **Jalankan aplikasi:**
    ```bash
    npm run dev
    ```

## 🖥 Build Aplikasi (Produksi)
Untuk membuat paket aplikasi siap pakai:
```bash
npm run build
```
Hasil build akan tersedia di folder `release/` untuk Linux (.AppImage, .deb) dan Windows (.exe).

## 🔒 Keamanan & Privasi

Disbox memprioritaskan keamanan data Anda. Dengan sistem **Database-First**, metadata Anda kini lebih tahan banting terhadap penghapusan pesan di Discord. Discord kini murni berfungsi sebagai "Gudang Chunks", sementara "Otak" drive Anda berada di database Cloud yang aman.

## 🤝 Kontribusi

Laporan bug dan Pull Request sangat kami hargai!

## 💰 Support

https://saweria.co/Naufal453

## 📄 Lisensi

Proyek ini dilisensikan di bawah **MIT License**.

---

**Developed by Naufal Gastiadirrijal Fawwaz Alamsyah**
