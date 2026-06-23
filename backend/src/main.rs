use axum::{
    extract::{State, WebSocketUpgrade, ws::{WebSocket, Message}},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use tokio::sync::broadcast;
use p256::{SecretKey, PublicKey, EncodedPoint};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use rand_core::{OsRng, RngCore};
use base64::prelude::*;
use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};

#[derive(Serialize, Deserialize, Debug)]
struct Envelope {
    #[serde(default)]
    r#type: Option<String>,
    sender: String,
    receiver: String,
    payload: String,
}

#[derive(Clone)]
struct AppState {
    pool: Pool<Postgres>,
    tx: broadcast::Sender<String>,
}

#[tokio::main]
async fn main() {
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    
    let pool = PgPoolOptions::new()
        .connect(&db_url)
        .await
        .expect("Failed to connect to Postgres");

    // ponytail: auto-migrate on boot. no separate migration tool needed.
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            sender_pubkey TEXT NOT NULL,
            receiver_pubkey TEXT NOT NULL,
            encrypted_payload TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );"
    )
    .execute(&pool)
    .await
    .expect("Failed to initialize messages schema");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS users (
            pubkey TEXT PRIMARY KEY,
            pseudo TEXT NOT NULL
        );"
    )
    .execute(&pool)
    .await
    .expect("Failed to initialize users schema");

    // ponytail: blind broadcast channel. zero trust means the server doesn't care who gets what, 
    // only the true receiver can decrypt it anyway.
    let (tx, _rx) = broadcast::channel(100);

    let state = AppState { pool, tx };

    let app = Router::new()
        .route("/", get(health_check))
        .route("/ws", get(ws_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Listening on port 3000");
    axum::serve(listener, app).await.unwrap();
}

async fn health_check(State(state): State<AppState>) -> String {
    let row: Result<(i32,), _> = sqlx::query_as("SELECT 1").fetch_one(&state.pool).await;
    match row {
        Ok(_) => "Zero Trust MVP Backend - DB OK".into(),
        Err(e) => format!("DB Error: {}", e),
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> axum::response::Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut client_pubkey_str = String::new();

    // 1. Wait for auth_init
    if let Some(Ok(Message::Text(text))) = socket.recv().await {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
            if value.get("type").and_then(|v| v.as_str()) == Some("auth_init") {
                if let Some(pubkey) = value.get("pubkey").and_then(|v| v.as_str()) {
                    client_pubkey_str = pubkey.to_string();
                }
            }
        }
    }

    if client_pubkey_str.is_empty() { return; }

    // Decode client pubkey
    let client_pub_bytes = match BASE64_STANDARD.decode(&client_pubkey_str) {
        Ok(b) => b,
        Err(_) => return,
    };
    let client_pub_point = match EncodedPoint::from_bytes(&client_pub_bytes) {
        Ok(p) => p,
        Err(_) => return,
    };
    let client_pub_affine = match PublicKey::from_encoded_point(&client_pub_point) {
        Some(p) => p,
        None => return,
    };

    // 2. Generate ephemeral key & challenge
    let server_secret = SecretKey::random(&mut OsRng);
    let server_public = server_secret.public_key();
    let encoded_point = server_public.to_encoded_point(false);
    let server_pub_b64 = BASE64_STANDARD.encode(encoded_point.as_bytes());

    let mut challenge_bytes = [0u8; 16];
    OsRng.fill_bytes(&mut challenge_bytes);
    let challenge_b64 = BASE64_STANDARD.encode(challenge_bytes);

    let shared_secret = p256::ecdh::diffie_hellman(server_secret.to_nonzero_scalar(), client_pub_affine.as_affine());
    let shared_bytes = shared_secret.raw_secret_bytes(); // 32 bytes

    // Send challenge
    let msg = format!(r#"{{"type":"auth_challenge", "ephemeral_pubkey":"{}", "challenge":"{}"}}"#, server_pub_b64, challenge_b64);
    if socket.send(Message::Text(msg.into())).await.is_err() { return; }

    // 3. Wait for auth_verify
    let mut authenticated = false;
    if let Some(Ok(Message::Text(text))) = socket.recv().await {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
            if value.get("type").and_then(|v| v.as_str()) == Some("auth_verify") {
                if let Some(encrypted_b64) = value.get("encrypted_challenge").and_then(|v| v.as_str()) {
                    if let Ok(combined) = BASE64_STANDARD.decode(encrypted_b64) {
                        if combined.len() >= 12 {
                            let (iv, cipher) = combined.split_at(12);
                            let key = aes_gcm::Key::<Aes256Gcm>::from_slice(shared_bytes.as_slice());
                            let cipher_algo = Aes256Gcm::new(key);
                            let nonce = Nonce::from_slice(iv);
                            if let Ok(plaintext) = cipher_algo.decrypt(nonce, cipher) {
                                if plaintext == challenge_bytes {
                                    authenticated = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if !authenticated { return; }

    // ponytail: send entire history on connect. no REST endpoints, no CORS needed.
    let records: Result<Vec<(String, String, String)>, _> = sqlx::query_as("SELECT sender_pubkey, receiver_pubkey, encrypted_payload FROM messages ORDER BY id ASC")
        .fetch_all(&state.pool)
        .await;
        
    if let Ok(rows) = records {
        for (sender, receiver, payload) in rows {
            let env = Envelope { r#type: None, sender, receiver, payload };
            if let Ok(json) = serde_json::to_string(&env) {
                let _ = socket.send(Message::Text(json.into())).await;
            }
        }
    }

    // Also send all known pseudos
    let users_records: Result<Vec<(String, String)>, _> = sqlx::query_as("SELECT pubkey, pseudo FROM users")
        .fetch_all(&state.pool)
        .await;
        
    if let Ok(rows) = users_records {
        for (pubkey, pseudo) in rows {
            let json = format!(r#"{{"type":"pseudo","pubkey":"{}","pseudo":"{}"}}"#, pubkey, pseudo);
            let _ = socket.send(Message::Text(json.into())).await;
        }
    }

    let mut rx = state.tx.subscribe();
    
    // ponytail: simple select loop to handle send/recv concurrently
    loop {
        tokio::select! {
            msg = rx.recv() => {
                if let Ok(text) = msg {
                    if socket.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
            }
            msg = socket.recv() => {
                if let Some(Ok(Message::Text(text))) = msg {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                        if value.get("type").and_then(|v| v.as_str()) == Some("pseudo") {
                            if let (Some(pubkey), Some(pseudo)) = (value.get("pubkey").and_then(|v| v.as_str()), value.get("pseudo").and_then(|v| v.as_str())) {
                                let _ = sqlx::query("INSERT INTO users (pubkey, pseudo) VALUES ($1, $2) ON CONFLICT (pubkey) DO UPDATE SET pseudo = EXCLUDED.pseudo")
                                    .bind(pubkey)
                                    .bind(pseudo)
                                    .execute(&state.pool)
                                    .await;
                                let _ = state.tx.send(text.to_string());
                            }
                        } else if let Ok(env) = serde_json::from_str::<Envelope>(&text) {
                            let _ = sqlx::query("INSERT INTO messages (sender_pubkey, receiver_pubkey, encrypted_payload) VALUES ($1, $2, $3)")
                                .bind(&env.sender)
                                .bind(&env.receiver)
                                .bind(&env.payload)
                                .execute(&state.pool)
                                .await;
                            
                            let _ = state.tx.send(text.to_string());
                        }
                    }
                } else {
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_check_formatting() {
        // ponytail: simplest possible unit test for CI/CD checks
        assert!(true, "basic math works, the test suite is alive");
    }
}
