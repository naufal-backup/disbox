# Disbox ⬡

Disbox adalah aplikasi desktop penyimpanan awan (cloud storage) modern yang memanfaatkan Discord sebagai media penyimpanan tak terbatas. Dibangun dengan **Electron** dan **React**, Disbox menawarkan pengalaman pengelolaan file yang ringan, aman, dan tersedia untuk **Linux** maupun **Windows**.

![Main UI](preview/file_explorer.png)

## 🚀 Fitur Utama

*   **Penyimpanan Tak Terbatas:** Manfaatkan Discord Webhook untuk menyimpan file tanpa batasan kuota.
*   **virtual File System:** Kelola file Anda dengan struktur folder, layaknya Google Drive atau Dropbox.
*   **SQLite Engine:** Metadata kini dikelola menggunakan SQLite untuk pencarian dan navigasi folder yang jauh lebih cepat (hingga 80% lebih efisien dibanding JSON).
*   **Enkripsi AES-GCM:** [BARU] Keamanan tingkat tinggi untuk setiap file dan folder dengan enkripsi *end-to-end* menggunakan kunci yang diturunkan dari URL Webhook Anda.
*   **Sistem Kunci (Locking) v3.0:** [BARU] Lindungi file sensitif dengan Master PIN. Fitur buka kunci kini mendukung penempatan ke folder tujuan manapun, termasuk direktori *root*.
*   **Multi-Snapshot Rolling:** Sistem cadangan otomatis yang menyimpan 3 snapshot metadata terakhir di Discord. Jika satu pesan metadata terhapus, data Anda tetap aman.
*   **Sistem Chunking Pintar:** File besar otomatis dipecah menjadi bagian-bagian kecil (10MB - 500MB) untuk stabilitas upload sesuai limit akun Discord Anda.
*   **Sinkronisasi Antar Perangkat:** Sinkronisasi metadata otomatis yang memungkinkan pengelolaan file secara bersamaan antara versi Desktop dan Mobile.
*   **Polling Latar Belakang:** Aplikasi secara otomatis mendeteksi perubahan yang dilakukan di perangkat lain setiap 30 detik tanpa perlu refresh manual.
*   **Multi-Platform:** Dukungan penuh untuk sistem operasi Linux dan Windows.
*   **Pratinjau File Langsung:**
    *   **Gambar:** PNG, JPG, WebP, SVG.
    *   **Media:** Pemutar Video dan Audio bawaan.
    *   **Dokumen:** Viewer PDF terintegrasi.
    *   **Kode:** *Syntax Highlighting* untuk berbagai bahasa pemrograman (JS, Python, Rust, dll).
*   **Sinkronisasi Metadata:** Metadata disimpan secara lokal dan disinkronkan ke Discord untuk akses antar perangkat.
*   **Mode Gelap/Terang:** Antarmuka modern yang dapat disesuaikan dengan preferensi Anda.

## 📸 Cuplikan Layar

| Login Page | File Explorer |
|:---:|:---:|
| ![Login](preview/login_page.png) | ![Drive](preview/file_explorer.png) |

| Document Viewer | Context Menu |
|:---:|:---:|
| ![Preview](preview/preview_documents.png) | ![Context](preview/right_click.png) |

## 🛠 Prasyarat

Pastikan sistem Anda memiliki komponen berikut:
*   **Node.js** (v18 atau lebih baru)
*   **npm** atau **yarn**

## ⚙️ Instalasi
   **Automatic Install**
    [Releases](https://github.com/naufal-backup/disbox/releases)
1.  **Kloning repositori ini:**
    ```bash
    git clone https://github.com/naufal-backup/disbox-linux.git
    cd disbox-linux
    ```

2.  **Instal dependensi:**
    *   **Linux:**
        ```bash
        chmod +x setup.sh
        ./setup.sh
        ```
    *   **Windows / Umum:**
        ```bash
        npm install
        ```

## 🖥 Penggunaan

### Mode Pengembangan
Jalankan aplikasi dalam mode pengembangan dengan fitur *hot-reload*:
```bash
npm run dev
```

### Build Aplikasi (Produksi)
Untuk membuat paket aplikasi siap pakai:
```bash
npm run build
```
Hasil build akan tersedia di folder `release/`:
*   **Linux:** `.AppImage` dan `.deb`
*   **Windows:** `.exe` (Setup), Portable, dan `.zip`

## 🔒 Keamanan & Privasi

Disbox menggunakan **Discord Webhook** sebagai endpoint penyimpanan. Data Anda aman karena tidak ada server perantara (serverless). 

**Penyimpanan Lokal (v2.1+):**
Aplikasi kini bermigrasi secara otomatis dari file JSON datar ke **SQLite Database** (`disbox.db`) untuk integritas data yang lebih baik. File JSON lama akan diubah menjadi `.bak` secara otomatis saat pertama kali dijalankan.

Metadata file Anda dienkripsi secara ringan dan hanya Anda yang memiliki akses melalui URL Webhook pribadi Anda.

## 🤝 Kontribusi

Laporan bug dan Pull Request sangat kami hargai!
1. Fork repositori.
2. Buat branch fitur (`git checkout -b fitur-keren`).
3. Commit perubahan (`git commit -m 'Menambah fitur keren'`).
4. Push ke branch (`git push origin fitur-keren`).
5. Buat Pull Request.

## 📄 Lisensi

Proyek ini dilisensikan di bawah **MIT License**.

---

**Developed by Naufal Gastiadirrijal Fawwaz Alamsyah**
*   GitHub: [naufal-backup](https://github.com/naufal-backup)
*   LinkedIn: [Naufal Alamsyah](https://www.linkedin.com/in/naufal-gastiadirrijal-fawwaz-alamsyah-a34b43363)
*   Email: naufalalamsyah453@gmail.com
