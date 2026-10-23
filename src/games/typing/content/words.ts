/*
 * Common words for `words` mode, about two hundred per language, all
 * lowercase and without punctuation.
 */

import type { Lang } from '../../../lib/embed';

const en = `
the be of and a to in he have it that for they with as not on she at by this we you do but from or which
one would all will there say who make when can more if no man out other so what time up go about than into
could state only new year some take come these know see use get like then first any work now may such give
over think most even find day also after way many must look before great back through long where much should
well people down own just because good each those feel seem how high too place little world very still nation
hand old life tell write become here show house both between need mean call develop under last right move thing
general school never same another begin while number part turn real leave might want point form off child few
small since against ask late home interest large person end open public follow during present without again hold
around possible head consider word program problem however lead system set order eye plan run keep face fact
group play stand increase early course change help line
`;

const id = `
yang dan di itu dengan untuk tidak ini dari dalam akan pada juga saya ke karena bisa ada mereka lebih tahun
sudah atau saat oleh menjadi orang kami telah hanya bahwa seperti harus lain baru sangat masih kita banyak apa
jika hari dia setelah belum hal waktu tapi kalau sama besar baik bagi semua sebagai sebuah bagian kerja tempat
rumah jalan anak air kota negara dunia hidup cara lagi mau sendiri sekarang pernah selalu sedang kemudian antara
tetapi maka tanpa sampai setiap mulai ingin perlu membuat memberi melihat datang pergi tahu buat pakai cari baca
tulis makan minum tidur pagi siang malam minggu bulan kecil panjang pendek cepat lambat mudah sulit benar salah
dekat jauh atas bawah depan belakang luar kanan kiri tengah masuk keluar naik turun buka tutup jalan lihat dengar
bicara tanya jawab ajar belajar kerja main pulang tinggal pindah bawa kirim terima simpan hapus ganti ubah coba
pilih mulai selesai tunggu bantu kenal ingat lupa pikir rasa suka cinta teman keluarga guru murid sekolah kantor
pasar toko uang harga murah mahal warna merah putih hitam hijau biru laut gunung pantai pulau langit hujan panas
`;

const list = (text: string) => [...new Set(text.split(/\s+/).filter(Boolean))];

export const words: Record<Lang, string[]> = { en: list(en), id: list(id) };

/** `count` words picked at random, never the same one twice in a row. */
export const pickWords = (lang: Lang, count: number) => {
	const list = words[lang];
	const picked: string[] = [];
	while (picked.length < count) {
		const word = list[Math.floor(Math.random() * list.length)];
		if (word !== picked.at(-1)) picked.push(word);
	}
	return picked;
};
