use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::ScriptBlock;

const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const PRIME: u64 = 0x0000_0100_0000_01b3;
const SEPARATOR: u8 = 0xff;

pub fn base_rev(blocks: &[ScriptBlock], extra_cast: &[CastMember]) -> String {
    let mut hash = OFFSET;
    for block in blocks {
        let ms = block.ms.to_string();
        for part in [
            &block.id,
            &block.kind,
            &block.text,
            &block.who,
            &block.paren,
            &ms,
        ] {
            feed(&mut hash, part);
        }
    }
    feed(&mut hash, "|");
    for member in extra_cast {
        feed(&mut hash, &member.id);
    }
    format!("{hash:016x}")
}

fn feed(hash: &mut u64, text: &str) {
    for byte in text.bytes().chain([SEPARATOR]) {
        *hash ^= u64::from(byte);
        *hash = hash.wrapping_mul(PRIME);
    }
}
