// Générateur d'adresses Solana qui commencent (ou finissent, option --end) par un texte (format de fichier solana-keygen).
use ed25519_dalek::SigningKey;
use rand::RngCore;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let prefix = a[1].clone(); let count: usize = a[2].parse().unwrap(); let out = a[3].clone();
    let end = a.iter().any(|x| x == "--end");
    std::fs::create_dir_all(&out).unwrap();
    let done = Arc::new(AtomicUsize::new(std::fs::read_dir(&out).unwrap().count()));
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let hs: Vec<_> = (0..threads).map(|_| { let (p, o, d, e) = (prefix.clone(), out.clone(), done.clone(), end); std::thread::spawn(move || {
        let mut rng = rand::thread_rng(); let mut seed = [0u8; 32];
        while d.load(Ordering::Relaxed) < count {
            rng.fill_bytes(&mut seed);
            let sk = SigningKey::from_bytes(&seed); let pk = sk.verifying_key().to_bytes();
            let s = bs58::encode(pk).into_string();
            if (e && s.ends_with(&p)) || (!e && s.starts_with(&p)) {
                let mut full = seed.to_vec(); full.extend_from_slice(&pk);
                let j = format!("[{}]", full.iter().map(|b| b.to_string()).collect::<Vec<_>>().join(","));
                std::fs::write(format!("{}/{}.json", o, s), j).unwrap();
                let n = d.fetch_add(1, Ordering::Relaxed) + 1; eprintln!("{} {}", n, s);
            }
        }
    })}).collect();
    for h in hs { h.join().unwrap(); }
}
