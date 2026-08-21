use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde::de::Error;
use serde_yaml_ng::Mapping;
use std::sync::OnceLock;

const FILE: &str = "ontology.yml";
const RAW: &str = include_str!("ontology.yml");

static ONTOLOGY: OnceLock<Ontology> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PredicateKind {
    Scalar,
    Relationship,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypeDef {
    pub key: String,
    pub abstract_: bool,
    pub properties: Vec<String>,
    pub hint: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PredicateDef {
    pub key: String,
    pub kind: PredicateKind,
    pub domain: Vec<String>,
    pub range: Vec<String>,
    pub single: bool,
    pub unique_range: bool,
    pub hint: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuleDef {
    pub key: String,
    pub severity: Severity,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ontology {
    pub version: u32,
    pub types: Vec<TypeDef>,
    pub predicates: Vec<PredicateDef>,
    pub rules: Vec<RuleDef>,
}

#[derive(Deserialize)]
struct RawOntology {
    version: u32,
    entity_types: Mapping,
    scalars: Mapping,
    relationships: Mapping,
    rules: Mapping,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawType {
    #[serde(rename = "abstract", default)]
    abstract_: bool,
    #[serde(default)]
    properties: Vec<String>,
    hint: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawPredicate {
    domain: Vec<String>,
    #[serde(default)]
    range: Vec<String>,
    #[serde(default)]
    single: bool,
    #[serde(default)]
    unique_range: bool,
    hint: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRule {
    severity: Severity,
}

impl Ontology {
    pub fn get() -> &'static Ontology {
        ONTOLOGY.get_or_init(|| {
            Ontology::parse(RAW).unwrap_or_else(|error| panic!("invalid {FILE}: {error}"))
        })
    }

    pub fn raw() -> &'static str {
        RAW
    }

    fn parse(text: &str) -> Result<Ontology, serde_yaml_ng::Error> {
        let raw: RawOntology = serde_yaml_ng::from_str(text)?;
        let types = entries::<RawType>(raw.entity_types)?
            .into_iter()
            .map(|(key, item)| TypeDef {
                key,
                abstract_: item.abstract_,
                properties: item.properties,
                hint: item.hint,
            })
            .collect();
        let mut predicates = predicates_of(raw.scalars, PredicateKind::Scalar)?;
        predicates.extend(predicates_of(
            raw.relationships,
            PredicateKind::Relationship,
        )?);
        let rules = entries::<RawRule>(raw.rules)?
            .into_iter()
            .map(|(key, item)| RuleDef {
                key,
                severity: item.severity,
            })
            .collect();
        Ok(Ontology {
            version: raw.version,
            types,
            predicates,
            rules,
        })
    }
}

fn entries<T: DeserializeOwned>(map: Mapping) -> Result<Vec<(String, T)>, serde_yaml_ng::Error> {
    let mut out = Vec::with_capacity(map.len());
    for (key, value) in map {
        let key = key
            .as_str()
            .ok_or_else(|| serde_yaml_ng::Error::custom("map key must be a string"))?
            .to_string();
        out.push((key, serde_yaml_ng::from_value(value)?));
    }
    Ok(out)
}

fn predicates_of(
    map: Mapping,
    kind: PredicateKind,
) -> Result<Vec<PredicateDef>, serde_yaml_ng::Error> {
    Ok(entries::<RawPredicate>(map)?
        .into_iter()
        .map(|(key, item)| PredicateDef {
            key,
            kind,
            domain: item.domain,
            range: item.range,
            single: item.single,
            unique_range: item.unique_range,
            hint: item.hint,
        })
        .collect())
}

#[cfg(test)]
#[path = "../../../test/features/knowledge/ontology.test.rs"]
mod tests;
