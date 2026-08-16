use std::path::Path;

use base64::Engine;
use serde::Serialize;

pub const IMAGE_MIMES: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
];

pub const INGEST_JS: &str = include_str!("../../../ui/inject/ingest.js");

#[derive(Debug, Clone, Serialize)]
pub struct ClipboardFile {
    pub name: String,
    #[serde(rename = "type")]
    pub mime: String,
    pub b64: String,
}

pub fn is_image_mime(mime: &str) -> bool {
    let mime = mime.split(';').next().unwrap_or(mime).trim().to_ascii_lowercase();
    let mime = if mime == "image/jpg" {
        "image/jpeg"
    } else {
        mime.as_str()
    };
    IMAGE_MIMES.contains(&mime) || mime == "image/jpeg"
}

pub fn filename_for_mime(mime: &str, index: usize) -> String {
    let mime = mime.split(';').next().unwrap_or(mime).trim().to_ascii_lowercase();
    let ext = match mime.as_str() {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/tiff" => "tiff",
        _ => "png",
    };
    if index == 0 {
        format!("clipboard.{ext}")
    } else {
        format!("clipboard-{}.{ext}", index + 1)
    }
}

pub fn build_ingest_call(files: &[ClipboardFile]) -> String {
    let payload = serde_json::to_string(files).unwrap_or_else(|_| "[]".into());
    format!("window.__dshDesktopPasteFiles && window.__dshDesktopPasteFiles({payload});")
}

pub fn parse_uri_list(payload: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for raw in payload.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(rest) = line.strip_prefix("file:") {
            if let Ok(url) = url_parse_file(rest) {
                paths.push(url);
            }
        } else if line.starts_with('/') {
            paths.push(line.to_string());
        }
    }
    paths
}

fn url_parse_file(rest: &str) -> Result<String, ()> {
    // file:///home/me/Pictures/shot.png or file://localhost/home/...
    let uri = if rest.starts_with("//") {
        format!("file:{rest}")
    } else {
        format!("file:{rest}")
    };
    let decoded = percent_decode(&uri);
    if let Some(idx) = decoded.find("://") {
        let after = &decoded[idx + 3..];
        let path = after
            .strip_prefix("localhost")
            .unwrap_or(after);
        return Ok(path.to_string());
    }
    if let Some(path) = decoded.strip_prefix("file:") {
        return Ok(path.to_string());
    }
    Ok(decoded)
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16)
            {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn files_from_paths<I, S>(paths: I) -> Vec<ClipboardFile>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut out = Vec::new();
    for (index, raw) in paths.into_iter().enumerate() {
        let path = Path::new(raw.as_ref());
        if !path.is_file() {
            continue;
        }
        let suffix = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let mime = match suffix.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "gif" => "image/gif",
            "bmp" => "image/bmp",
            "tif" | "tiff" => "image/tiff",
            _ => continue,
        };
        let Ok(data) = std::fs::read(path) else {
            continue;
        };
        if data.is_empty() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| filename_for_mime(mime, index));
        out.push(ClipboardFile {
            name,
            mime: mime.to_string(),
            b64: base64::engine::general_purpose::STANDARD.encode(data),
        });
    }
    out
}

pub fn file_from_bytes(name: String, mime: String, data: Vec<u8>) -> Option<ClipboardFile> {
    if data.is_empty() || !is_image_mime(&mime) {
        return None;
    }
    Some(ClipboardFile {
        name,
        mime: mime.split(';').next().unwrap_or(&mime).trim().to_string(),
        b64: base64::engine::general_purpose::STANDARD.encode(data),
    })
}

pub fn detect_image_mime(data: &[u8]) -> Option<&'static str> {
    if data.len() >= 8 && data.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    if data.len() >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
        return Some("image/jpeg");
    }
    if data.len() >= 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if data.len() >= 2 && data.starts_with(b"BM") {
        return Some("image/bmp");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mime_and_filename() {
        assert!(is_image_mime("image/png"));
        assert!(is_image_mime("image/jpeg; charset=binary"));
        assert!(is_image_mime("image/jpg"));
        assert!(!is_image_mime("text/plain"));
        assert_eq!(filename_for_mime("image/png", 0), "clipboard.png");
        assert_eq!(filename_for_mime("image/jpeg", 1), "clipboard-2.jpg");
    }

    #[test]
    fn ingest_js_defines_helper() {
        assert!(INGEST_JS.contains("window.__dshDesktopPasteFiles"));
        assert!(INGEST_JS.contains("window.__dshDesktopIngestFiles"));
        assert!(INGEST_JS.contains("/modlens/paste"));
        assert!(INGEST_JS.contains("ClipboardEvent"));
        assert!(INGEST_JS.contains("DragEvent"));
        assert!(INGEST_JS.contains("new File"));
        assert!(INGEST_JS.contains("__dshDesktopLooksLikeImagePath"));
    }

    #[test]
    fn sniffs_image_magic() {
        assert_eq!(
            detect_image_mime(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 1]),
            Some("image/png")
        );
        assert_eq!(detect_image_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(detect_image_mime(b"not-an-image"), None);
    }

    #[test]
    fn build_ingest_call_embeds_payload() {
        let files = [ClipboardFile {
            name: "shot.png".into(),
            mime: "image/png".into(),
            b64: base64::engine::general_purpose::STANDARD.encode(b"\x89PNG"),
        }];
        let script = build_ingest_call(&files);
        assert!(script.contains("__dshDesktopPasteFiles"));
        assert!(script.contains("shot.png"));
        assert!(script.contains("image/png"));
        assert!(!script.contains(", \"hi\""));
    }

    #[test]
    fn parse_file_uri() {
        let payload = "# comment\nfile:///home/me/Pictures/shot.png\n";
        assert_eq!(
            parse_uri_list(payload),
            vec!["/home/me/Pictures/shot.png".to_string()]
        );
    }

    #[test]
    fn parse_plain_path() {
        assert_eq!(parse_uri_list("/tmp/a.jpg"), vec!["/tmp/a.jpg".to_string()]);
    }

    #[test]
    fn skips_non_images() {
        assert!(files_from_paths(["/no/such/file.txt"]).is_empty());
    }
}
