# Disbox ⬡

Disbox adalah aplikasi desktop penyimpanan awan (cloud storage) modern yang memanfaatkan Discord sebagai media penyimpanan tak terbatas. Dibangun dengan **Electron** dan **React**, Disbox menawarkan pengalaman pengelolaan file yang ringan, aman, dan tersedia untuk **Linux** maupun **Windows**.

![Main UI](preview/file_explorer.png)

## 🚀 Fitur Utama

*   **Penyimpanan Tak Terbatas:** Manfaatkan Discord Webhook untuk menyimpan file tanpa batasan kuota.
*   **Virtual File System:** Kelola file Anda dengan struktur folder, layaknya Google Drive atau Dropbox.
*   **Sistem Chunking Pintar:** File besar otomatis dipecah menjadi bagian-bagian kecil (10MB - 500MB) untuk stabilitas upload sesuai limit akun Discord Anda.
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

Disbox menggunakan **Discord Webhook** sebagai endpoint penyimpanan. Data Anda aman karena tidak ada server perantara (serverless). Metadata file Anda dienkripsi secara ringan dan hanya Anda yang memiliki akses melalui URL Webhook pribadi Anda.

## 🤝 Kontribusi

Laporan bug dan Pull Request sangat kami hargai!
1. Fork repositori.
2. Buat branch fitur (`git checkout -b fitur-keren`).
3. Commit perubahan (`git commit -m 'Menambah fitur keren'`).
4. Push ke branch (`git push origin fitur-keren`).
5. Buat Pull Request.

## 📄 Lisensi

Proyek ini dilisensikan di bawah **MIT License**.
