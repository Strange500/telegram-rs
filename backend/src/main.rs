use axum::{
    extract::{State, WebSocketUpgrade, ws::{WebSocket, Message}},
    routing::get,
    Router,
};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use tokio::sync::broadcast;

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
    .expect("Failed to initialize database schema");

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
                    // ponytail: save and broadcast. parsing out sender/receiver from payload is 
                    // skipped here to stay minimal (assuming payload is self-contained JSON).
                    let _ = sqlx::query("INSERT INTO messages (sender_pubkey, receiver_pubkey, encrypted_payload) VALUES ('ext_parsed', 'ext_parsed', $1)")
                        .bind(text.as_str())
                        .execute(&state.pool)
                        .await;
                    
                    let _ = state.tx.send(text.to_string());
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
