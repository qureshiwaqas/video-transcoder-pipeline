"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const client = new client_sqs_1.SQSClient({
    region: "ca-central-1",
    credentials: {
        accessKeyId: "",
        secretAccessKey: ""
    },
});
const escClient = new client_ecs_1.ECSClient({
    region: "ca-central-1",
    credentials: {
        accessKeyId: "",
        secretAccessKey: ""
    },
});
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        const command = new client_sqs_1.ReceiveMessageCommand({
            QueueUrl: "https://sqs.ca-central-1.amazonaws.com/344999084722/temp-videos-queue-wqureshi",
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20,
        });
        while (true) {
            const { Messages } = yield client.send(command);
            if (!Messages) {
                console.log(`No message in Queue`);
                continue;
            }
            try {
                for (const message of Messages) {
                    const { MessageId, Body } = message;
                    console.log(`Message Received`, { MessageId, Body });
                    // validate the event
                    if (!Body)
                        continue;
                    const event = JSON.parse(Body);
                    //ignoring the test event
                    if ("Service" in event && "Event" in event) {
                        if (event.Event === "s3:TestEvent") {
                            yield client.send(new client_sqs_1.DeleteMessageCommand({
                                QueueUrl: "https://sqs.ca-central-1.amazonaws.com/344999084722/temp-videos-queue-wqureshi",
                                ReceiptHandle: message.ReceiptHandle,
                            }));
                            continue;
                        }
                        ;
                    }
                    for (const record of event.Records) {
                        const { s3 } = record;
                        const { bucket, object: { key } } = s3;
                        // spin docker
                        const runTaskCommand = new client_ecs_1.RunTaskCommand({
                            taskDefinition: "arn:aws:ecs:ca-central-1:344999084722:task-definition/video-transcoder",
                            cluster: "arn:aws:ecs:ca-central-1:344999084722:cluster/dev",
                            launchType: "FARGATE",
                            networkConfiguration: {
                                awsvpcConfiguration: {
                                    assignPublicIp: "ENABLED",
                                    securityGroups: ["sg-013b85a6d518acb6b"],
                                    subnets: [
                                        "subnet-07adac69550f3f8a3",
                                        "subnet-00138dd1c452fb09f",
                                        "subnet-0dc5bedaa184c7afb"
                                    ],
                                },
                            },
                            overrides: {
                                containerOverrides: [{ name: "video-transcoder",
                                        environment: [
                                            { name: "BUCKET_NAME", value: bucket.name },
                                            { name: "KEY", value: key }
                                        ], },],
                            },
                        });
                        yield escClient.send(runTaskCommand);
                        // delete message from queue not to run in a loop
                        yield client.send(new client_sqs_1.DeleteMessageCommand({
                            QueueUrl: "https://sqs.ca-central-1.amazonaws.com/344999084722/temp-videos-queue-wqureshi",
                            ReceiptHandle: message.ReceiptHandle,
                        }));
                    }
                }
            }
            catch (err) {
                console.log(err);
            }
        }
    });
}
init();
