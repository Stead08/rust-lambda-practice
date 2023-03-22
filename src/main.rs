use std::env;
use std::fmt::Debug;
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use aws_sdk_dynamodb::Client;
use aws_sdk_dynamodb::model::AttributeValue;
use lambda_http::aws_lambda_events::serde_json;
use uuid::Uuid;

#[derive(serde::Deserialize, serde::Serialize, Debug)]
struct User {
    name: String,
    age: u16,
}

//lambdaイベントハンドラ
async fn function_handler(db_client: &Client, event: Request) -> Result<Response<Body>, Error> {
    let json = std::str::from_utf8(event.body()).expect("illegal body");
    tracing::info!(payload = %json, "JSON Payload received");
    let user = serde_json::from_str::<User>(json).expect("parse error");

    let user_id = Uuid::new_v4();
    let dynamo_req = db_client.put_item()
        .table_name(env::var("USER_TABLE").expect("env(USER_TABLE) not found."))
        .item("user_id", AttributeValue::S(user_id.to_string().into()))
        .item("name", AttributeValue::S(user.name))
        .item("age", AttributeValue::S(user.age.to_string()));
    tracing::info!(user_id = ?user_id, "Sending request to DynamoDB...");
    let result = dynamo_req.send().await.expect("dynamodb error");
    tracing::info!(result = ?result, "DynamoDB Output");
    let resp = Response::builder()
        .status(200)
        .header("content-type", "text/html")
        .body("Hello AWS Lambda HTTP request".into())
        .map_err(Box::new)?;
    Ok(resp)
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        // disable printing the name of the module in every log line.
        .with_target(false)
        // disabling time is handy because CloudWatch will add the ingestion time.
        .without_time()
        .init();

    let client = Client::new(&aws_config::load_from_env().await);
    tracing::info!(client = ?client, "Created DynamoDB");

    run(service_fn(|event| async {
        function_handler(&client, event).await
    })).await
}
