use std::io::Cursor;
use std::io::Write;
use zip::CompressionMethod;
use zip::ZipWriter;
use zip::write::SimpleFileOptions;

pub const JPEG_BYTES: [u8; 8] = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46];

pub fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, bytes) in entries {
        writer.start_file(*name, options).unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

pub fn manifest_json(files: &[&str]) -> String {
    let mut chapters = Vec::new();
    for (index, file) in files.iter().enumerate() {
        chapters.push(format!(
            "{{\"file\":\"{file}\",\"title\":\"Chapter {}\"}}",
            index + 1
        ));
    }
    format!(
        "{{\"formatVersion\":1,\"title\":\"Sample\",\"author\":\"Someone\",\"lang\":\"zh\",\
         \"cover\":\"cover.jpg\",\"chapters\":[{}]}}",
        chapters.join(",")
    )
}

pub fn sample_package(chapter_count: usize) -> Vec<u8> {
    let names: Vec<String> = (1..=chapter_count)
        .map(|index| format!("chapters/{index:03}.txt"))
        .collect();
    let files: Vec<&str> = names.iter().map(String::as_str).collect();
    let manifest = manifest_json(&files);
    let text =
        "\u{534E}\u{706F}\u{521D}\u{4E0A}\r\n\r\nSecond line here\n \n\u{7B2C}\u{4E09}\u{6BB5}\r\n";
    let mut entries: Vec<(&str, &[u8])> = vec![
        ("manifest.json", manifest.as_bytes()),
        ("cover.jpg", &JPEG_BYTES),
    ];
    for name in &names {
        entries.push((name.as_str(), text.as_bytes()));
    }
    zip_bytes(&entries)
}
