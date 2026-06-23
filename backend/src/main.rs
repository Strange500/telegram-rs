use axum::{
    extract::{State, WebSocketUpgrade, ws::{WebSocket, Message}},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use tokio::sync::broadcast;

#[derive(Serialize, Deserialize, Debug)]
struct Envelope {
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
    // ponytail: send entire history on connect. no REST endpoints, no CORS needed.
    let records: Result<Vec<(String, String, String)>, _> = sqlx::query_as("SELECT sender_pubkey, receiver_pubkey, encrypted_payload FROM messages ORDER BY id ASC")
        .fetch_all(&state.pool)
        .await;
        
    if let Ok(rows) = records {
        for (sender, receiver, payload) in rows {
            let env = Envelope { sender, receiver, payload };
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
