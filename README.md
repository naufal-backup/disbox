Disbox-Linux
==================================================

Disbox-Linux adalah klien penyimpanan file berbasis Command Line Interface (CLI) untuk Linux yang memanfaatkan Discord sebagai media penyimpanan (cloud storage). Dibangun menggunakan Linux Shell Script untuk memastikan performa yang ringan dan integrasi sistem yang mulus.


FITUR UTAMA
--------------------------------------------------
* Ringan & Native: Ditulis menggunakan Bash, meminimalisir kebutuhan resource berlebih.
* Integrasi API Discord: Memanfaatkan Webhook atau Bot Discord untuk proses upload dan download file.
* Otomatisasi Mudah: Sangat mudah diintegrasikan dengan cron jobs atau script backup Linux lainnya.


PRASYARAT
--------------------------------------------------
Pastikan utilitas berikut telah terpasang di sistem Linux kamu:
* bash (v4.0+)
* curl (Untuk komunikasi dengan API Discord)
* jq (Opsional: Untuk parsing respons JSON dari API)


INSTALASI
--------------------------------------------------
Kloning repositori ini dan berikan hak akses eksekusi pada script utama.

1. git clone https://github.com/naufal-backup/disbox-linux.git
2. cd disbox-linux
3. chmod +x disbox.sh


KONFIGURASI
--------------------------------------------------
1. Salin contoh file konfigurasi yang tersedia:
   cp config.example.env config.env

2. Edit config.env dan masukkan parameter yang diperlukan (seperti URL Webhook atau Token Bot):
   DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/xxxx/yyyy"


PENGGUNAAN
--------------------------------------------------
Skrip ini dijalankan langsung melalui terminal. Berikut adalah beberapa contoh perintah dasar:

* Mengunggah File:
  ./disbox.sh upload /path/to/local/file.zip

* Mengunduh File:
  ./disbox.sh download <file_id> /path/to/destination/

* Melihat Daftar File:
  ./disbox.sh list


KONTRIBUSI
--------------------------------------------------
Kontribusi, laporan bug, dan pull request sangat dipersilakan. 
1. Fork repositori ini.
2. Buat branch fitur baru (git checkout -b fitur-keren).
3. Lakukan commit (git commit -m 'Menambahkan fitur keren').
4. Push ke branch (git push origin fitur-keren).
5. Buat Pull Request.


LISENSI
--------------------------------------------------
MIT License