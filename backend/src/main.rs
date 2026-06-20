use axum::{extract::State, routing::get, Router};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};

#[tokio::main]
async fn main() {
    // ponytail: stdlib only for env vars. crash early if missing.
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    
    let pool = PgPoolOptions::new()
        .connect(&db_url)
        .await
        .expect("Failed to connect to Postgres");

    let app = Router::new()
        .route("/", get(health_check))
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Listening on port 3000");
    axum::serve(listener, app).await.unwrap();
}

async fn health_check(State(pool): State<Pool<Postgres>>) -> String {
    // ponytail: simplest possible db check to prove it works
    let row: Result<(i32,), _> = sqlx::query_as("SELECT 1").fetch_one(&pool).await;
    match row {
        Ok(_) => "Zero Trust MVP Backend - DB OK".into(),
        Err(e) => format!("DB Error: {}", e),
    }
}
