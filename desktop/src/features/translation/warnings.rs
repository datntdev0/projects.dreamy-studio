use crate::features::novel::models::Paragraph;
use crate::features::translation::models::ChapterFile;
use crate::features::translation::models::DictEntry;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WarningKind {
    Source,
    Dict,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationWarning {
    pub kind: WarningKind,
    pub chapter_id: String,
    pub n: usize,
    pub entry_id: Option<i64>,
}

pub fn chapter_warnings(
    chapter_id: &str,
    original: &[Paragraph],
    translated: &ChapterFile,
    dict: &[DictEntry],
) -> Vec<TranslationWarning> {
    let mut warnings = Vec::new();

    for (index, (original, translated)) in original
        .iter()
        .zip(translated.paragraphs.iter())
        .enumerate()
    {
        let n = index + 1;
        if original.hashcheck != translated.original_hashcheck {
            warnings.push(warning(WarningKind::Source, chapter_id, n, None));
        }

        let original_text = original.text.to_lowercase();
        let translated_text = translated.text.to_lowercase();
        for entry in dict {
            let src = entry.src.trim();
            if !src.is_empty()
                && original_text.contains(&src.to_lowercase())
                && !translated_text.contains(&entry.dst.to_lowercase())
            {
                warnings.push(warning(WarningKind::Dict, chapter_id, n, Some(entry.id)));
            }
        }
    }

    warnings
}

fn warning(
    kind: WarningKind,
    chapter_id: &str,
    n: usize,
    entry_id: Option<i64>,
) -> TranslationWarning {
    TranslationWarning {
        kind,
        chapter_id: chapter_id.to_string(),
        n,
        entry_id,
    }
}

#[cfg(test)]
#[path = "../../../test/features/translation/warnings.test.rs"]
mod tests;
