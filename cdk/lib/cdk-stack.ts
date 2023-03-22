import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Effect } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { RustFunction } from 'cargo-lambda-cdk';
import {RemovalPolicy} from "aws-cdk-lib";

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stage = this.node.tryGetContext('stage');

    // DynamoDBテーブル
    const userTable = new dynamodb.Table(this, 'UserTable', {
      tableName: `user-table-${stage}`,
      partitionKey: {
        type: AttributeType.STRING,
        name: 'user_id'
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Lambda実行ロール
    const role = new iam.Role(this, 'RustLambdaRole', {
      roleName: 'MyRustLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
      inlinePolicies: {
        UserTablePut: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ['dynamodb:PutItem'],
            effect: Effect.ALLOW,
            resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/user-table-*`]
          })]
        })
      }
    });

    // cargo-lambda: Rust Lambda関数
    const func = new RustFunction(this, 'sample-rust-lambda', {
      manifestPath: '../Cargo.toml',
      functionName: 'sample-rust-lambda',
      description: 'Sample Rust Lambda Function',
      environment: {
        USER_TABLE: userTable.tableName
      },
      role
    });

    // API Gateway(エンドポイント: POST /user)
    const api = new apigateway.RestApi(this, 'MyRustAPI', {
      deployOptions: {
        stageName: stage
      }
    });
    api.root.addResource('user')
        .addMethod('POST', new apigateway.LambdaIntegration(func));

    // CFn Outputs
    new cdk.CfnOutput(this, 'LambdaName', {
      value: func.functionName
    });
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.urlForPath('/user') // APIエンドポイント出力
    });
  }
}